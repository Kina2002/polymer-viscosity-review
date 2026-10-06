import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CRITERIA as C, reviewRecord, comparisonRows, followUpPlan, followUpSignature, followUpProgress, validateCriteria, parseCSV, recordsCSV, reportMarkdown } from '../src/core.js';

const data = JSON.parse(await readFile(new URL('../data/demo-records.json', import.meta.url), 'utf8'));
const expected = JSON.parse(await readFile(new URL('../data/expected-results.json', import.meta.url), 'utf8'));
const base = data[0];
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
