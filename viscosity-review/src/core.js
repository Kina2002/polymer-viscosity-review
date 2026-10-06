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
  measurement: '점도 측정 조건 차이', specification: '점도 규격 이탈'
};
export const FIXED_REQUIREMENTS = Object.freeze({
  product: 'POLY-A', thermalEquilibrium: '완료', bubbleState: '육안 미관찰',
  immersion: '표시 준수', calibrationStatus: '유효 기록 확인',
  standardCheck: '적합 기록 확인', levelCheck: '완료', zeroCheck: '완료'
});
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

export const CONDITION_FIELDS = FIELDS.filter(([field]) => !['batchId', 'measurementId', 'sampleId', 'measuredAt', 'sourceNote'].includes(field))
  .map(([field, label]) => ({field, label, type: NUMERIC_FIELDS.has(field) ? 'number' : 'text',
    unit: field === 'viscosity' ? 'mPa·s' : label.match(/\(([^)]+)\)$/)?.[1] ?? ''}));
export function conditionValue(record, field) {
  const definition = CONDITION_FIELDS.find(item => item.field === field);
  if (!definition) return null;
  if (definition.type === 'text') return missing(record[field]) ? null : String(record[field]);
  const value = numeric(record[field]);
  if (field === 'viscosity' && (!['mPa·s', 'cP'].includes(record.unit) || value < 0)) return null;
  return value;
}
export function validateConditionFilter(filter) {
  if (filter === null) return null;
  const definition = CONDITION_FIELDS.find(item => item.field === filter?.field);
  if (!definition) return '보고 싶은 항목을 선택하세요.';
  if (filter.mode === 'all') return null;
  if (definition.type === 'text') return filter.mode === 'value' && typeof filter.value === 'string' ? null : '보고 싶은 기록값을 선택하세요.';
  const center = numeric(filter.center), tolerance = numeric(filter.tolerance);
  if (filter.mode !== 'range' || center === null || tolerance === null) return '중심값과 ± 범위를 숫자로 입력하세요.';
  if (tolerance < 0) return '± 범위는 0 이상이어야 합니다.';
  if (numeric(center - tolerance) === null || numeric(center + tolerance) === null) return '범위가 너무 큽니다. 더 작은 값을 입력하세요.';
  return null;
}
export function matchesConditionFilter(record, filter) {
  if (filter === null) return true;
  if (validateConditionFilter(filter)) return false;
  if (filter.mode === 'all') return true;
  if (filter.mode === 'value') return String(record[filter.field] ?? '') === filter.value;
  const value = conditionValue(record, filter.field);
  if (value === null) return false;
  const center = Number(filter.center), tolerance = Number(filter.tolerance);
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(center), tolerance) * 4;
  return Math.abs(value - center) <= tolerance + epsilon;
}
export function describeConditionFilter(filter) {
  if (!filter || validateConditionFilter(filter)) return '조건 미적용';
  const label = LABELS[filter.field];
  if (filter.mode === 'all') return `${label} · 전체 값`;
  if (filter.mode === 'value') return `${label}: ${filter.value.trim() ? filter.value : '미기재'}`;
  const center = Number(filter.center), tolerance = Number(filter.tolerance);
  const display = value => value.toLocaleString('ko-KR', {maximumFractionDigits: 20});
  return `${label}: ${display(center)} ± ${display(tolerance)} (${display(Number((center-tolerance).toPrecision(15)))}~${display(Number((center+tolerance).toPrecision(15)))})`;
}

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
  exact('spindle', criteria.spindle, 'measurement');
  exact('vessel', criteria.vessel, 'measurement');
  for (const [field, expected] of Object.entries(FIXED_REQUIREMENTS)) exact(field, expected, 'measurement');
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

// 비교표는 판정과 같은 기준을 사용하고, 기록만 확인한 항목을 기준 일치로 표시하지 않는다.
export function comparisonRows(record, criteria = DEFAULT_CRITERIA) {
  const review = reviewRecord(record, criteria);
  const target = (value, tolerance, unit) => `${value}${tolerance ? ` ± ${tolerance}` : ''} ${unit}`;
  const requirements = {
    ...FIXED_REQUIREMENTS,
    viscosity: `${criteria.viscosityMin}~${criteria.viscosityMax} mPa·s`, unit: 'mPa·s 또는 cP',
    sampleTemperature: target(criteria.temperature, criteria.temperatureTolerance, '℃'),
    spindle: criteria.spindle, vessel: criteria.vessel, rpm: `${criteria.rpm} rpm`,
    elapsedSeconds: `${criteria.elapsed} 초`, sampleVolume: `${criteria.volume} mL`,
    torquePercent: `${criteria.torqueMin}~${criteria.torqueMax}%`,
    manufacturingTemperature: target(criteria.manufacturingTemperature, criteria.manufacturingTolerance, '℃'),
    mixingRpm: target(criteria.mixingRpm, criteria.mixingRpmTolerance, 'rpm'),
    mixingMinutes: target(criteria.mixingMinutes, criteria.mixingMinutesTolerance, '분'),
    concentration: target(criteria.concentration, criteria.concentrationTolerance, 'wt%')
  };
  const groups = [
    ['점도 결과', ['viscosity', 'unit']],
    ['점도 측정 조건', ['sampleTemperature', 'thermalEquilibrium', 'rpm', 'elapsedSeconds', 'torquePercent', 'spindle', 'vessel', 'sampleVolume', 'immersion', 'bubbleState', 'calibrationStatus', 'standardCheck', 'levelCheck', 'zeroCheck']],
    ['제조 조건', ['concentration', 'manufacturingTemperature', 'mixingRpm', 'mixingMinutes']],
    ['제품과 나머지 기록', FIELDS.map(([field]) => field).filter(field => !['viscosity', 'unit', 'sampleTemperature', 'thermalEquilibrium', 'rpm', 'elapsedSeconds', 'torquePercent', 'spindle', 'vessel', 'sampleVolume', 'immersion', 'bubbleState', 'calibrationStatus', 'standardCheck', 'levelCheck', 'zeroCheck', 'concentration', 'manufacturingTemperature', 'mixingRpm', 'mixingMinutes'].includes(field))]
  ];
  return groups.flatMap(([group, fields]) => fields.map(field => {
    const issues = review.issues.filter(issue => issue.field === field);
    const hasRule = Object.hasOwn(requirements, field);
    const blocked = field === 'viscosity' && review.viscosity === null;
    const status = issues.some(issue => issue.category === 'missing') ? '기록 누락'
      : issues.some(issue => issue.category === 'data') ? '입력 확인'
      : issues.some(issue => issue.category === 'specification') ? '범위 이탈'
      : issues.length ? '조건 차이' : blocked ? '비교 불가' : hasRule ? '기준 일치' : '기록 있음';
    return {field, label: LABELS[field], group, actual: missing(record[field]) ? '미기재' : String(record[field]),
      expected: hasRule ? requirements[field] : '기록 필요 · 비교 기준 미설정',
      status, warning: issues.length > 0 || blocked, hasRule, issues};
  }));
}

