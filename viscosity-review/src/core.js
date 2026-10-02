export const DEFAULT_CRITERIA = Object.freeze({
  version: 'DEMO-POLY-A-v1', viscosityMin: 1000, viscosityMax: 1500,
  temperature: 25, temperatureTolerance: 0.5, spindle: 'DEMO-S1', vessel: 'DEMO-600',
  rpm: 60, elapsed: 60, volume: 400, torqueMin: 10, torqueMax: 100,
  manufacturingTemperature: 40, manufacturingTolerance: 2,
  mixingRpm: 300, mixingRpmTolerance: 30, mixingMinutes: 20, mixingMinutesTolerance: 2,
  concentration: 1, concentrationTolerance: 0.05
});

// 원본 열 이름을 고정하고 입력 값은 HTML이나 코드로 실행하지 않는다.
export const FIELDS = [
  ['batchId', '배치 번호'], ['measurementId', '측정 번호'], ['sampleId', '시료 번호'],
  ['repeat', '반복 회차'], ['measuredAt', '측정 일시'], ['product', '제품 코드'],
  ['polymerGrade', '고분자 등급'], ['solvent', '용매'], ['polymerMass', '고분자 질량 (g)'],
  ['solventMass', '용매 질량 (g)'], ['concentration', '농도 (wt%)'],
  ['manufacturingTemperature', '제조 온도 (℃)'], ['mixingRpm', '제조 교반 속도 (rpm)'],
  ['mixingMinutes', '제조 교반 시간 (분)'], ['additionOrder', '투입 순서'],
  ['uniformity', '육안 균일성 확인'], ['uniformityMethod', '균일성 확인 방법'],
  ['storageTemperature', '보관 온도 (℃)'], ['ageHours', '제조 후 경과 시간 (시간)'],
  ['sampleTemperature', '실제 측정 온도 (℃)'], ['thermalEquilibrium', '온도 평형 확인'],
  ['bubbleState', '기포 관찰'], ['preMixing', '측정 전 추가 교반'], ['restMinutes', '휴지 시간 (분)'],
  ['deviceId', '장비 번호'], ['deviceModel', '장비 모델'], ['spindle', '스핀들'],
  ['vessel', '용기'], ['sampleVolume', '시료량 (mL)'], ['immersion', '침지 표시 확인'],
  ['calibrationStatus', '교정 기록 상태'], ['standardCheck', '표준액 점검'],
  ['levelCheck', '수평 확인'], ['zeroCheck', '영점 확인'], ['rpm', '측정 속도 (rpm)'],
  ['elapsedSeconds', '결과를 읽은 시점 (초)'], ['torquePercent', '토크 (%)'],
  ['viscosity', '점도'], ['unit', '점도 단위'], ['sourceNote', '기록 출처']
];
export const LABELS = Object.fromEntries(FIELDS);
export const CATEGORY_LABELS = {
  missing: '기록 누락', data: '입력 확인', manufacturing: '제조 조건 차이',
  measurement: '측정 조건 차이', specification: '점도 규격 이탈'
};
export const NUMERIC_FIELDS = new Set([
  'repeat', 'polymerMass', 'solventMass', 'concentration', 'manufacturingTemperature',
  'mixingRpm', 'mixingMinutes', 'storageTemperature', 'ageHours', 'sampleTemperature',
  'restMinutes', 'sampleVolume', 'rpm', 'elapsedSeconds', 'torquePercent', 'viscosity'
]);
const missing = value => value === null || value === undefined || String(value).trim() === '';
export function numeric(value) {
  if (missing(value)) return null;
  const str = String(value).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(str)) return null;
  const number = Number(str);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER ? number : null;
}
const close = (a, b, tolerance = 0) => Math.abs(a - b) <= tolerance + 1e-9;

