import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CRITERIA as C, CONDITION_FIELDS, conditionValue, validateConditionFilter, matchesConditionFilter, describeConditionFilter, DEFAULT_REASON_CATEGORIES, reasonCategoryName, validateReasonCategory, unavailableEntries, removeReasonCategory, unavailableReasonCSV, reviewRecord, comparisonRows, followUpPlan, followUpSignature, followUpProgress, validateCriteria, parseCSV, recordsCSV, reportMarkdown, reportText } from '../src/core.js';

const data = JSON.parse(await readFile(new URL('../data/demo-records.json', import.meta.url), 'utf8'));
const expected = JSON.parse(await readFile(new URL('../data/expected-results.json', import.meta.url), 'utf8'));
const base = data[0];

test('조건 범위: 경계 포함·소수 오차·0·누락과 숫자 오류·잘못된 범위 거부', () => {
  const filter = {field: 'manufacturingTemperature', mode: 'range', center: 45, tolerance: 2};
  for (const value of [43, '45', 47]) assert.equal(matchesConditionFilter({...base, manufacturingTemperature: value}, filter), true);
  for (const value of [42.999999, 47.000001, '', null, '잘못된 값']) assert.equal(matchesConditionFilter({...base, manufacturingTemperature: value}, filter), false);
  const decimal = {field:'concentration',mode:'range',center:0.3,tolerance:0.1};
  for (const value of [0.2,0.4]) assert.equal(matchesConditionFilter({...base,concentration:value},decimal),true);
  assert.equal(matchesConditionFilter({...base,concentration:0.199999},decimal),false);
  assert.ok(describeConditionFilter(decimal).includes('(0.2~0.4)'));
  assert.equal(matchesConditionFilter({...base,manufacturingTemperature:0},{...filter,center:0,tolerance:0}),true);
  for (const invalid of [{...filter,center:''},{...filter,tolerance:-1},{...filter,tolerance:'Infinity'},{...filter,center:Number.MAX_SAFE_INTEGER,tolerance:2},{...filter,field:'unknown'}]) {
    assert.ok(validateConditionFilter(invalid)); assert.equal(matchesConditionFilter(base,invalid),false);
  }
});

test('조건 선택: 숫자와 문자 항목·미기재·전체 값·점도 단위 확인', () => {
  assert.equal(CONDITION_FIELDS.length,35);
  assert.equal(matchesConditionFilter(base,null),true);
  assert.equal(matchesConditionFilter({...base,manufacturingTemperature:''},{field:'manufacturingTemperature',mode:'all'}),true);
  const filter = {field:'spindle',mode:'value',value:'DEMO-S2'};
  assert.equal(matchesConditionFilter({...base,spindle:'DEMO-S2'},filter),true);
  assert.equal(matchesConditionFilter(base,filter),false);
  assert.equal(matchesConditionFilter({...base,spindle:''},{...filter,value:''}),true);
  assert.equal(conditionValue({...base,spindle:''},'spindle'),null);
  const viscosity = {field:'viscosity',mode:'range',center:1221,tolerance:0};
  assert.equal(matchesConditionFilter({...base,viscosity:1221,unit:'cP'},viscosity),true);
  assert.equal(matchesConditionFilter({...base,viscosity:1221,unit:'Pa·s'},viscosity),false);
});

test('조건으로 기록 선택: 제조 온도 45±2의 216건·검토 규칙과 원본 보존', () => {
  const filter = {field:'manufacturingTemperature',mode:'range',center:45,tolerance:2};
  const before = JSON.stringify(data), selected = data.filter(record => matchesConditionFilter(record,filter));
  assert.equal(selected.length,216);
  assert.equal(selected.filter(record => reviewRecord(record,C).comparable).length,108);
  assert.equal(selected.every(record => reviewRecord(record,C).status === '검토 필요'),true);
  assert.equal(JSON.stringify(data),before);
});