function onlyViscosityIssue(review) {
  return review.issues.length > 0 && review.issues.every(issue => issue.category === 'specification' && issue.field === 'viscosity');
}

export const FOLLOW_UP_EXPLANATION_NOTE = '조건을 바꿨을 때의 일반적인 예시예요. 가상 POLY-A에서 실제로 일어난 변화나 원인을 뜻하지 않아요. 기록이 없으면 실제 조건을 추정하지 않아요.';
const EXPLANATION_SOURCES = {
  flow: {title: 'Brookfield · 온도와 회전 속도의 영향', url: 'https://www.brookfieldengineering.com/brookfield-university/viscosityrheology/impact-of-temperature-and-shear-rate'},
  time: {title: 'Brookfield · 시간에 따른 점도 감소·증가', url: 'https://www.brookfieldengineering.com/brookfield-university/viscosityrheology/thixotropy-and-rheopexy'},
  geometry: {title: 'Brookfield DVPlus · 스핀들·용기·시료 준비', url: 'https://www.brookfieldengineering.com/-/media/ametekbrookfield/product-manuals/dvplus-viscometer-operations-manual-m21-400.pdf'},
  polymer: {title: 'Ashland · 고분자 용해·농도·점도 (HEC 예시)', url: 'https://www.ashland.com/file_source/Ashland/links/PHA18-101_Natrosol_250_HEC_Formulating_elegant_liquid_and_semisolid_%20drug_products.pdf'},
  method: {title: 'Brookfield DV2T · 측정 준비·변수·교정', url: 'https://www.brookfieldengineering.com/-/media/ametekbrookfield/manuals/lab%20viscometers/dv2t%20instructions.pdf'},
  preparation: {title: 'Brookfield · 정확한 점도 측정 안내', url: 'https://www.brookfieldengineering.com/-/media/ametekbrookfield/application-notes-2024/viscosity-rheology/guide-to-accurate-viscosity-measurement-_-best-practices-and-advanced-techniques_ametek_brookfield_tech_guide_released_january_2025.pdf?hash=CF3B7DB11DA28F8751839F026D9D62EE&la=en&revision=36d30653-1260-4587-929a-a35a070736b6'},
  history: {title: 'Brookfield · 시간·시료 이력·조성 (§4.8)', url: 'https://www.brookfieldengineering.cn/-/media/ametekbrookfield/tech-sheets/more-solutions-2017.pdf?hash=09090D1ACADC9DABF6013D1D56D1310C&la=zh-cn&revision=84a81556-8cb8-4667-b3ca-821becc69ab6'}
};
const explanation = (why, effect, source) => Object.freeze({why, effect, source: EXPLANATION_SOURCES[source] ?? null});
const traceExplanation = explanation('원본 기록과 결과를 정확히 연결하기 위해 확인해요.', '원본의 항목과 기록 위치를 대조하고, 찾을 수 없다면 확인 불가 이유를 남기세요.');
const FOLLOW_UP_EXPLANATIONS = {
  batchId: explanation("같은 제조 배치에서 나온 반복값끼리 묶기 위해 확인해요.", "배치 번호가 잘못되면 다른 날 만든 시료를 한 배치의 반복값처럼 비교하게 돼요. 제조 기록의 배치 번호와 대조하세요.", null),
  measurementId: explanation("각 측정값에 맞는 체크 상태와 메모를 찾기 위해 확인해요.", "측정 번호를 잘못 붙이면 다른 결과의 메모와 확인 상태가 연결될 수 있어요. 원본 측정 번호를 먼저 확인하세요.", null),
  sampleId: explanation("실제로 점도를 잰 시료가 어느 배치에서 채취됐는지 연결해요.", "시료 번호가 뒤바뀌면 다른 시료의 점도를 이 배치의 결과로 읽게 돼요. 용기 라벨과 채취 기록을 대조하세요.", null),
  repeat: explanation("같은 배치를 몇 번째로 측정한 값인지 구분해요.", "1회와 2회가 뒤바뀌면 측정 순서에 따른 변화를 잘못 해석할 수 있어요. 회차와 측정 번호를 함께 확인하세요.", null),
  measuredAt: explanation("제조 후 얼마 지나서 측정했는지 시간 기록을 연결해요.", "측정 일시가 틀리면 제조 후 경과 시간이나 장비 점검 시점도 잘못 비교할 수 있어요. 제조 일시와 측정 일시를 함께 확인하세요.", null),
  product: explanation("이 시료에 맞는 제품 기준과 시험 방법을 적용하기 위해 확인해요.", "다른 제품의 기준으로 비교하면 같은 점도도 범위 안·밖이 다르게 표시될 수 있어요. 제품 코드와 적용한 시험 방법을 대조하세요.", null),
  polymerGrade: explanation("같은 고분자라도 등급에 따라 같은 농도에서의 점도가 달라 같은 등급을 비교해요.", "HEC 같은 증점 고분자는 같은 농도·온도에서 고점도 등급이 저점도 등급보다 높은 값을 보일 수 있어요. 등급 이름만으로 보정하지 않고 원료 규격서의 시험 조건을 확인해요.", "polymer"),
  solvent: explanation("같은 용매와 용매 배합으로 고분자가 풀린 상태를 비교해요.", "물을 다른 용매로 바꾸면 고분자가 덜 풀리거나 침전이 생길 수 있어요. 이때는 단순한 점도 증감보다 용해 상태를 먼저 확인해야 해요. 용매 종류와 배합을 대조하세요.", "polymer"),
  polymerMass: explanation("고분자를 얼마나 넣었는지 알아야 실제 농도를 확인할 수 있어요.", "같은 물의 양에 같은 고분자를 더 넣고 완전히 용해했다면, 농도가 올라 대체로 더 되직해질 수 있어요. 저울 기록과 물의 질량을 함께 확인하세요.", "polymer"),
  solventMass: explanation("물의 양이 고분자 농도를 결정하므로 고분자 질량과 함께 확인해요.", "같은 고분자 양에 물을 더 넣으면 농도가 낮아져 대체로 점도가 낮아질 수 있어요. 가열 중 물이 줄었다면 반대로 농도가 높아질 수 있어요. 투입량과 최종 질량을 대조하세요.", "polymer"),
  concentration: explanation("농도 차이로 생긴 점도 차이를 다른 제조 조건의 영향으로 오해하지 않도록 맞춰요.", "같은 증점 고분자가 완전히 풀린 수용액을 같은 온도·방법으로 비교하면:\n• 농도가 높아지면 대체로 점도가 높아질 수 있어요.\n• 물로 희석해 농도가 낮아지면 대체로 점도가 낮아질 수 있어요.\n배합이나 고분자 종류가 다른 시료에 이 방향을 그대로 적용하지 않아요.", "polymer"),
  manufacturingTemperature: explanation("시료를 만드는 동안의 온도가 가루가 풀리는 과정과 물의 손실에 영향을 주므로 확인해요.", "온도를 바꿔 아직 덜 풀린 고분자가 더 풀렸다면 이후 점도가 올라갈 수 있어요. 가열 중 물이 증발해 농도가 높아져도 더 되직해질 수 있어요. 용해·질량 변화가 없다면 같은 측정 온도로 맞춘 뒤 비슷할 수도 있어요. 제조 온도만으로 증감을 정하지 않고 용해 상태와 최종 질량을 확인해요.", "polymer"),
  mixingRpm: explanation("가루를 골고루 풀어 주는 정도와 시료가 받은 교반 이력을 맞추기 위해 확인해요.", "교반이 약해 덩어리가 남으면 채취한 위치에 따라 점도가 다르게 나올 수 있어요. 시간에 따라 묽어지는 시료는 강한 교반 직후 낮게 읽히고 쉬는 동안 다시 올라갈 수 있어요. 속도 기록과 덩어리·기포 상태, 측정 전 휴지 시간을 함께 확인해요.", "history"),
  mixingMinutes: explanation("가루가 충분히 풀렸는지와 얼마나 오래 교반했는지 함께 확인해요.", "아직 덜 풀린 증점 고분자라면 더 섞으면서 용해가 진행돼 점도가 높아질 수 있어요. 이미 완전히 풀렸고 교반 시간의 영향을 받지 않는 시료라면 비슷할 수 있어요. 오래 섞은 시간만 보지 않고 용해 상태와 교반 후 휴지 시간을 확인해요.", "polymer"),
  additionOrder: explanation("고분자 가루가 뭉치지 않고 물에 퍼지도록 정한 투입 방법을 확인해요.", "가루를 물에 천천히 나누어 넣는 방법에서 한꺼번에 넣으면 겉만 젖은 덩어리가 생겨 내부가 늦게 풀릴 수 있어요. 그러면 채취 위치와 대기 시간에 따라 값이 달라져요. 원료별 투입 순서와 덩어리 관찰 기록을 대조하세요.", "polymer"),
  uniformity: explanation("어느 부분을 덜어도 비슷한 농도와 상태의 시료를 측정하기 위해 확인해요.", "윗부분과 아랫부분의 농도가 다르거나 덩어리가 남으면 채취한 위치마다 점도가 달라질 수 있어요. 채취 위치와 덩어리·층 분리 기록을 확인해요. 육안으로 매끈해 보여도 완전한 용해까지 증명되지는 않아요.", "history"),
  uniformityMethod: explanation("균일하다는 기록이 무엇을 관찰해서 나온 것인지 확인해요.", "육안은 보이는 덩어리와 층 분리를 찾는 데 도움이 되지만 미세 입자나 분자 수준의 용해까지 확인하지는 못해요. 관찰 방법·채취 위치·사진 등의 근거가 있는지 살펴보세요.", "history"),
  storageTemperature: explanation("보관 중의 온도와 실제 점도를 측정한 온도를 구분해 기록해요.", "보관 중 물이 증발하면 농도가 높아져 나중의 점도가 커질 수 있어요. 밀봉했고 조성·구조가 유지됐다면 같은 측정 온도로 맞춘 뒤 비슷할 수도 있어요. 온도 기록뿐 아니라 덮개 상태와 보관 전후 질량을 확인해요.", "history"),
  ageHours: explanation("가루가 풀리거나 시료 상태가 회복되는 데 걸린 시간을 맞추기 위해 확인해요.", "제조 직후 아직 덜 풀린 증점 고분자는 시간이 지나며 더 풀려 점도가 올라갈 수 있어요. 충분히 용해되고 안정된 시료는 변화가 작을 수 있어요. 제조·측정 일시와 용해 상태 기록을 함께 확인해요.", "polymer"),
  sampleTemperature: explanation("온도 때문에 달라진 점도를 배치 자체의 차이로 오해하지 않도록 같은 온도에서 비교해요.", "많은 액체는 같은 방법으로 측정할 때:\n• 시료 온도가 높아지면 점도가 낮아질 수 있어요.\n• 시료 온도가 낮아지면 점도가 높아질 수 있어요.\n열을 받으면 젤이 되는 고분자 등은 반대로 되직해질 수 있으니 시료의 온도별 특성을 확인해요.", "flow"),
  thermalEquilibrium: explanation("시료·용기·스핀들의 온도가 목표 측정 온도에서 안정됐는지 확인해요.", "온도가 높을수록 묽어지는 시료라면, 따뜻한 시료가 식는 동안 점도는 올라가고 차가운 시료가 데워지는 동안에는 내려갈 수 있어요. 설정 온도 한 번보다 실제 시료 온도의 경과 기록을 보고 안정됐는지 확인해요.", "method"),
  bubbleState: explanation("기포 대신 액체가 스핀들과 제대로 접촉하는 상태로 측정하기 위해 확인해요.", "기포가 스핀들 아래에 붙거나 회전 중 움직이면 액체와 닿는 상태가 달라져 값이 흔들릴 수 있어요. 기포를 줄인 뒤 값이 안정되는지 확인할 수 있지만, 기포가 있으면 항상 높거나 낮다는 한 방향의 규칙은 없어요.", "preparation"),
  preMixing: explanation("점도를 재기 직전에 시료를 다시 섞었는지와 그 후 얼마나 쉬었는지 맞춰요.", "시간에 따라 묽어지는 시료(틱소트로피)는 추가 교반 직후 낮게 읽히고, 쉬는 동안 점도가 다시 올라갈 수 있어요. 추가 교반 여부·속도·시간과 휴지 기록을 함께 확인해요.", "time"),
  restMinutes: explanation("교반을 끝낸 뒤 쉬게 둔 시간과 점도계 회전 후 값을 읽는 시간을 따로 구분해요.", "시간에 따라 묽어지는 시료(틱소트로피)는 교반을 멈추고 쉬는 동안 점도가 회복돼, 짧게 쉰 때보다 오래 쉰 뒤 높게 읽힐 수 있어요. 회복이 끝난 뒤에는 차이가 작아질 수 있어요. 휴지를 언제 시작했는지 확인해요.", "time"),
  deviceId: explanation("이 측정에 쓴 장비의 교정·표준액 점검 기록을 정확히 찾기 위해 확인해요.", "장비 번호가 틀리면 다른 장비가 점검된 기록을 가져올 수 있어요. 시료의 점도를 바꾸는 조건은 아니지만 결과의 신뢰성을 잘못 판단할 수 있으니 원본 장비 번호를 대조하세요.", null),
  deviceModel: explanation("장비 모델에 맞는 측정 범위와 스핀들 설정을 확인해요.", "모델이 바뀌면 힘을 읽는 범위가 달라 같은 시료도 토크가 너무 낮거나 범위를 넘을 수 있어요. 모델이 다르다는 이유만으로 점도를 보정하지 않고 장비 설명서와 토크 기록을 확인해요.", "method"),
  spindle: explanation("스핀들의 모양에 맞는 환산 설정과 시료의 흐름을 맞춰 비교하기 위해 확인해요.", "스핀들을 바꾸면 힘을 읽는 범위와 스핀들 주변의 흐름이 바뀌어요. 장비는 스핀들별 설정으로 힘을 점도로 환산하므로 큰 스핀들이라고 점도가 무조건 커지지는 않아요. 흐르는 방식에 민감한 시료는 값도 달라질 수 있어 실제 장착한 스핀들과 장비에 선택한 코드를 함께 대조해요.", "geometry"),
  vessel: explanation("용기 벽과 스핀들 사이의 공간을 같은 시험 방법으로 맞추기 위해 확인해요.", "더 좁은 용기에서는 벽이 스핀들 주변의 흐름을 더 제한할 수 있어요. 시료가 같아도 이 측정 구성의 차이로 표시값이 달라질 수 있으므로, 용기 크기만으로 점도의 증감을 정하지 않고 내경·높이와 스핀들 위치를 확인해요.", "geometry"),
  sampleVolume: explanation("용기 안의 액면과 스핀들이 잠기는 상태를 정한 방법과 맞춰요.", "같은 용기에서 시료가 적어 스핀들의 측정부가 덜 잠기면 힘을 작게 읽을 수 있어요. 모두 제대로 잠긴 상태에서 양만 늘렸다고 점도가 비례해서 커지는 것은 아니에요. 시료량·액면·침지 표시를 함께 확인해요.", "geometry"),
  immersion: explanation("액면이 스핀들의 침지 표시와 맞는지 확인해 같은 깊이로 측정해요.", "측정부가 덜 잠기면 액체와 닿는 면적이 줄어 낮게 읽힐 수 있어요. 너무 깊게 넣으면 축이 잠기는 길이와 바닥까지의 간격도 달라져요. 깊이 변화로 값을 보정하지 않고 액면과 침지 표시를 맞췄는지 확인해요.", "geometry"),
  calibrationStatus: explanation("이 장비가 정확도를 확인받은 기간에 사용됐는지 교정 성적서로 확인해요.", "교정에서 발견한 오차가 남아 있다면 시료 값도 높거나 낮게 치우칠 수 있어요. 기록 누락만으로 고장을 확정하지 않고 장비 번호·교정일·유효 기간·교정 결과를 확인해요.", "preparation"),
  standardCheck: explanation("알려진 점도의 표준액을 같은 시험 조건으로 측정했는지 확인해요.", "표준액 값이 허용 범위보다 높거나 낮게 나왔다면 시료 결과를 믿기 전에 온도·스핀들·설정·장비 상태를 점검해야 해요. 표준액의 명시 값과 측정값·허용 범위를 대조하고 시료 값을 임의로 빼거나 더하지 않아요.", "preparation"),
  levelCheck: explanation("스핀들이 정한 방향과 위치에서 돌도록 장비가 수평인지 확인해요.", "장비가 기울어 스핀들이 벽이나 바닥과 접촉하면 시료의 저항에 접촉 저항이 더해질 수 있어요. 이 경우 점도가 높게 읽히거나 흔들릴 수 있으니 수평계와 스핀들의 위치·접촉 여부를 확인해요.", "method"),
  zeroCheck: explanation("힘을 읽는 기준점이 맞아야 시료의 회전 저항만 측정할 수 있어요.", "영점이 높은 쪽으로 어긋나면 측정값도 높게, 낮은 쪽으로 어긋나면 낮게 치우칠 수 있어요. 장비 설명서에 따라 영점을 확인한 기록이 있는지 살펴보세요.", "method"),
  rpm: explanation("회전 속도가 시료를 변형시키는 빠르기에 영향을 주므로 같은 속도로 비교해요.", "같은 온도·스핀들·읽는 시점에서 속도를 높이면:\n• 빠르게 돌릴수록 묽게 측정되는 시료(전단박화): 점도가 낮아질 수 있어요.\n• 빠르게 돌릴수록 되직하게 측정되는 시료(전단농화): 점도가 높아질 수 있어요.\n• 속도의 영향을 받지 않는 시료: 비슷한 값을 보여요.\n이 구분은 속도의 영향이며, 같은 속도에서 시간이 지나는 영향과는 따로 확인해요.", "flow"),
  elapsedSeconds: explanation("회전 시작 후 같은 시점의 값을 비교하기 위해 읽는 시간을 맞춰요.", "같은 시료를 같은 온도·스핀들·회전 속도로 계속 측정하면서 더 늦게 읽으면:\n• 시간이 지날수록 묽어지는 시료(틱소트로피): 점도가 낮아질 수 있어요.\n• 시간이 지날수록 되직해지는 시료(레오펙시): 점도가 높아질 수 있어요.\n• 시간의 영향이 거의 없는 시료: 점도가 비슷하게 나와요.\n예를 들어 묽어지는 시료라면 20초에 읽은 값이 60초에 읽은 값보다 높을 수 있어요. 어느 유형인지는 이 기록만으로 알 수 없어요.", "time"),
  torquePercent: explanation("토크는 장비가 읽은 힘이 측정 범위의 몇 %인지 보여 주므로 유효 범위를 확인해요.", "토크가 너무 낮으면 작은 힘의 오차도 측정한 힘에 비해 큰 비율을 차지해 점도 오차가 커질 수 있어요. 너무 높으면 장비가 읽을 수 있는 범위를 넘어요. 토크를 높이려고 시험 속도를 임의로 바꾸지 않고 실제 장비의 허용 범위를 확인해요.", "method"),
  viscosity: explanation("현재 수치가 정한 범위 안인지 보고, 비교 조건과 원본 기록도 함께 확인해요.", "범위 밖인 값이 하나만 있는지 같은 배치의 반복값도 모두 벗어나는지 확인해요. 이탈값만으로 제조 불량이나 측정 오류를 구분할 수 없으므로 원본 수치·단위, 측정 조건, 반복값 순서로 대조해요.", null),
  unit: explanation("점도 숫자가 같은 크기를 뜻하는 단위로 비교되는지 확인해요.", "1 cP와 1 mPa·s는 같은 값이에요. 반면 1 Pa·s는 1,000 mPa·s이므로 단위 글자만 바꾸면 1,000배 잘못 비교할 수 있어요. 이 앱은 Pa·s를 자동 변환하지 않으니 미지원 단위는 원본 값과 단위를 먼저 확인해요.", "method"),
  sourceNote: explanation("어느 원본 문서나 파일에서 가져온 기록인지 다시 찾을 수 있도록 확인해요.", "출처가 없으면 온도·속도·점도 값이 잘못 옮겨졌는지 원본과 대조하기 어려워요. 문서 이름이나 파일·기록 위치를 남겨 두세요.", null)
};
const reportExplanationSources = (records, criteria) => [...new Map(records.flatMap(record => followUpPlan(record, criteria))
  .map(task => task.explanation.source).filter(Boolean).map(source => [source.url, source])).values()];