export function validateCriteria(criteria) {
  const errors = [];
  for (const [key, value] of Object.entries(DEFAULT_CRITERIA)) {
    if (typeof value === 'number' && numeric(criteria[key]) === null) errors.push(`${key}: 유한한 숫자를 입력하세요.`);
    if (typeof value === 'string' && missing(criteria[key])) errors.push(`${key}: 값을 입력하세요.`);
  }
  for (const key of ['viscosityMin', 'viscosityMax', 'temperatureTolerance', 'rpm', 'elapsed', 'volume',
    'torqueMin', 'torqueMax', 'manufacturingTolerance', 'mixingRpm', 'mixingRpmTolerance',
    'mixingMinutes', 'mixingMinutesTolerance', 'concentration', 'concentrationTolerance']) {
    if (numeric(criteria[key]) !== null && Number(criteria[key]) < 0) errors.push(`${key}: 음수는 사용할 수 없습니다.`);
  }
  for (const [lo, hi] of [['viscosityMin', 'viscosityMax'], ['torqueMin', 'torqueMax']]) {
    if (Number(criteria[lo]) > Number(criteria[hi])) errors.push(`${lo}: 하한은 상한보다 클 수 없습니다.`);
  }
  if (Number(criteria.torqueMax) > 100) errors.push('토크 상한은 100% 이하여야 합니다.');
  for (const key of ['rpm', 'elapsed', 'volume']) if (Number(criteria[key]) === 0) errors.push(`${key}: 0보다 큰 값을 입력하세요.`);
  return errors;
}

export function reviewRecord(record, criteria = DEFAULT_CRITERIA) {
  const issues = [];
  const invalid = new Set();
  const add = (category, field, actual, expected, reason) => issues.push({ category, field, actual: actual ?? '', expected, reason });
  for (const [field] of FIELDS) {
    const value = record[field];
    if (missing(value)) {
      invalid.add(field);
      add('missing', field, '', '기록 필요', `${LABELS[field]} 기록이 없습니다.`);
    } else if (NUMERIC_FIELDS.has(field) && numeric(value) === null) {
      invalid.add(field);
      add('data', field, value, '유한한 숫자', `${LABELS[field]} 값을 숫자로 읽을 수 없습니다.`);
    } else if (NUMERIC_FIELDS.has(field) && !['sampleTemperature', 'manufacturingTemperature', 'storageTemperature'].includes(field) && Number(value) < 0) {
      invalid.add(field);
      add('data', field, value, '0 이상', `${LABELS[field]} 값이 음수입니다.`);
    }
  }
  if (!invalid.has('repeat') && (!Number.isInteger(Number(record.repeat)) || Number(record.repeat) < 1)) {
    invalid.add('repeat'); add('data', 'repeat', record.repeat, '1 이상의 정수', '반복 회차를 확인하세요.');
  }
  if (!invalid.has('measuredAt') && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(record.measuredAt)) {
    invalid.add('measuredAt'); add('data', 'measuredAt', record.measuredAt, '시간대 포함 ISO 일시', '측정 일시 형식을 확인하세요.');
  }
  const range = (field, target, tolerance, category, unit) => {
    if (!invalid.has(field) && !close(Number(record[field]), target, tolerance))
      add(category, field, record[field], `${target}${tolerance ? ` ± ${tolerance}` : ''} ${unit}`, `${LABELS[field]}가 가상 기준과 다릅니다.`);
  };
  const exact = (field, expected, category) => {
    if (!invalid.has(field) && record[field] !== expected)
      add(category, field, record[field], expected, `${LABELS[field]} 확인이 필요합니다.`);
  };
  range('manufacturingTemperature', criteria.manufacturingTemperature, criteria.manufacturingTolerance, 'manufacturing', '℃');
  range('mixingRpm', criteria.mixingRpm, criteria.mixingRpmTolerance, 'manufacturing', 'rpm');
  range('mixingMinutes', criteria.mixingMinutes, criteria.mixingMinutesTolerance, 'manufacturing', '분');
  range('concentration', criteria.concentration, criteria.concentrationTolerance, 'manufacturing', 'wt%');
  range('sampleTemperature', criteria.temperature, criteria.temperatureTolerance, 'measurement', '℃');
  range('rpm', criteria.rpm, 0, 'measurement', 'rpm');
  range('elapsedSeconds', criteria.elapsed, 0, 'measurement', '초');
  range('sampleVolume', criteria.volume, 0, 'measurement', 'mL');
  exact('product', 'POLY-A', 'measurement');
  exact('spindle', criteria.spindle, 'measurement');
  exact('vessel', criteria.vessel, 'measurement');
  for (const [field, expected] of Object.entries({thermalEquilibrium: '완료', bubbleState: '육안 미관찰', immersion: '표시 준수', calibrationStatus: '유효 기록 확인', standardCheck: '적합 기록 확인', levelCheck: '완료', zeroCheck: '완료'})) exact(field, expected, 'measurement');
  if (!invalid.has('torquePercent')) {
    const torque = Number(record.torquePercent);
    if (torque < criteria.torqueMin || torque > criteria.torqueMax)
      add('measurement', 'torquePercent', torque, `${criteria.torqueMin}~${criteria.torqueMax}%`, '토크가 가정한 유효 측정 범위를 벗어났습니다.');
  }
  const supportedUnit = ['mPa·s', 'cP'].includes(record.unit);
  if (!invalid.has('unit') && !supportedUnit) {
    invalid.add('unit'); add('data', 'unit', record.unit, 'mPa·s 또는 cP', '지원하지 않는 단위입니다. 임의 변환하지 않습니다.');
  }
  const viscosity = invalid.has('viscosity') || !supportedUnit ? null : Number(record.viscosity);
  let numericStatus = '비교 불가';
  if (viscosity !== null) {
    numericStatus = viscosity < criteria.viscosityMin || viscosity > criteria.viscosityMax ? '수치상 범위 외' : '수치상 범위 내';
    if (numericStatus === '수치상 범위 외') add('specification', 'viscosity', record.viscosity,
      `${criteria.viscosityMin}~${criteria.viscosityMax} mPa·s`, '표시 점도 수치가 가상 규격 범위를 벗어났습니다. 비교 조건도 함께 확인하세요.');
  }
  const categories = [...new Set(issues.map(issue => issue.category))];
  const methodFields = new Set(['product', 'sampleTemperature', 'thermalEquilibrium', 'bubbleState', 'spindle', 'vessel', 'sampleVolume', 'immersion', 'calibrationStatus', 'standardCheck', 'levelCheck', 'zeroCheck', 'rpm', 'elapsedSeconds', 'torquePercent', 'unit', 'viscosity']);
  const comparable = !issues.some(issue => issue.category === 'measurement' || methodFields.has(issue.field) && ['missing', 'data'].includes(issue.category));
  return {
    issues, categories, numericStatus, viscosity, comparable,
    status: issues.length ? '검토 필요' : '기준 충족',
    conclusion: !comparable ? `${numericStatus} · 비교 조건 확인 필요` : numericStatus,
    criteriaVersion: criteria.version
  };
}