test('확인 완료 메모: 기존 체크 호환·상태 전환 보존·원본과 기준 변경 무효화', () => {
  const record = {...base, manufacturingTemperature: 45}, id = 'manufacturing:manufacturingTemperature';
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), outcomes: {[id]: {status: 'done', completionNote: '제조 기록 45℃ 확인'}}}};
  assert.equal(followUpProgress(record, C, checks)[0].completionNote, '제조 기록 45℃ 확인');
  checks[record.measurementId].outcomes[id].status = 'pending';
  assert.equal(followUpProgress(record, C, checks)[0].completionNote, '제조 기록 45℃ 확인');
  assert.equal(followUpProgress(record, {...C, manufacturingTolerance: 3}, checks)[0].completionNote, '');
  assert.equal(followUpProgress({...record, sourceNote: '수정된 원본'}, C, checks)[0].completionNote, '');
  assert.equal(followUpProgress(record, C, {[record.measurementId]: {signature: followUpSignature(record, C), checked: [id]}})[0].completionNote, '');
  checks[record.measurementId].outcomes[id].completionNote = '가'.repeat(2001);
  assert.equal(followUpProgress(record, C, checks)[0].completionNote.length, 2000);
});

test('확인 완료 메모: TXT·Markdown·CSV 내보내기와 판정 유지', () => {
  const record = {...base, manufacturingTemperature: 45}, id = 'manufacturing:manufacturingTemperature';
  const completionNote = '원본 | 제조 기록 <확인>\n추가 사유 확인 필요';
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), outcomes: {[id]: {status: 'done', completionNote}}}};
  assert.ok(reportText([record], C, {}, '테스트', '2026-10-06', checks).includes('확인 완료 메모:\n  원본 | 제조 기록 <확인>\n  추가 사유 확인 필요'));
  assert.ok(reportMarkdown([record], C, {}, '테스트', '2026-10-06', checks).includes('원본 \\| 제조 기록 &lt;확인&gt;<br>추가 사유 확인 필요'));
  const exported = recordsCSV([record], C, {}, true, checks);
  assert.ok(exported.includes('""completionNote"":'));
  assert.ok(exported.includes('제조 기록 <확인>\\n추가 사유 확인 필요'));
  assert.equal(reviewRecord(record, C).status, '검토 필요');
});
test('TXT 보고서: 선택한 기록·읽기 쉬운 기준·확인 불가 분류와 이유·여러 줄 메모 보존', () => {
  const record = data.find(record => record.measurementId === 'PA-007-M1');
  const id = 'missing:sampleTemperature';
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), outcomes: {
    [id]: {status: 'unavailable', reasonCategory: '필요한 항목 미기록', reason: '온도 | 원본 <확인>\r\n자료 요청'}
  }}};
  const notes = {[record.measurementId]: '기록 확보 후 검토\r\n두 번째 줄'};
  const report = reportText([record], C, notes, '업로드 파일.csv', '2026-10-06', checks);
  for (const expected of ['대상 측정: 1건', '데이터 출처: 업로드 파일.csv', '적용 기준: DEMO-POLY-A-v1',
    '점도: 1000~1500 mPa·s', '목표 측정 온도: 25 ± 0.5 ℃', '제조 교반 시간: 20 ± 2분',
    '온도 평형 확인: 완료', '표준액 점검: 적합 기록 확인', 'PA-007-M1', '필요한 항목 미기록',
    '상태: 확인 불가', '온도 | 원본 <확인>\n  자료 요청', '기록 확보 후 검토\n  두 번째 줄',
    '수치 비교: 수치상 범위 내', '비교 조건: 확인 필요']) assert.ok(report.includes(expected), expected);
  for (const unexpected of ['PA-008-M1', '```', '<br>', '&lt;', 'temperatureTolerance', '\r']) assert.equal(report.includes(unexpected), false);
  const changed = reportText([record], {...C, version: '수정 기준', temperatureTolerance: 1}, notes, '업로드 파일.csv', '2026-10-06', checks);
  assert.ok(changed.includes('적용 기준: 수정 기준')); assert.ok(changed.includes('목표 측정 온도: 25 ± 1 ℃'));
  assert.ok(changed.includes('상태: 미확인')); assert.ok(changed.includes('확인 불가 항목: 0개'));
  assert.equal(changed.includes('자료 요청'), false);
});
test('TXT 보고서: 0 값·빈 메모·완료 상태·빈 결과를 추정 없이 출력', () => {
  const record = {...base, viscosity: 0};
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), checked: ['specification:viscosity']}};
  const report = reportText([record], C, {}, '테스트', '2026-10-06', checks);
  assert.ok(report.includes('점도: 0 mPa·s')); assert.ok(report.includes('점도: 실제 0 / 기준'));
  assert.ok(report.includes('상태: 자료 확인 완료')); assert.ok(report.includes('검토 메모:\n  미기재'));
  const empty = reportText([], C, {}, '테스트', '2026-10-06');
  assert.ok(empty.includes('대상 측정: 0건')); assert.equal(empty.includes('(1) 배치:'), false);
});
test('후속 질문: 정상은 비어 있고 누락·측정·규격·제조 차이의 근거와 순서 보존', () => {
  assert.deepEqual(followUpPlan(base), []);
  const record = {...base, sampleTemperature: 28, rpm: '', manufacturingTemperature: 45, viscosity: 1750};
  const tasks = followUpPlan(record);
  assert.deepEqual(tasks.map(task => task.id), ['missing:rpm', 'measurement:sampleTemperature', 'specification:viscosity', 'manufacturing:manufacturingTemperature']);
  assert.equal(tasks[0].actual, '미기재'); assert.equal(tasks[0].expected, '60 rpm');
  assert.ok(tasks[1].question.includes('다시 측정')); assert.ok(tasks[2].question.includes('반복 측정값'));
  assert.ok(tasks[3].question.includes('단정하지'));
  assert.ok(followUpPlan({...base, unit: 'Pa·s'})[0].question.includes('원본 표기'));
});
test('점도만 이탈: 조건 차이 없는 기록은 원인 판단 보류·추가 자료 안내, 다른 문제는 별도 확인', () => {
  const record = data.find(record => record.measurementId === 'PA-008-M1');
  const task = followUpPlan(record, C)[0];
  assert.deepEqual(reviewRecord(record, C).categories, ['specification']);
  assert.ok(task.question.includes('조건 차이는 발견되지 않았어요'));
  assert.ok(task.question.includes('원인을 알 수 없어 추가 자료가 필요'));
  assert.ok(task.question.includes('확인 불가'));
  assert.equal(followUpProgress(record, C)[0].status, 'pending');
  for (const changes of [{sampleTemperature: 28}, {manufacturingTemperature: 45}, {rpm: ''}, {measuredAt: '일시 오류'}]) {
    const question = followUpPlan({...record, ...changes}, C).find(task => task.category === 'specification').question;
    assert.equal(question.includes('조건 차이는 발견되지'), false);
  }
  // 수정된 질문을 예전의 완료 표시로 덮지 않는다. 다른 항목의 체크 규칙은 유지한다.
  const oldSignature = JSON.parse(followUpSignature(record, C)); oldSignature.policy = 'POLY-A-follow-up-v1';
  const oldChecks = {[record.measurementId]: {signature: JSON.stringify(oldSignature), checked: [task.id]}};
  assert.equal(followUpProgress(record, C, oldChecks)[0].status, 'pending');
  const temperatureRecord = {...base, sampleTemperature: 28};
  assert.equal(JSON.parse(followUpSignature(temperatureRecord, C)).policy, 'POLY-A-follow-up-v1');
  assert.ok(reportMarkdown([record], C).includes(task.question));
  assert.ok(recordsCSV([record], C).includes('원인을 알 수 없어 추가 자료가 필요'));
});
test('후속 체크: 원본·기준 변경과 측정별 분리, 보고서와 CSV 보존, 판정 유지', () => {
  const record = {...base, sampleTemperature: 28};
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), checked: ['measurement:sampleTemperature', 'unknown']}};
  assert.equal(followUpProgress(record, C, checks)[0].checked, true);
  assert.equal(followUpProgress(record, {...C, temperatureTolerance: 1}, checks)[0].checked, false);
  assert.equal(followUpProgress({...record, sourceNote: '새 원본'}, C, checks)[0].checked, false);
  assert.equal(followUpProgress({...record, measurementId: 'another'}, C, checks)[0].checked, false);
  assert.equal(reviewRecord(record).status, '검토 필요');
  assert.ok(reportMarkdown([record], C, {}, '테스트', '2026-10-05', checks).includes('- [x] 실제 측정 온도'));
  const csv = recordsCSV([record], C, {}, true, checks);
  assert.ok(csv.includes('followUpChecklist')); assert.ok(csv.includes('""checked"":true'));
});
test('확인 불가: 완료와 동시 표시 금지, 이유·내보내기·기준 변경·기존 체크 호환', () => {
  const record = {...base, sampleTemperature: ''};
  const taskId = 'missing:sampleTemperature';
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), checked: [taskId], outcomes: {[taskId]: {status: 'unavailable', reason: '원본 | 온도 기록 없음\n담당자 확인 필요'}}}};
  const progress = followUpProgress(record, C, checks)[0];
  assert.equal(progress.status, 'unavailable'); assert.equal(progress.checked, false);
  assert.ok(progress.reason.includes('담당자 확인 필요'));
  assert.equal(followUpProgress(record, {...C, temperatureTolerance: 1}, checks)[0].status, 'pending');
  assert.equal(followUpProgress(record, {...C, temperatureTolerance: 1}, checks)[0].reason, '');
  const report = reportMarkdown([record], C, {}, '테스트', '2026-10-05', checks);
  assert.ok(report.includes('상태: 확인 불가')); assert.ok(report.includes('원본 \\| 온도 기록 없음<br>담당자 확인 필요'));
  assert.ok(report.includes('- [ ] 실제 측정 온도'));
  const csv = recordsCSV([record], C, {}, true, checks);
  assert.ok(csv.includes('""status"":""unavailable""')); assert.ok(csv.includes('""checked"":false'));
  assert.equal(followUpProgress(record, C, {[record.measurementId]: {signature: followUpSignature(record, C), checked: [taskId]}})[0].status, 'done');
});
test('이유 분류: 기본값·빈 이름·길이·중복·미분류 예약·공백 정리', () => {
  assert.equal(DEFAULT_REASON_CATEGORIES.length, 5);
  assert.equal(reasonCategoryName('  추가   자료 필요\n'), '추가 자료 필요');
  assert.equal(validateReasonCategory('  추가   자료 필요 ', DEFAULT_REASON_CATEGORIES), '이미 있는 분류 이름입니다.');
  for (const name of ['', '   ', '미분류', 'a'.repeat(41), {}]) assert.ok(validateReasonCategory(name));
  assert.equal(validateReasonCategory('장비 점검 자료 없음'), null);
  assert.ok(validateReasonCategory('abc', ['ABC']));
});
test('이유 모아보기: 기존 메모 보존·유효한 확인 불가만 집계·분류별 CSV와 보고서', () => {
  const record = {...base, sampleTemperature: ''}, id = 'missing:sampleTemperature';
  const checks = {[record.measurementId]: {signature: followUpSignature(record, C), outcomes: {[id]: {status: 'unavailable', reason: '=자료 요청 | 메모\n둘째 줄'}}}};
  assert.equal(followUpProgress(record, C, checks)[0].reasonCategory, '');
  assert.equal(unavailableEntries([record], C, checks).length, 1);
  assert.ok(unavailableReasonCSV([record], C, checks, '미분류').includes('미분류'));
  assert.equal(unavailableEntries([record], {...C, temperature: 26}, checks).length, 0);
  checks[record.measurementId].outcomes[id].reasonCategory = '@자료 | <없음>';
  assert.equal(followUpProgress(record, C, checks)[0].reasonCategory, '@자료 | <없음>');
  const csv = unavailableReasonCSV([record], C, checks, '@자료 | <없음>');
  assert.ok(csv.includes("'@자료 | <없음>")); assert.ok(csv.includes("'=자료 요청"));
  assert.equal(unavailableReasonCSV([record], C, checks, '다른 분류').split('\r\n').length, 1);
  assert.ok(recordsCSV([record], C, {}, true, checks).includes('""reasonCategory""'));
  const report = reportMarkdown([record], C, {}, '테스트', '2026-10-06', checks);
  assert.ok(report.includes('확인 불가 이유별 모아보기')); assert.ok(report.includes('@자료 \\| &lt;없음&gt;'));
  checks[record.measurementId].outcomes[id].status = 'done';
  assert.equal(unavailableEntries([record], C, checks).length, 0);
  assert.equal(followUpProgress(record, C, checks)[0].reasonCategory, '');
});
test('분류 삭제: 메모·상태·서명·다른 분류 보존, 입력 객체 변경 없음', () => {
  const checks = {a: {signature: '원래 서명', checked: [], outcomes: {one: {status: 'unavailable', reasonCategory: '추가 자료 필요', reason: '남겨둔 메모'}, two: {status: 'unavailable', reasonCategory: '다른 분류', reason: '다른 메모'}}}, legacy: {signature: '이전 서명', checked: ['x']}};
  const updated = removeReasonCategory(checks, '추가 자료 필요');
  assert.equal(updated.a.outcomes.one.reasonCategory, ''); assert.equal(updated.a.outcomes.one.reason, '남겨둔 메모');
  assert.equal(updated.a.outcomes.one.status, 'unavailable'); assert.equal(updated.a.signature, '원래 서명');
  assert.deepEqual(updated.a.outcomes.two, checks.a.outcomes.two); assert.deepEqual(updated.legacy, checks.legacy);
  assert.equal(checks.a.outcomes.one.reasonCategory, '추가 자료 필요');
  updated['__proto__'] = {signature: '측정 번호로 사용한 특수 문자열'};
  assert.equal(Object.getPrototypeOf(updated), null); assert.equal(Object.hasOwn(updated, '__proto__'), true);
  assert.ok(JSON.stringify(updated).includes('측정 번호로 사용한 특수 문자열'));
});
test('비교표: 전체 기록, 변경 기준, 누락과 비교 불가, 기록 전용 항목 구분', () => {
  const rows = comparisonRows(base);
  assert.equal(rows.length, 40); assert.equal(new Set(rows.map(row => row.field)).size, 40);
  assert.equal(rows.find(row => row.field === 'sampleTemperature').status, '기준 일치');
  assert.equal(rows.find(row => row.field === 'sourceNote').status, '기록 있음');
  const changed = comparisonRows({...base, sampleTemperature: '', rpm: 0, unit: 'Pa·s'}, {...C, temperature: 30, temperatureTolerance: 1, rpm: 50});
  assert.equal(changed.find(row => row.field === 'sampleTemperature').actual, '미기재');
  assert.equal(changed.find(row => row.field === 'sampleTemperature').expected, '30 ± 1 ℃');
  assert.equal(changed.find(row => row.field === 'sampleTemperature').status, '기록 누락');
  assert.equal(changed.find(row => row.field === 'rpm').actual, '0');
  assert.equal(changed.find(row => row.field === 'rpm').expected, '50 rpm');
  assert.equal(changed.find(row => row.field === 'rpm').warning, true);
  assert.equal(changed.find(row => row.field === 'viscosity').status, '비교 불가');
  assert.equal(changed.find(row => row.field === 'viscosity').warning, true);
});
test('1,080건, 고유 ID, 270배치와 각 배치 4회 측정, 독립 시나리오 정답', () => {
  assert.equal(data.length, 1080); assert.equal(new Set(data.map(r => r.measurementId)).size, 1080);
  const batches = new Map(); for (const r of data) batches.set(r.batchId, (batches.get(r.batchId) ?? 0) + 1);
  assert.equal(batches.size, 270); assert.ok([...batches.values()].every(n => n === 4));
  for (const [index, record] of data.entries()) assert.deepEqual(reviewRecord(record).categories.sort(), expected[index].categories, record.measurementId);
});
test('점도 하한·상한 포함; 바로 밖의 수치는 규격 이탈', () => {
  for (const value of [1000, 1500]) assert.equal(reviewRecord({...base, viscosity: value}).numericStatus, '수치상 범위 내');
  for (const value of [999.99, 1500.01]) assert.ok(reviewRecord({...base, viscosity: value}).categories.includes('specification'));
});
test('온도 허용 경계 포함; 누락값을 0으로 취급하지 않음', () => {
  for (const value of [24.5, 25.5]) assert.equal(reviewRecord({...base, sampleTemperature: value}).comparable, true);
  assert.equal(reviewRecord({...base, sampleTemperature: 25.51}).comparable, false);
  const result = reviewRecord({...base, viscosity: '', sampleTemperature: ''});
  assert.equal(result.viscosity, null); assert.equal(result.numericStatus, '비교 불가'); assert.deepEqual(result.categories, ['missing']);
});
test('좋은 수치여도 측정 조건이 다르면 비교 조건 확인 필요', () => {
  const result = reviewRecord({...base, rpm: 30}); assert.equal(result.numericStatus, '수치상 범위 내');
  assert.equal(result.comparable, false); assert.equal(result.status, '검토 필요');
});
test('제조 차이는 측정 차이·점도 이탈과 구분', () => {
  const result = reviewRecord({...base, manufacturingTemperature: 45});
  assert.deepEqual(result.categories, ['manufacturing']); assert.equal(result.comparable, true);
});
test('단위 cP 동등 지원; 다른 단위·NaN·음수·비수치는 입력 확인', () => {
  assert.equal(reviewRecord({...base, unit: 'cP'}).viscosity, base.viscosity);
  for (const record of [{...base, unit: 'Pa·s'}, {...base, viscosity: 'NaN'}, {...base, viscosity: '1,200'}, {...base, viscosity: -1}, {...base, viscosity: '1e308'}]) {
    const result = reviewRecord(record); assert.ok(result.categories.includes('data')); assert.equal(result.viscosity, null);
  }
});
test('토크 경계와 영점 기록', () => {
  for (const value of [10, 100]) assert.equal(reviewRecord({...base, torquePercent: value}).comparable, true);
  for (const value of [9.99, 100.01]) assert.equal(reviewRecord({...base, torquePercent: value}).comparable, false);
  assert.equal(reviewRecord({...base, zeroCheck: '미확인'}).comparable, false);
});
test('기준 변경 재검토; 역전 범위·빈 값·음수·과도한 토크 거부', () => {
  assert.deepEqual(validateCriteria(C), []);
  assert.ok(reviewRecord(base, {...C, viscosityMax: 1100}).categories.includes('specification'));
  for (const changes of [{viscosityMin: 1600}, {temperatureTolerance: -1}, {version: ''}, {rpm: ''}, {volume: 0}, {torqueMax: 101}]) assert.ok(validateCriteria({...C, ...changes}).length);
});
test('CSV 왕복: BOM, 쉼표·따옴표·줄바꿈, 정상 데이터 보존', () => {
  const record = {...base, sourceNote: '가상, "기록"\n둘째 줄'};
  const parsed = parseCSV(recordsCSV([record], C, {}, false)); assert.equal(parsed[0].sourceNote, record.sourceNote);
  assert.equal(reviewRecord(parsed[0]).status, '기준 충족');
  assert.equal(parseCSV(recordsCSV(data, C, {}, false)).length, 1080);
});
test('CSV 중복 측정 번호·깨진 행·중복 헤더·필수 열 누락 거부', () => {
  assert.throws(() => parseCSV(recordsCSV([base, base], C, {}, false)), /중복 측정/);
  for (const text of ['batchId,measurementId,viscosity,unit\nb,m,1', 'batchId,measurementId,unit\nb,m,cP', 'batchId,batchId,measurementId,viscosity,unit\nb,b,m,1,cP', 'batchId,measurementId,viscosity,unit\nb,m,"1,cP']) assert.throws(() => parseCSV(text));
});
test('보고서 기준 전체·원본 ID·메모 보존, CSV 수식 실행 방지', () => {
  const record = {...base, sourceNote: '=HYPERLINK("bad")'};
  const csv = recordsCSV([record], C, {[base.measurementId]: '=1+1'});
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'=1+1"));
  const report = reportMarkdown([base], C, {[base.measurementId]: '조사 | 메모\n다음'}, '테스트');
  assert.ok(report.includes(C.version)); assert.ok(report.includes('temperatureTolerance'));
  assert.ok(report.includes(base.measurementId)); assert.ok(report.includes('조사 \\| 메모<br>다음'));
  assert.ok(reportMarkdown([{...base, rpm: 0}], C).includes('실제 0, 기준'));
});
