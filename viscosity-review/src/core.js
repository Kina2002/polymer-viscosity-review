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

export const FOLLOW_UP_EXPLANATION_NOTE = '아래 설명은 일반적인 가능성이에요. 시료에 따라 변화 방향이 다르거나 변화가 없을 수 있어요. 이 가상 기록의 원인이나 변화량을 예측한 결과는 아니에요. 기록이 없으면 실제 조건도 추정하지 않아요.';
const EXPLANATION_SOURCES = {
  flow: {title: 'Brookfield · 온도와 회전 속도의 영향', url: 'https://www.brookfieldengineering.com/brookfield-university/viscosityrheology/impact-of-temperature-and-shear-rate'},
  method: {title: 'Brookfield DV2T · 측정 준비·변수·교정', url: 'https://www.brookfieldengineering.com/-/media/ametekbrookfield/manuals/lab%20viscometers/dv2t%20instructions.pdf'},
  preparation: {title: 'Brookfield · 정확한 점도 측정 안내', url: 'https://www.brookfieldengineering.com/-/media/ametekbrookfield/application-notes-2024/viscosity-rheology/guide-to-accurate-viscosity-measurement-_-best-practices-and-advanced-techniques_ametek_brookfield_tech_guide_released_january_2025.pdf?hash=CF3B7DB11DA28F8751839F026D9D62EE&la=en&revision=36d30653-1260-4587-929a-a35a070736b6'},
  history: {title: 'Brookfield · 시간·시료 이력·조성 (§4.8)', url: 'https://www.brookfieldengineering.cn/-/media/ametekbrookfield/tech-sheets/more-solutions-2017.pdf?hash=09090D1ACADC9DABF6013D1D56D1310C&la=zh-cn&revision=84a81556-8cb8-4667-b3ca-821becc69ab6'}
};
const explanation = (why, effect, source) => Object.freeze({why, effect, source: EXPLANATION_SOURCES[source] ?? null});
const compositionExplanation = explanation('같은 원료와 배합비로 만든 시료를 비교하기 위해 확인해요.', '조성이나 배합비가 달라지면 점도도 달라질 수 있어요. 변화 방향은 원료와 시료 특성에 따라 달라요.', 'history');
const historyExplanation = explanation('측정 전 시료가 겪은 온도·시간·교반 이력을 맞추기 위해 기록해요.', '이력에 민감한 시료는 보관·교반·대기 과정에 따라 점도가 달라질 수 있어요. 이력만으로 높아질지 낮아질지 정하지 않아요.', 'history');
const traceExplanation = explanation('어떤 시료를 어떤 장비로 언제 측정했는지 원본과 결과를 연결하기 위해 확인해요.', '기록이 빠지거나 잘못 연결되면 다른 시료나 시험 방법의 결과를 비교할 수 있어요. 이 정보만으로 점도의 상승·하락을 예측하지 않아요.');
const FOLLOW_UP_EXPLANATIONS = {
  sampleTemperature: explanation('온도의 영향을 배치 차이로 오해하지 않도록 같은 온도에서 비교해요.', '많은 액체는 측정 온도가 높아지면 점도가 낮아질 수 있어요. 열에 의해 구조가 달라지는 시료 등은 다른 반응을 보일 수 있어요.', 'flow'),
  thermalEquilibrium: explanation('시료와 스핀들 등 측정 부품이 목표 측정 온도에서 안정돼야 비교하기 쉬워요.', '온도가 계속 변하면 측정 중 점도 값도 달라질 수 있어요. 한 번 목표 온도가 나왔다고 평형이 확인된 것은 아니에요.', 'method'),
  rpm: explanation('회전 속도는 시료를 얼마나 빠르게 변형시키는지에 영향을 주므로 같은 속도로 비교해요.', '빠르게 돌릴수록 묽게 측정되는 성질(전단박화)이 있는 시료라면 속도가 높을 때 점도가 낮아질 수 있어요. 반대 성질의 시료는 높아지고, 속도의 영향이 없는 시료도 있어요.', 'flow'),
  elapsedSeconds: explanation('회전 시작 후 같은 시점의 값을 비교하기 위해 읽는 시간을 맞춰요.', '시간에 민감한 시료는 같은 속도로 돌려도 점도가 낮아지거나 높아질 수 있어요. 더 오래 돌렸다고 항상 같은 값이 되지는 않아요.', 'history'),
  spindle: explanation('스핀들의 모양·크기가 측정 범위와 시료의 흐름에 영향을 주기 때문에 맞춰요.', '다른 스핀들에서는 토크나 시료가 변형되는 방식이 달라져 점도 값이 달라질 수 있어요. 큰 스핀들이라고 항상 점도가 높지는 않아요.', 'method'),
  vessel: explanation('용기 벽과 스핀들 사이의 공간을 시험 방법과 맞추기 위해 확인해요.', '용기 형태·크기가 달라지면 시료의 흐름이 바뀌어 측정값에 영향을 줄 수 있어요. 변화 방향은 측정 구성에 따라 달라요.', 'method'),
  sampleVolume: explanation('요구된 시료량으로 스핀들 주변의 측정 구성을 맞춰요.', '시료량이 달라지면 액면과 잠기는 상태가 달라져 측정값에 영향을 줄 수 있어요. 양이 많다고 항상 점도가 높지는 않아요.', 'method'),
  immersion: explanation('시험 방법이 정한 깊이에 스핀들을 넣어 같은 접촉 상태로 측정해요.', '너무 얕거나 깊으면 시료와 접촉하는 상태가 달라져 값이 달라질 수 있어요. 깊이만으로 점도의 변화 방향을 정하지 않아요.', 'method'),
  bubbleState: explanation('액체 대신 기포가 측정에 영향을 주지 않도록 시료 준비 상태를 확인해요.', '기포가 있으면 점도 값이 달라지거나 불안정해질 수 있어요. 항상 낮아진다고 단정하지 않고, 육안으로 안 보여도 미세 기포가 있을 수 있어요.', 'preparation'),
  torquePercent: explanation('장비가 신뢰할 수 있는 범위에서 힘을 읽었는지 확인해요.', '토크가 너무 낮으면 상대오차가 커지고 너무 높으면 측정 범위를 넘을 수 있어요. 허용 범위는 실제 장비와 시험 방법에서 확인해야 해요.', 'method'),
  calibrationStatus: explanation('장비의 측정이 정해진 정확도를 유지하는지 교정 기록으로 확인해요.', '교정 상태에 문제가 있으면 측정값이 실제와 어긋날 수 있어요. 기록이 없다는 사실만으로 장비 고장이나 점도의 변화 방향을 확정하지 않아요.', 'preparation'),
  standardCheck: explanation('알려진 점도의 표준액으로 측정 상태를 점검한 근거를 확인해요.', '표준액 점검이 부적합하면 장비·온도·설정 등의 확인이 필요해요. 표준액의 차이만큼 시료 값을 임의로 보정하지 않아요.', 'preparation'),
  levelCheck: explanation('장비가 수평인 상태에서 올바르게 작동하도록 확인해요.', '기울어진 장비는 정상 측정 상태를 벗어날 수 있어요. 이 기록만으로 점도가 높게 나왔는지 낮게 나왔는지는 알 수 없어요.', 'method'),
  zeroCheck: explanation('측정 전에 장비의 기준점을 맞췄는지 확인해요.', '영점에 문제가 있으면 값에 오차가 생길 수 있어요. 오차 방향과 크기는 별도로 확인해야 해요.', 'method'),
  manufacturingTemperature: explanation('시료를 만들 때의 열 이력을 맞춰 같은 제조 과정을 비교해요. 점도를 읽을 때의 온도와는 별개예요.', '열 이력에 민감한 시료는 제조 온도가 달라지면 나중에 같은 온도로 측정해도 점도가 달라질 수 있어요. 높고 낮은 방향은 시료마다 달라요.', 'history'),
  mixingRpm: explanation('시료가 제조 중 받은 교반 이력을 맞추기 위해 속도를 확인해요.', '교반에 민감한 시료는 속도가 달라지면 이후 점도가 달라질 수 있어요. 빠르게 섞었다고 항상 점도가 낮아지는 것은 아니에요.', 'history'),
  mixingMinutes: explanation('얼마나 오래 교반했는지 맞춰 같은 준비 과정을 비교해요.', '교반 시간의 영향이 있는 시료는 더 오래 섞으면 이후 점도가 달라질 수 있어요. 충분히 균일하고 이력 영향이 없다면 차이가 없을 수도 있어요.', 'history'),
  ...Object.fromEntries(['polymerGrade', 'solvent', 'polymerMass', 'solventMass', 'concentration'].map(field => [field, compositionExplanation])),
  ...Object.fromEntries(['additionOrder', 'storageTemperature', 'ageHours', 'preMixing', 'restMinutes'].map(field => [field, historyExplanation])),
  uniformity: explanation('어느 부분을 덜어도 비슷한 시료를 측정할 수 있도록 균일성을 확인해요.', '시료가 균일하지 않으면 채취한 위치에 따라 측정값이 달라질 수 있어요. 육안 확인만으로 완전한 용해나 미세한 균일성을 확정하지 않아요.', 'history'),
  uniformityMethod: explanation('어떤 방법으로 균일성을 확인했는지 알아야 확인 범위를 이해할 수 있어요.', '방법이 다르면 확인할 수 있는 범위도 달라요. 확인 방법의 이름만으로 점도의 변화 방향을 예측하지 않아요.', 'history'),
  viscosity: explanation('조건이 맞는 점도 결과를 정한 범위와 비교하기 위해 확인해요.', '점도 값이 범위를 벗어나도 제조·측정·기록 중 무엇이 원인인지는 이 수치만으로 알 수 없어요. 조건과 반복값·원본 자료를 함께 검토해요.'),
  unit: explanation('같은 종류의 점도를 같은 단위로 비교해야 해요. 이 앱에서 1 cP는 1 mPa·s와 같아요.', '단위를 잘못 읽으면 같은 결과를 다른 크기의 값으로 해석할 수 있어요. 단위 표기 변경 자체가 시료의 물성을 바꾸지는 않아요.', 'method'),
  product: explanation('이 시료에 맞는 제품 기준과 시험 방법을 적용했는지 확인해요.', '다른 제품의 기준을 적용하면 검토 결과가 달라질 수 있어요. 제품 코드만으로 점도 변화의 원인을 알 수는 없어요.')
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
        `  달라지면 생길 수 있는 변화: ${task.explanation.effect}`);
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