// 사용자가 합의한 검토 원칙을 질문으로 연결한다. 원인이나 재측정 필요를 확정하지 않는다.
export function followUpPlan(record, criteria = DEFAULT_CRITERIA) {
  const review = reviewRecord(record, criteria);
  const comparisons = new Map(comparisonRows(record, criteria).map(row => [row.field, row]));
  const methodQuestions = {
    sampleTemperature: row => `실험 기록에는 ${row.actual}℃, 비교 기준에는 ${row.expected}가 적혀 있어요. 먼저 원본 실험 기록에도 이 온도로 적혀 있는지 확인하세요. 실제로 기준과 다른 온도에서 측정했다면, 기준 온도에 맞춰 다시 측정할 필요가 있는지 검토하세요.`,
    thermalEquilibrium: '목표 측정 온도에서 시료와 측정 부품의 온도가 안정됐다는 기록이 있나요?',
    rpm: '적용한 시험 방법의 회전 속도와 실제 설정 기록이 일치하나요? 값을 맞추려고 속도를 임의로 바꾸지 않았는지 확인하세요.',
    elapsedSeconds: '회전 시작 후 언제 값을 읽었는지와 시험 방법의 읽는 시점을 확인했나요?',
    spindle: '기록된 스핀들과 적용한 시험 방법의 스핀들이 같은가요?',
    vessel: '용기 형태·규격이 적용한 시험 방법과 같은가요?',
    sampleVolume: '시료량 기록과 시험 방법의 요구량을 확인했나요?',
    immersion: '스핀들의 침지 표시를 준수했다는 기록이 있나요?',
    bubbleState: '기포 관찰 기록과 시료 준비 방법을 확인했나요? 육안 관찰만으로 미세 기포 유무를 확정하지 마세요.',
    torquePercent: '실제 장비와 시험 방법에서 허용하는 토크 범위를 확인했나요?',
    calibrationStatus: '해당 장비의 교정 기록과 유효 기간을 확인했나요?',
    standardCheck: '표준액 점검 기록과 적용한 허용 범위를 확인했나요?',
    levelCheck: '측정 전 장비의 수평 확인 기록이 있나요?',
    zeroCheck: '측정 전 장비의 영점 확인 기록이 있나요?',
    product: '제품 코드와 적용한 시험 방법이 이 시료에 맞는지 확인했나요?'
  };
  const priority = {missing: 0, data: 1, measurement: 2, specification: 3, manufacturing: 4};
  return review.issues.map(issue => {
    const row = comparisons.get(issue.field);
    const methodQuestion = typeof methodQuestions[issue.field] === 'function' ? methodQuestions[issue.field](row) : methodQuestions[issue.field];
    const question = issue.category === 'missing' ? `원본 실험·제조 기록에서 ${row.label}을 확인할 수 있나요? 자료가 없으면 추정값을 넣지 말고 확인 불가 이유를 메모하세요.`
      : issue.category === 'data' ? `${row.label}의 원본 표기와 숫자·단위·일시 형식을 확인했나요? 확인한 값을 원본 자료와 대조하세요.`
      : issue.category === 'measurement' ? methodQuestion ?? '사용한 시험 방법과 실제 설정 기록을 확인하고 재측정 필요 여부를 검토하세요.'
      : issue.category === 'manufacturing' ? `${row.label}의 배치 제조 기록과 작업 지시를 확인했나요? 차이의 발생 경위를 기록하고 점도 변화의 원인이라고 단정하지 마세요.`
      : onlyViscosityIssue(review)
        ? '점도는 기준 범위를 벗어났지만, 현재 비교 기준에서 제조·점도 측정 조건 차이는 발견되지 않았어요. 현재 기록만으로 원인을 알 수 없어 추가 자료가 필요해요. 원본 측정 기록과 같은 배치의 반복 측정값을 확인했나요? 필요한 자료를 확인할 수 없다면 「확인 불가」를 누르고 이유를 남기세요.'
        : '점도 측정 조건을 먼저 확인한 뒤, 같은 배치의 반복 측정값과 제조 기록을 함께 검토했나요? 원인이나 배치 불량을 수치만으로 확정하지 마세요.';
    return {id: `${issue.category}:${issue.field}`, category: issue.category, field: issue.field,
      label: row.label, actual: row.actual, expected: row.expected, question,
      explanation: FOLLOW_UP_EXPLANATIONS[issue.field] ?? traceExplanation};
  }).sort((a, b) => priority[a.category] - priority[b.category]);
}

