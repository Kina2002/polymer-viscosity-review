import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CRITERIA, FIELDS, NUMERIC_FIELDS, recordsCSV, reportMarkdown } from '../src/core.js';

const target = fileURLToPath(new URL('../data/', import.meta.url));
await mkdir(target, { recursive: true });
let seed = 20261002;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const records = [], expected = [];
const scenarios = ['normal', 'normal', 'normal', 'normal', 'manufacturing', 'measurement', 'missing', 'specification', 'preparation', 'combined'];
for (let batch = 1; batch <= 270; batch++) {
  const scenario = scenarios[(batch - 1) % scenarios.length];
  const batchId = `PA-${String(batch).padStart(3, '0')}`;
  const batchViscosity = 1120 + Math.round(random() * 200);
  for (let repeat = 1; repeat <= 4; repeat++) {
    const measurementId = `${batchId}-M${repeat}`;
    const record = {
      batchId, measurementId, sampleId: `${batchId}-S${repeat}`, repeat,
      measuredAt: new Date(Date.UTC(2026, 8, 1) + batch * 3600000 + repeat * 60000).toISOString().replace('.000', ''),
      product: 'POLY-A', polymerGrade: 'DEMO-P1 (가상)', solvent: '정제수 (가상 기록)',
      polymerMass: 10, solventMass: 990, concentration: 1,
      manufacturingTemperature: 40, mixingRpm: 300, mixingMinutes: 20, additionOrder: '물 → 고분자, 가상 절차',
      uniformity: '육안 덩어리 미관찰', uniformityMethod: '육안; 위치별 농도 분석 미실시',
      storageTemperature: 23, ageHours: 2, sampleTemperature: 25,
      thermalEquilibrium: '완료', bubbleState: '육안 미관찰', preMixing: '추가 교반 없음', restMinutes: 30,
      deviceId: 'DEMO-V01', deviceModel: 'DEMO 회전식 점도계', spindle: 'DEMO-S1', vessel: 'DEMO-600',
      sampleVolume: 400, immersion: '표시 준수', calibrationStatus: '유효 기록 확인', standardCheck: '적합 기록 확인',
      levelCheck: '완료', zeroCheck: '완료', rpm: 60, elapsedSeconds: 60,
      torquePercent: 45 + Math.round(random() * 20), viscosity: batchViscosity + Math.round(random() * 40) - 20,
      unit: repeat === 4 ? 'cP' : 'mPa·s', sourceNote: '합성 데이터; 물성 예측 아님; seed=20261002'
    };
    let categories = [];
    if (scenario === 'manufacturing') { record.manufacturingTemperature = 45; categories = ['manufacturing']; }
    if (scenario === 'measurement') {
      const changes = [['sampleTemperature', 28], ['rpm', 30], ['spindle', 'DEMO-S2'], ['elapsedSeconds', 20]];
      const [key, value] = changes[repeat - 1]; record[key] = value; categories = ['measurement'];
    }
    if (scenario === 'missing') {
      record[['sampleTemperature', 'rpm', 'viscosity', 'thermalEquilibrium'][repeat - 1]] = '';
      categories = ['missing'];
    }
    if (scenario === 'specification') { record.viscosity = repeat % 2 ? 850 : 1680; categories = ['specification']; }
    if (scenario === 'preparation') {
      const [key, value] = [['bubbleState', '관찰됨'], ['thermalEquilibrium', '미확인'], ['immersion', '미준수'], ['torquePercent', 5]][repeat - 1];
      record[key] = value; categories = ['measurement'];
    }
    if (scenario === 'combined') {
      record.manufacturingTemperature = 45; record.sampleTemperature = 28; record.viscosity = 1750;
      categories = ['manufacturing', 'measurement', 'specification'];
    }
    records.push(record);
    // 기대 범주는 시나리오에서 직접 지정한다. 판정 함수의 출력을 정답으로 쓰지 않는다.
    expected.push({ measurementId, scenario, categories: categories.sort() });
  }
}
await writeFile(`${target}/demo-records.json`, JSON.stringify(records, null, 2) + '\n', 'utf8');
await writeFile(`${target}/demo-records.csv`, recordsCSV(records, DEFAULT_CRITERIA, {}, false), 'utf8');
await writeFile(`${target}/expected-results.json`, JSON.stringify(expected, null, 2) + '\n', 'utf8');
const docs = fileURLToPath(new URL('../docs/', import.meta.url));
await mkdir(docs, { recursive: true });
await writeFile(`${docs}/예시_검토보고서.md`, reportMarkdown(records.slice(0, 40), DEFAULT_CRITERIA,
  {'PA-006-M2': '실제 측정 속도 30 rpm과 가상 방법 60 rpm의 차이를 확인할 것.'},
  'seed 20261002 합성 시연 데이터의 첫 10배치', '2026-10-02 (고정 시연 보고서)'), 'utf8');
await writeFile(`${target}/데이터_사전.md`, [
  '# 점도 기록 데이터 사전', '',
  '모든 항목의 기록 유무를 확인합니다. 숫자 열에는 단위를 붙이지 않습니다. 문자 상태의 허용값과 자동 비교 여부는 앱 README를 참고하세요.', '',
  '| CSV 열 이름 | 화면 이름 | 형식 |', '|---|---|---|',
  ...FIELDS.map(([key, label]) => `| \`${key}\` | ${label} | ${NUMERIC_FIELDS.has(key) ? '숫자' : '문자'} |`), '',
  '추가 설명: `measuredAt`은 시간대 포함 ISO 일시입니다. `repeat`은 1 이상의 정수입니다. 배치 번호와 측정 번호는 필수이며 측정 번호는 파일 내에서 고유해야 합니다.', '',
  '값이 필요한 항목을 확인하지 않았다면 빈칸 또는 해당 상태를 정확히 기록합니다. 기포는 `육안 미관찰`, `관찰됨`, `확인 불가`, `미확인` 등을 구분하고 미확인 상태를 기포 없음으로 치환하지 않습니다.', '',
  '`preMixing`은 측정 전 추가 교반의 방법·속도·시간을 담는 기록용 문자 필드이고, `restMinutes`는 교반/준비 후 대기 시간입니다. 현재 데모에는 추가 교반 없음으로 설정했습니다.', ''
].join('\n'), 'utf8');
console.log(`합성 기록 ${records.length}건 / ${new Set(records.map(r => r.batchId)).size}배치 생성 완료`);