export function parseCSV(text) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field !== '' || closed) throw new Error('CSV 따옴표 위치가 올바르지 않습니다.');
      quoted = true;
    } else if (char === ',') { row.push(field); field = ''; closed = false; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); if (row.some(value => value !== '')) rows.push(row);
      row = []; field = ''; closed = false;
    } else {
      if (closed) throw new Error('닫는 따옴표 뒤에 쉼표나 줄바꿈이 필요합니다.');
      field += char;
    }
  }
  if (quoted) throw new Error('닫히지 않은 CSV 따옴표가 있습니다.');
  if (field !== '' || row.length || closed) { row.push(field); if (row.some(value => value !== '')) rows.push(row); }
  if (rows.length < 2) throw new Error('헤더와 최소 한 행의 데이터가 필요합니다.');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('중복된 CSV 열 이름이 있습니다.');
  const requiredHeaders = ['batchId', 'measurementId', 'viscosity', 'unit'];
  for (const name of requiredHeaders) if (!headers.includes(name)) throw new Error(`필수 열이 없습니다: ${name}`);
  if (rows.length > 20000) throw new Error('첫 버전은 최대 20,000행까지 지원합니다.');
  const seen = new Set();
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`${index + 2}번째 줄의 열 개수가 헤더와 다릅니다.`);
    const record = Object.fromEntries(headers.map((name, j) => [name, values[j]]));
    if (missing(record.measurementId) || missing(record.batchId)) throw new Error(`${index + 2}번째 줄에 배치 또는 측정 번호가 없습니다.`);
    if (seen.has(record.measurementId)) throw new Error(`중복 측정 번호: ${record.measurementId}`);
    seen.add(record.measurementId);
    return Object.fromEntries(FIELDS.map(([key]) => [key, record[key] ?? '']));
  });
}