export function followUpSignature(record, criteria) {
  return JSON.stringify({policy: onlyViscosityIssue(reviewRecord(record, criteria)) ? 'POLY-A-follow-up-viscosity-only-v2' : 'POLY-A-follow-up-v1',
    criteria: Object.keys(DEFAULT_CRITERIA).map(key => [key, criteria[key]]),
    record: FIELDS.map(([key]) => [key, record[key] ?? ''])});
}
export const FOLLOW_UP_STATUS_LABELS = Object.freeze({pending: '미확인', done: '자료 확인 완료', unavailable: '확인 불가'});
export const DEFAULT_REASON_CATEGORIES = Object.freeze(['원본 기록 없음', '필요한 항목 미기록', '추가 자료 필요', '담당자 확인 대기', '기타']);
export function reasonCategoryName(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g, ' ') : '';
}
export function validateReasonCategory(value, existing = []) {
  const name = reasonCategoryName(value);
  if (!name) return '분류 이름을 입력하세요.';
  if (name.length > 40) return '분류 이름은 40글자 이내로 입력하세요.';
  if (name === '미분류') return '미분류는 분류를 선택하지 않은 메모에 자동으로 사용됩니다.';
  if (existing.some(value => reasonCategoryName(value).toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) return '이미 있는 분류 이름입니다.';
  return null;
}
export function followUpProgress(record, criteria, checklists = {}) {
  const state = checklists[record.measurementId];
  const valid = state?.signature === followUpSignature(record, criteria);
  const checked = valid && Array.isArray(state.checked) ? new Set(state.checked) : new Set();
  return followUpPlan(record, criteria).map(task => {
    const outcome = valid ? state.outcomes?.[task.id] : null;
    // 기존 체크만 저장한 기록은 확인 완료로 읽는다. 확인 불가와 동시에 완료될 수 없다.
    const status = Object.hasOwn(FOLLOW_UP_STATUS_LABELS, outcome?.status) ? outcome.status : checked.has(task.id) ? 'done' : 'pending';
    const reason = status === 'unavailable' && typeof outcome?.reason === 'string' ? outcome.reason.slice(0, 2000) : '';
    const categoryName = reasonCategoryName(outcome?.reasonCategory);
    const reasonCategory = status === 'unavailable' && categoryName.length <= 40 && categoryName !== '미분류' ? categoryName : '';
    const completionNote = typeof outcome?.completionNote === 'string' ? outcome.completionNote.slice(0, 2000) : '';
    return {...task, status, checked: status === 'done', reason, reasonCategory, completionNote};
  });
}

export function unavailableEntries(records, criteria, checklists = {}) {
  return records.flatMap(record => followUpProgress(record, criteria, checklists)
    .filter(task => task.status === 'unavailable')
    .map(task => ({...task, measurementId: record.measurementId, batchId: record.batchId})));
}
export function removeReasonCategory(checklists, category) {
  const name = reasonCategoryName(category);
  if (!name) return checklists;
  return Object.assign(Object.create(null), Object.fromEntries(Object.entries(checklists).map(([id, state]) => {
    if (!state?.outcomes || typeof state.outcomes !== 'object' || Array.isArray(state.outcomes)) return [id, state];
    const outcomes = Object.fromEntries(Object.entries(state.outcomes).map(([taskId, outcome]) => [taskId,
      outcome && typeof outcome === 'object' && reasonCategoryName(outcome.reasonCategory) === name ? {...outcome, reasonCategory: ''} : outcome]));
    return [id, {...state, outcomes}];
  })));
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
export function recordsCSV(records, criteria, notes = {}, includeReview = true, checklists = {}) {
  const extra = includeReview ? ['criteriaVersion', 'criteriaSnapshot', 'reviewStatus', 'numericStatus', 'comparable', 'categories', 'reasons', 'reviewNote', 'followUpChecklist'] : [];
  const headers = [...FIELDS.map(([key]) => key), ...extra];
  return '\uFEFF' + [headers.map(value => csvCell(value, false)).join(','), ...records.map(record => {
    const review = reviewRecord(record, criteria);
    const values = FIELDS.map(([key]) => record[key]);
    if (includeReview) values.push(criteria.version, JSON.stringify(criteria), review.status, review.numericStatus, review.comparable ? '조건 확인됨' : '조건 확인 필요', review.categories.map(key => CATEGORY_LABELS[key]).join(' / '), review.issues.map(issue => `${LABELS[issue.field]}: ${issue.actual === '' ? '미기재' : issue.actual} → ${issue.expected}`).join(' | '), notes[record.measurementId] ?? '', JSON.stringify(followUpProgress(record, criteria, checklists)));
    return values.map(value => csvCell(value, true)).join(',');
  })].join('\r\n');
}

export function unavailableReasonCSV(records, criteria, checklists = {}, category = null) {
  const entries = unavailableEntries(records, criteria, checklists).filter(task => category === null || (task.reasonCategory || '미분류') === category);
  const headers = ['measurementId', 'batchId', 'field', 'reasonCategory', 'reason', 'criteriaVersion'];
  return '\uFEFF' + [headers.map(value => csvCell(value, false)).join(','), ...entries.map(task =>
    [task.measurementId, task.batchId, task.label, task.reasonCategory || '미분류', task.reason, criteria.version].map(value => csvCell(value, true)).join(','))].join('\r\n');
}

export function reportText(records, criteria, notes = {}, source = '합성 시연 데이터', date = new Date().toISOString(), checklists = {}, scope = '현재 검색·필터 결과') {
  const reviews = records.map(record => reviewRecord(record, criteria));
  const unavailable = unavailableEntries(records, criteria, checklists);
  const groups = new Map();
  for (const task of unavailable) {
    const category = task.reasonCategory || '미분류';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(task);
  }
  const text = value => String(value ?? '').replace(/\r\n?/g, '\n');
  const indented = value => text(value).split('\n').map(line => `  ${line}`).join('\n');
  const criteriaLines = [
    `점도: ${criteria.viscosityMin}~${criteria.viscosityMax} mPa·s (경계 포함)`,
    `목표 측정 온도: ${criteria.temperature} ± ${criteria.temperatureTolerance} ℃`,
    `스핀들: ${criteria.spindle}`, `용기: ${criteria.vessel}`, `측정 속도: ${criteria.rpm} rpm`,
    `시료량: ${criteria.volume} mL`, `결과를 읽은 시점: 회전 시작 후 ${criteria.elapsed}초`,
    `토크: ${criteria.torqueMin}~${criteria.torqueMax}%`,
    `제조 온도: ${criteria.manufacturingTemperature} ± ${criteria.manufacturingTolerance} ℃`,
    `제조 교반 속도: ${criteria.mixingRpm} ± ${criteria.mixingRpmTolerance} rpm`,
    `제조 교반 시간: ${criteria.mixingMinutes} ± ${criteria.mixingMinutesTolerance}분`,
    `농도: ${criteria.concentration} ± ${criteria.concentrationTolerance} wt%`,
    ...Object.entries(FIXED_REQUIREMENTS).map(([field, value]) => `${LABELS[field]}: ${value}`)
  ];
  const lines = [
    '고분자 수용액 A — 점도 검토 보고서', '',
    '교육용 가상 기준에 따른 검토입니다. 실제 물성 예측, 원인 확정 또는 출하 승인 결과가 아닙니다.', '',
    `작성: ${date}`, `데이터 출처: ${source}`, `적용 기준: ${criteria.version}`, `보고서 범위: ${scope}`, '',
    '[적용 기준]', ...criteriaLines, '',
    '[검토 요약]', `대상 측정: ${records.length}건`, `대상 배치: ${new Set(records.map(record => record.batchId)).size}개`,
    `기준 충족: ${reviews.filter(review => !review.issues.length).length}건`,
    ...Object.entries(CATEGORY_LABELS).map(([key, label]) => `${label}: ${reviews.filter(review => review.categories.includes(key)).length}건`),
    '범주별 건수는 중복될 수 있습니다. 수치상 범위 내라도 비교 조건 확인이 필요할 수 있습니다.', '',
    '[확인 불가 이유별 모아보기]', `확인 불가 항목: ${unavailable.length}개`, '',
    ...[...groups].flatMap(([category, tasks]) => [`${category} (${tasks.length}개)`, ...tasks.flatMap(task => [
      `  측정: ${task.measurementId} / 항목: ${task.label}`, indented(task.reason.trim() || '메모 미기재')
    ]), '']),
    '[조건 설명]', FOLLOW_UP_EXPLANATION_NOTE, '',
    '[측정별 결과]', ''
  ];
  for (const [index, record] of records.entries()) {
    const result = reviews[index];
    lines.push(
      `(${index + 1}) 배치: ${record.batchId} / 측정: ${record.measurementId}`,
      `시료: ${record.sampleId} / 반복 회차: ${record.repeat} / 측정 일시: ${record.measuredAt}`,
      `점도: ${result.viscosity === null ? '비교 불가' : `${result.viscosity} mPa·s`}`,
      `검토 결과: ${result.status}`, `수치 비교: ${result.numericStatus}`,
      `비교 조건: ${result.comparable ? '확인됨' : '확인 필요'}`, '검토 이유:',
      ...result.issues.map(issue => `  ${LABELS[issue.field]}: 실제 ${missing(issue.actual) ? '미기재' : issue.actual} / 기준 ${issue.expected} / ${issue.reason}`),
      ...(result.issues.length ? [] : ['  가상 기준과 일치']),
      '검토 메모:', indented(text(notes[record.measurementId]).trim() ? notes[record.measurementId] : '미기재'), '',
      '추가 확인 질문과 체크리스트:'
    );
    const tasks = followUpProgress(record, criteria, checklists);
    for (const task of tasks) {
      lines.push(`  항목: ${task.label} / 상태: ${FOLLOW_UP_STATUS_LABELS[task.status]}`,
        `  기록: ${task.actual} / 기준: ${task.expected}`, indented(task.question),
        `  이 항목을 확인하는 이유: ${task.explanation.why}`,
        '  달라지면 생길 수 있는 변화:', indented(task.explanation.effect));
      if (task.status === 'unavailable') lines.push(`  확인 불가 이유 분류: ${task.reasonCategory || '미분류'}`,
        '  확인 불가 이유:', indented(task.reason.trim() || '미기재'));
      if (task.status === 'done') lines.push('  확인 완료 메모:', indented(task.completionNote.trim() || '미기재 (선택 항목)'));
    }
    if (!tasks.length) lines.push('  규칙에서 추가 확인할 차이·누락을 찾지 못했습니다.');
    lines.push('');
  }
  const explanationSources = reportExplanationSources(records, criteria);
  if (explanationSources.length) lines.push('[설명 근거]', ...explanationSources.map(item => `${item.title}: ${item.url}`), '');
  lines.push('[원본 기록]', `이 보고서는 ${scope}의 검토 결과입니다. 원본 CSV와 함께 보관하세요.`,
    '자료 확인 상태는 원인 확정, 판정 변경 또는 출하 승인을 뜻하지 않습니다.');
  return text(lines.join('\n'));
}

const md = value => String(value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', '').replaceAll('\n', '<br>');
export function reportMarkdown(records, criteria, notes = {}, source = '합성 시연 데이터', date = new Date().toISOString(), checklists = {}, scope = '현재 검색·필터 결과') {
  const reviews = records.map(record => reviewRecord(record, criteria));
  const counts = Object.keys(CATEGORY_LABELS).map(key => `- ${CATEGORY_LABELS[key]}: ${reviews.filter(review => review.categories.includes(key)).length}건`);
  const unavailable = unavailableEntries(records, criteria, checklists);
  const reasonGroups = new Map();
  for (const task of unavailable) {
    const category = task.reasonCategory || '미분류';
    if (!reasonGroups.has(category)) reasonGroups.set(category, []);
    reasonGroups.get(category).push(task);
  }
  return [
    '# 고분자 수용액 A — 점도 검토 보고서', '',
    '> 교육용 가상 기준에 따른 검토입니다. 실제 물성 예측, 원인 확정 또는 출하 승인 결과가 아닙니다.', '',
    `작성: ${md(date)}`, `데이터 출처: ${md(source)}`, `적용 기준: ${md(criteria.version)}`, `보고서 범위: ${md(scope)}`, '',
    '## 적용 기준 전체', '', '```json', JSON.stringify(criteria, null, 2).replaceAll('```', '\\u0060\\u0060\\u0060'), '```', '',
    '## 검토 요약', '', `- 대상 측정: ${records.length}건`, `- 대상 배치: ${new Set(records.map(record => record.batchId)).size}개`,
    `- 기준 충족: ${reviews.filter(review => !review.issues.length).length}건`, ...counts,
    '- 범주별 건수는 중복될 수 있습니다. 수치상 범위 내라도 비교 조건 확인이 필요할 수 있습니다.', '',
    '## 확인 불가 이유별 모아보기', '', `- 확인 불가 항목: ${unavailable.length}개`, '',
    ...[...reasonGroups].flatMap(([category, tasks]) => [`### ${md(category)} · ${tasks.length}개`, '', ...tasks.map(task => `- ${md(task.measurementId)} / ${md(task.label)}: ${md(task.reason.trim() || '메모 미기재')}`), '']),
    '## 측정별 결과', '', '| 배치 | 측정 | 점도 (mPa·s) | 검토 | 수치 비교 | 비교 조건 | 이유 | 메모 |', '|---|---|---:|---|---|---|---|---|',
    ...records.map((record, i) => {
      const result = reviews[i];
      return `| ${md(record.batchId)} | ${md(record.measurementId)} | ${md(result.viscosity ?? '비교 불가')} | ${result.status} | ${result.numericStatus} | ${result.comparable ? '확인됨' : '확인 필요'} | ${md(result.issues.map(issue => `${LABELS[issue.field]}: 실제 ${issue.actual === '' ? '미기재' : issue.actual}, 기준 ${issue.expected}`).join('; ') || '가상 기준과 일치')} | ${md(notes[record.measurementId] ?? '')} |`;
    }), '', '## 추가 확인 질문과 체크리스트', '',
    '확인 상태는 사용자가 선택한 자료 확인 결과입니다. 확인 불가는 자료를 확인할 수 없었다는 뜻이며, 원인 확정·판정 변경·출하 승인을 뜻하지 않습니다.', '',
    md(FOLLOW_UP_EXPLANATION_NOTE), '',
    ...records.flatMap(record => {
      const tasks = followUpProgress(record, criteria, checklists);
      return [`### ${md(record.measurementId)}`, '', ...tasks.flatMap(task => [
        `- [${task.checked ? 'x' : ' '}] ${md(task.label)} — 상태: ${FOLLOW_UP_STATUS_LABELS[task.status]}. 기록: ${md(task.actual)} / 기준: ${md(task.expected)}. ${md(task.question)}${task.status === 'unavailable' ? ` 확인 불가 이유 분류: ${md(task.reasonCategory || '미분류')}. 확인 불가 이유: ${md(task.reason.trim() || '미기재')}` : ''}${task.status === 'done' ? ` 확인 완료 메모: ${md(task.completionNote.trim() || '미기재 (선택 항목)')}` : ''}`,
        '', `  **이 항목을 확인하는 이유:** ${md(task.explanation.why)}`,
        '', `  **달라지면 생길 수 있는 변화:** ${md(task.explanation.effect)}`, ''
      ]), ...(tasks.length ? [] : ['규칙에서 추가 확인할 차이·누락을 찾지 못했습니다.']), ''];
    }), ...(() => {
      const sources = reportExplanationSources(records, criteria);
      return sources.length ? ['## 설명 근거', '', ...sources.map(item => `- [${md(item.title)}](${item.url})`), ''] : [];
    })(), '## 원본 기록', '', `원본은 별도의 입력 데이터 CSV 또는 검토 결과 CSV와 함께 보관하세요. 이 보고서는 ${md(scope)}의 검토 결과입니다.`, ''
  ].join('\n');
}