function csvCell(value, safe) {
  let str = String(value ?? '');
  if (safe && numeric(str) === null && /^[\s]*[=+\-@]/.test(str)) str = `'${str}`;
  return `"${str.replaceAll('"', '""')}"`;
}
export function recordsCSV(records, criteria, notes = {}, includeReview = true) {
  const extra = includeReview ? ['criteriaVersion', 'criteriaSnapshot', 'reviewStatus', 'numericStatus', 'comparable', 'categories', 'reasons', 'reviewNote'] : [];
  const headers = [...FIELDS.map(([key]) => key), ...extra];
  return '\uFEFF' + [headers.map(value => csvCell(value, false)).join(','), ...records.map(record => {
    const review = reviewRecord(record, criteria);
    const values = FIELDS.map(([key]) => record[key]);
    if (includeReview) values.push(criteria.version, JSON.stringify(criteria), review.status, review.numericStatus, review.comparable ? '조건 확인됨' : '조건 확인 필요', review.categories.map(key => CATEGORY_LABELS[key]).join(' / '), review.issues.map(issue => `${LABELS[issue.field]}: ${issue.actual === '' ? '미기재' : issue.actual} → ${issue.expected}`).join(' | '), notes[record.measurementId] ?? '');
    return values.map(value => csvCell(value, true)).join(',');
  })].join('\r\n');
}

const md = value => String(value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', '').replaceAll('\n', '<br>');
export function reportMarkdown(records, criteria, notes = {}, source = '합성 시연 데이터', date = new Date().toISOString()) {
  const reviews = records.map(record => reviewRecord(record, criteria));
  const counts = Object.keys(CATEGORY_LABELS).map(key => `- ${CATEGORY_LABELS[key]}: ${reviews.filter(review => review.categories.includes(key)).length}건`);
  return [
    '# 고분자 수용액 A — 점도 검토 보고서', '',
    '> 교육용 가상 기준에 따른 검토입니다. 실제 물성 예측, 원인 확정 또는 출하 승인 결과가 아닙니다.', '',
    `작성: ${md(date)}`, `데이터 출처: ${md(source)}`, `적용 기준: ${md(criteria.version)}`, '',
    '## 적용 기준 전체', '', '```json', JSON.stringify(criteria, null, 2).replaceAll('```', '\\u0060\\u0060\\u0060'), '```', '',
    '## 검토 요약', '', `- 대상 측정: ${records.length}건`, `- 대상 배치: ${new Set(records.map(record => record.batchId)).size}개`,
    `- 기준 충족: ${reviews.filter(review => !review.issues.length).length}건`, ...counts,
    '- 범주별 건수는 중복될 수 있습니다. 수치상 범위 내라도 비교 조건 확인이 필요할 수 있습니다.', '',
    '## 측정별 결과', '', '| 배치 | 측정 | 점도 (mPa·s) | 검토 | 수치 비교 | 비교 조건 | 이유 | 메모 |', '|---|---|---:|---|---|---|---|---|',
    ...records.map((record, i) => {
      const result = reviews[i];
      return `| ${md(record.batchId)} | ${md(record.measurementId)} | ${md(result.viscosity ?? '비교 불가')} | ${result.status} | ${result.numericStatus} | ${result.comparable ? '확인됨' : '확인 필요'} | ${md(result.issues.map(issue => `${LABELS[issue.field]}: 실제 ${issue.actual === '' ? '미기재' : issue.actual}, 기준 ${issue.expected}`).join('; ') || '가상 기준과 일치')} | ${md(notes[record.measurementId] ?? '')} |`;
    }), '', '## 원본 기록', '', '원본은 별도의 입력 데이터 CSV 또는 검토 결과 CSV와 함께 보관하세요. 이 보고서는 현재 필터로 선택한 기록의 검토 결과입니다.', ''
  ].join('\n');
}
