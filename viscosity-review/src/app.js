import { DEFAULT_CRITERIA, CONDITION_FIELDS, conditionValue, validateConditionFilter, matchesConditionFilter, describeConditionFilter, CATEGORY_LABELS, FOLLOW_UP_STATUS_LABELS, DEFAULT_REASON_CATEGORIES, reasonCategoryName, validateReasonCategory, unavailableEntries, removeReasonCategory, unavailableReasonCSV, numeric, reviewRecord, comparisonRows, followUpSignature, followUpProgress, validateCriteria, parseCSV, recordsCSV, reportMarkdown, reportText } from './core.js';

const $ = id => document.getElementById(id);
const format = value => numeric(value) === null ? '—' : Number(value).toLocaleString('ko-KR', {maximumFractionDigits: 2});
const formatViscosity = value => numeric(value) === null ? '—' : Number(value).toLocaleString('ko-KR', {maximumFractionDigits: 20});
function viscosityDisplay(record) {
  const value = numeric(record.viscosity);
  if (value === null) return String(record.viscosity ?? '').trim() ? String(record.viscosity) : '미기재';
  return `${formatViscosity(value)} ${record.unit || '(단위 미기재)'}`;
}
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function message(text, error = false) {
  $('message').textContent = text; $('message').hidden = false;
  $('message').classList.toggle('error', error);
}
function stored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { message('브라우저 저장 공간을 사용할 수 없습니다. 메모와 기준은 보고서로 내려받아 보관하세요.', true); return false; }
}
const savedCriteria = stored('poly-criteria-v1', DEFAULT_CRITERIA);
let criteria = {...(validateCriteria(savedCriteria).length ? DEFAULT_CRITERIA : savedCriteria)};
let records = [], reviews = new Map(), batchMap = new Map(), filtered = [], selectedId = null;
let page = 0, datasetKey = 'demo-20261002', source = '합성 시연 데이터', notes = Object.create(null);
let checklists = Object.create(null);
const categoryStorageKey = 'poly-unavailable-categories-v1';
const savedReasonCategories = stored(categoryStorageKey, null);
let reasonCategories = [];
for (const value of Array.isArray(savedReasonCategories) ? savedReasonCategories : DEFAULT_REASON_CATEGORIES) {
  const name = reasonCategoryName(value);
  if (!validateReasonCategory(name, reasonCategories)) reasonCategories.push(name);
}
let unavailableCache = [], unavailablePage = 0, reasonCategoryTarget = null;
const REASON_PAGE_SIZE = 20;
const PAGE_SIZE = 10;
let comparisonOnlyIssues = false;
let comparisonExpanded = false;
const comparisonGroupExpanded = new Map();
const selectedReportIds = new Set();
const REPORT_FORMAT_LABELS = {txt: 'TXT', md: 'Markdown'};
let reportFormat = 'txt';
let activeCondition = null;

function conditionDisplay(record, field) {
  const definition = CONDITION_FIELDS.find(item => item.field === field), value = conditionValue(record, field);
  if (value === null) return String(record[field] ?? '').trim() || '미기재';
  if (definition.type === 'text') return value;
  if (field === 'viscosity') return viscosityDisplay(record);
  return `${formatViscosity(value)}${definition.unit ? ` ${definition.unit}` : ''}`;
}
function draftCondition() {
  const field = $('condition-field').value, definition = CONDITION_FIELDS.find(item => item.field === field);
  if (!$('condition-limit').checked) return {field, mode: 'all'};
  return definition?.type === 'number' ? {field, mode: 'range', center: $('condition-center').value, tolerance: $('condition-tolerance').value}
    : {field, mode: 'value', value: $('condition-value').value};
}
function updateConditionPreview() {
  const filter = draftCondition(), error = validateConditionFilter(filter);
  $('condition-error').hidden = true;
  const limited = $('condition-limit').checked;
  for (const id of ['condition-center', 'condition-tolerance', 'condition-value']) $(id).disabled = !limited;
  $('condition-preview').textContent = error || `적용하면 볼 기록: ${describeConditionFilter(filter)}`;
}
function fillConditionDraft() {
  const definition = CONDITION_FIELDS.find(item => item.field === $('condition-field').value);
  if (!definition) return;
  $('condition-number-fields').hidden = definition.type !== 'number'; $('condition-text-fields').hidden = definition.type !== 'text';
  $('condition-unit').textContent = definition.unit;
  if (definition.type === 'number') {
    $('condition-center').value = definition.field === 'manufacturingTemperature' ? 45 : conditionValue(records[0] ?? {}, definition.field) ?? 0;
    $('condition-tolerance').value = ({mixingRpm: 30, rpm: 0, concentration: 0.05, viscosity: 100, sampleVolume: 10})[definition.field] ?? 2;
  } else {
    const select = $('condition-value'); select.replaceChildren();
    const values = [...new Set(records.map(record => String(record[definition.field] ?? '')))];
    for (const value of values.sort((a,b) => a.localeCompare(b,'ko-KR'))) {
      const option = element('option', '', value.trim() ? value : '미기재'); option.value = value; select.append(option);
    }
  }
  updateConditionPreview();
}
function prepareConditionControls() {
  const select = $('condition-field'); select.replaceChildren();
  for (const [type, name] of [['number','숫자로 기록하는 항목'],['text','종류·상태로 기록하는 항목']]) {
    const group = element('optgroup'); group.label = name;
    for (const definition of CONDITION_FIELDS.filter(item => item.type === type)) {
      const option = element('option', '', definition.label); option.value = definition.field; group.append(option);
    }
    select.append(group);
  }
  select.value = 'manufacturingTemperature'; $('condition-limit').checked = true; fillConditionDraft();
}
const chartFieldLabel = definition => definition.field === 'viscosity' ? '점도 (mPa·s)' : definition.label;
function prepareChartControls() {
  const xSelect = $('chart-axis'), ySelect = $('chart-y-field');
  xSelect.replaceChildren(); ySelect.replaceChildren();
  for (const [value, label] of [['batch', '배치 순서'], ['condition', '적용한 조건']]) {
    const option = element('option', '', label); option.value = value; xSelect.append(option);
  }
  for (const [type, label] of [['number','숫자로 기록하는 항목'], ['text','종류·상태로 기록하는 항목']]) {
    const group = element('optgroup'); group.label = label;
    for (const definition of CONDITION_FIELDS.filter(item => item.type === type)) {
      const option = element('option', '', chartFieldLabel(definition)); option.value = `field:${definition.field}`; group.append(option);
      if (type === 'number') {
        const yOption = element('option', '', chartFieldLabel(definition)); yOption.value = definition.field; ySelect.append(yOption);
      }
    }
    xSelect.append(group);
  }
  ySelect.value = 'viscosity';
}
function updateConditionStatus() {
  $('condition-summary').textContent = describeConditionFilter(activeCondition);
  $('clear-condition').disabled = !activeCondition;
  const option = $('chart-axis').querySelector('[value="condition"]');
  option.disabled = !activeCondition;
  option.textContent = '적용한 조건';
  if (activeCondition) option.textContent = `적용 조건: ${chartFieldLabel(CONDITION_FIELDS.find(item => item.field === activeCondition.field))}`;
}

function loadRecords(next, name, key) {
  records = next; source = name; datasetKey = key;
  selectedReportIds.clear(); $('report-scope').value = 'filtered';
  notes = Object.assign(Object.create(null), stored(`poly-notes-${datasetKey}`, {}));
  checklists = Object.assign(Object.create(null), stored(`poly-checklists-${datasetKey}`, {}));
  batchMap = new Map();
  for (const record of records) {
    if (!batchMap.has(record.batchId)) batchMap.set(record.batchId, []);
    batchMap.get(record.batchId).push(record);
  }
  selectedId = records[0]?.measurementId ?? null;
  $('source-name').textContent = name;
  $('source-description').textContent = key === 'demo-20261002' ? '270개 배치 × 4회 측정 · 모든 수치는 합성된 가상 값입니다.' : '업로드 파일을 브라우저에서 검토합니다. 원본 파일은 수정하지 않습니다.';
  prepareConditionControls(); prepareChartControls(); resetFilters(); recalculate();
}
function recalculate() {
  reviews = new Map(records.map(record => [record.measurementId, reviewRecord(record, criteria)]));
  $('total-count').textContent = records.length.toLocaleString('ko-KR');
  $('batch-count').textContent = `${batchMap.size.toLocaleString('ko-KR')}개 제조 배치 · 개별 측정 기록`;
  const pass = [...reviews.values()].filter(review => !review.issues.length).length;
  $('pass-count').textContent = pass.toLocaleString('ko-KR');
  $('review-count').textContent = (records.length - pass).toLocaleString('ko-KR');
  $('criteria-version').textContent = criteria.version;
  unavailableCache = unavailableEntries(records, criteria, checklists); unavailablePage = 0; renderUnavailableSummary();
  renderCategoryCounts(); applyFilters();
}
function resetFilters() {
  $('search').value = ''; $('status-filter').value = 'all'; $('category-filter').value = 'all'; page = 0;
  activeCondition = null; $('chart-axis').value = 'batch'; $('chart-y-field').value = 'viscosity'; updateConditionStatus();
  $('condition-error').hidden = true;
}
function applyFilters() {
  const query = $('search').value.trim().toLowerCase();
  const status = $('status-filter').value, category = $('category-filter').value;
  filtered = records.filter(record => {
    const review = reviews.get(record.measurementId);
    return (!query || [record.batchId, record.measurementId, record.sampleId].some(value => String(value ?? '').toLowerCase().includes(query)))
      && (status === 'all' || (status === 'pass' ? !review.issues.length : !!review.issues.length))
      && (category === 'all' || review.categories.includes(category))
      && matchesConditionFilter(record, activeCondition);
  });
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  if (!filtered.some(record => record.measurementId === selectedId)) selectedId = filtered[0]?.measurementId ?? null;
  $('filtered-count').textContent = `현재 ${filtered.length.toLocaleString('ko-KR')}건 / 전체 ${records.length.toLocaleString('ko-KR')}건`;
  $('condition-result-count').hidden = !activeCondition;
  $('condition-result-count').textContent = `결과 ${filtered.length.toLocaleString('ko-KR')} / ${records.length.toLocaleString('ko-KR')}건`;
  $('export-csv').disabled = !filtered.length;
  renderRows(); renderDetail(); renderChart();
}
function renderCategoryCounts() {
  const container = $('category-counts'); container.replaceChildren();
  for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
    const button = element('button', 'category-button'); button.type = 'button'; button.dataset.category = category;
    const span = element('span'); span.append(element('i'), element('span', '', label));
    const count = [...reviews.values()].filter(review => review.categories.includes(category)).length;
    button.append(span, element('strong', '', `${count.toLocaleString('ko-KR')}건`));
    button.addEventListener('click', () => { $('category-filter').value = category; $('status-filter').value = 'all'; page = 0; applyFilters(); $('records').scrollIntoView({behavior: 'instant', block: 'start'}); });
    container.append(button);
  }
}
function renderRows() {
  const tbody = $('record-rows'); tbody.replaceChildren();
  for (const record of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const review = reviews.get(record.measurementId), tr = element('tr');
    tr.classList.toggle('selected', record.measurementId === selectedId);
    const selectCell = element('td', 'report-select-cell'), selectLabel = element('label');
    const checkbox = element('input', 'report-record-check'); checkbox.type = 'checkbox';
    checkbox.dataset.measurementId = record.measurementId;
    checkbox.setAttribute('aria-label', `${record.measurementId} 보고서에 담기`);
    checkbox.addEventListener('change', () => changeReportSelection([record.measurementId], checkbox.checked));
    selectLabel.append(checkbox); selectCell.append(selectLabel);
    const name = element('td'), button = element('button', 'record-link', record.batchId);
    button.append(element('span', '', `${record.measurementId} · ${record.repeat || '?'}회차`));
    if (activeCondition) {
      const definition = CONDITION_FIELDS.find(item => item.field === activeCondition.field);
      button.append(element('small', 'record-condition-value', `${definition.label.replace(/ \([^)]+\)$/, '')}: ${conditionDisplay(record, definition.field)}`));
    }
    button.setAttribute('aria-label', `${record.measurementId} 상세 기록`);
    button.setAttribute('aria-pressed', String(record.measurementId === selectedId));
    button.addEventListener('click', () => select(record.measurementId));
    name.append(button);
    const status = element('td'); status.append(element('span', `badge${review.issues.length ? ' warning' : ''}`, review.status));
    tr.append(selectCell, name, element('td', 'number-cell', review.viscosity === null ? '—' : viscosityDisplay(record)), element('td', '', format(record.sampleTemperature)), status);
    tbody.append(tr);
  }
  if (!filtered.length) {
    const row = element('tr'), cell = element('td', 'empty-row', '해당하는 기록이 없습니다. 검색어나 필터를 바꿔보세요.'); cell.colSpan = 5; row.append(cell); tbody.append(row);
  }
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  $('page-label').textContent = `${page + 1} / ${pages} 페이지 · 한 페이지 ${PAGE_SIZE}건`;
  $('previous-page').disabled = page === 0; $('next-page').disabled = page + 1 >= pages;
  updateReportControls();
}
function reportRecords() {
  return $('report-scope').value === 'selected' ? records.filter(record => selectedReportIds.has(record.measurementId)) : filtered;
}
function changeReportSelection(ids, checked) {
  const wasEmpty = selectedReportIds.size === 0;
  for (const id of ids) if (checked) selectedReportIds.add(id); else selectedReportIds.delete(id);
  if (checked && wasEmpty) $('report-scope').value = 'selected';
  updateReportControls();
}
function updateReportControls() {
  $('report-scope').querySelector('[value="filtered"]').textContent = `검색·필터 결과 ${filtered.length.toLocaleString('ko-KR')}건`;
  $('report-scope').querySelector('[value="selected"]').textContent = `체크한 기록 ${selectedReportIds.size.toLocaleString('ko-KR')}건`;
  $('report-selection-count').textContent = `보고서에 담을 기록 ${selectedReportIds.size.toLocaleString('ko-KR')}건 체크`;
  $('clear-report-selection').disabled = !selectedReportIds.size;
  for (const checkbox of document.querySelectorAll('.report-record-check')) {
    checkbox.checked = selectedReportIds.has(checkbox.dataset.measurementId);
    checkbox.closest('tr').classList.toggle('report-selected', checkbox.checked);
  }
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const checkedCount = visible.filter(record => selectedReportIds.has(record.measurementId)).length;
  $('select-visible-records').checked = !!visible.length && checkedCount === visible.length;
  $('select-visible-records').indeterminate = checkedCount > 0 && checkedCount < visible.length;
  $('select-visible-records').disabled = !visible.length;
  const hasReport = reportRecords().length > 0;
  $('export-report').disabled = !hasReport;
}
function select(id) {
  selectedId = id;
  const index = filtered.findIndex(record => record.measurementId === id);
  if (index >= 0) page = Math.floor(index / PAGE_SIZE);
  renderRows(); renderDetail(); updateChartSelection();
  if (window.matchMedia('(max-width: 650px)').matches) $('detail').scrollIntoView({behavior: 'instant', block: 'start'});
}
function openChartRecord(id) {
  if (!records.some(record => record.measurementId === id)) return;
  if (!filtered.some(record => record.measurementId === id)) { resetFilters(); applyFilters(); }
  select(id);
  $('detail').focus({preventScroll: true});
  $('detail').scrollIntoView({behavior: 'instant', block: 'start'});
}
function updateChartSelection() {
  for (const point of $('chart').querySelectorAll('.chart-point')) {
    const selected = point.dataset.measurementId === selectedId;
    point.classList.toggle('selected', selected);
    point.setAttribute('aria-pressed', String(selected));
  }
}
function renderComparison(record) {
  const section = element('details', 'detail-section comparison-section'); section.open = comparisonExpanded;
  section.addEventListener('toggle', () => { if (section.isConnected) comparisonExpanded = section.open; });
  const heading = element('summary', 'comparison-heading');
  heading.append(element('h3', '', '실험 기록 ↔ 검토 기준'));
  const toggleLabel = element('span', 'comparison-toggle-label'); toggleLabel.setAttribute('aria-hidden', 'true');
  toggleLabel.append(element('span', 'comparison-expand-label', '펼치기'), element('span', 'comparison-collapse-label', '접기'));
  heading.append(toggleLabel); section.append(heading);
  const edit = element('button', 'text-button', '기준 수정 ↗'); edit.type = 'button';
  edit.addEventListener('click', openCriteria);
  const tools = element('div', 'comparison-tools');
  tools.append(element('p', 'comparison-intro', `적용 기준: ${criteria.version} · 교육용 가상 기준`), edit); section.append(tools);
  const label = element('label', 'comparison-filter');
  const filter = element('input'); filter.type = 'checkbox'; filter.id = 'comparison-only-issues'; filter.checked = comparisonOnlyIssues;
  label.append(filter, document.createTextNode('확인할 항목만 보기'));
  const displayTools = element('div', 'comparison-display-tools'), groupActions = element('div', 'comparison-group-actions');
  const expandAll = element('button', 'text-button', '모두 펼치기'), collapseAll = element('button', 'text-button', '모두 접기');
  expandAll.type = collapseAll.type = 'button'; expandAll.id = 'expand-comparison-groups'; collapseAll.id = 'collapse-comparison-groups';
  groupActions.append(expandAll, collapseAll); displayTools.append(label, groupActions); section.append(displayTools);
  const groups = element('div', 'comparison-groups'); section.append(groups);
  const allRows = comparisonRows(record, criteria);
  const rowsByGroup = new Map();
  for (const row of allRows) {
    if (!rowsByGroup.has(row.group)) rowsByGroup.set(row.group, []);
    rowsByGroup.get(row.group).push(row);
  }
  const draw = () => {
    rememberComparisonGroups(groups); groups.replaceChildren();
    for (const [name, fullRows] of rowsByGroup) {
      const rows = fullRows.filter(row => !comparisonOnlyIssues || row.warning);
      if (!rows.length) continue;
      const group = element('details', 'comparison-category'); group.dataset.group = name;
      group.open = comparisonGroupExpanded.get(name) ?? false;
      group.addEventListener('toggle', () => { if (group.isConnected) comparisonGroupExpanded.set(name, group.open); });
      const summary = element('summary', 'comparison-category-heading'), title = element('span', 'comparison-category-title');
      title.append(element('strong', '', name));
      const warningCount = fullRows.filter(row => row.warning).length;
      title.append(element('small', warningCount ? 'comparison-category-attention' : '',
        `${fullRows.length}항목 · ${warningCount ? `확인할 항목 ${warningCount}개` : '확인할 항목 없음'}`));
      const toggle = element('span', 'comparison-category-toggle'); toggle.setAttribute('aria-hidden', 'true');
      toggle.append(element('span', 'category-expand-label', '펼치기'), element('span', 'category-collapse-label', '접기'));
      summary.append(title, toggle); group.append(summary);
      const scroll = element('div', 'comparison-scroll'); scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `${name}의 실험 기록과 검토 기준 비교표`);
      const table = element('table', 'comparison-table');
      table.append(element('caption', 'sr-only', `${record.measurementId} / ${name} / ${rows.length}개 기록과 현재 검토 기준 비교`));
      const head = element('thead'), header = element('tr');
      for (const label of ['항목', '실험 기록', '검토 기준', '확인 결과']) {
        const cell = element('th', '', label); cell.scope = 'col'; header.append(cell);
      }
      head.append(header); const body = element('tbody'); table.append(head, body); scroll.append(table); group.append(scroll); groups.append(group);
      for (const row of rows) {
        const tr = element('tr', `comparison-row${row.warning ? ' needs-review' : ''}`); tr.dataset.field = row.field;
        const name = element('th', 'comparison-name', row.label); name.scope = 'row';
        const actual = element('td', 'comparison-actual', row.field === 'viscosity' ? viscosityDisplay(record) : row.actual); actual.dataset.label = '실험 기록';
        const expected = element('td', 'comparison-expected', row.expected); expected.dataset.label = '검토 기준';
        const status = element('td', 'comparison-status'); status.dataset.label = '확인 결과';
        status.append(element('span', `badge${row.warning ? ' warning' : !row.hasRule ? ' muted-badge' : ''}`, row.status));
        for (const issue of row.issues) status.append(element('small', 'comparison-reason', issue.reason));
        tr.append(name, actual, expected, status); body.append(tr);
      }
    }
    expandAll.disabled = collapseAll.disabled = !groups.childElementCount;
    if (!groups.childElementCount) groups.append(element('p', 'comparison-empty', '이 측정에서 확인할 차이·누락이 없습니다. 전체 항목을 보려면 체크를 해제하세요.'));
  };
  const setAll = open => {
    for (const name of rowsByGroup.keys()) comparisonGroupExpanded.set(name, open);
    for (const group of groups.querySelectorAll('.comparison-category')) group.open = open;
  };
  expandAll.addEventListener('click', () => setAll(true)); collapseAll.addEventListener('click', () => setAll(false));
  filter.addEventListener('change', () => { comparisonOnlyIssues = filter.checked; draw(); }); draw();
  section.append(element('p', 'comparison-footnote', '「기록 있음」은 값이 기록되었다는 뜻이에요. 비교 기준이 없는 항목까지 적합하다고 판정한 것은 아닙니다.'));
  return section;
}
function rememberComparisonGroups(container) {
  for (const group of container.querySelectorAll('.comparison-category')) comparisonGroupExpanded.set(group.dataset.group, group.open);
}
function renderComparisonGuide(record) {
  const rows = comparisonRows(record, criteria);
  const warnings = rows.filter(row => row.warning);
  const targets = warnings.length ? warnings : ['viscosity', 'sampleTemperature', 'rpm'].map(field => rows.find(row => row.field === field));
  const guide = element('section', 'comparison-guide');
  guide.setAttribute('aria-label', '먼저 비교할 값 안내');
  guide.append(element('h3', '', warnings.length ? '먼저 이 값을 비교하세요' : '이 값을 기준과 비교하세요'));
  guide.append(element('p', 'guide-intro', warnings.length
    ? `확인이 필요한 ${warnings.length}개 항목의 실험 기록과 기준입니다.`
    : '표시 점도의 범위와 측정 조건을 함께 확인하세요.'));
  const units = {viscosity: record.unit, sampleTemperature: '℃', manufacturingTemperature: '℃', rpm: 'rpm', mixingRpm: 'rpm', elapsedSeconds: '초', mixingMinutes: '분', sampleVolume: 'mL', torquePercent: '%', concentration: 'wt%'};
  const item = row => {
    const wrapper = element('li', 'guide-item'); wrapper.dataset.field = row.field;
    wrapper.append(element('strong', 'guide-label', row.label));
    const pair = element('div', 'guide-pair');
    const actual = row.field === 'viscosity' ? viscosityDisplay(record)
      : units[row.field] && numeric(record[row.field]) !== null ? `${row.actual} ${units[row.field]}` : row.actual;
    const actualValue = element('span', 'guide-actual'); actualValue.append(element('small', '', '실험 기록'), element('span', '', actual));
    const expected = element('span', 'guide-expected'); expected.append(element('small', '', '비교할 기준'), element('span', '', row.expected));
    const arrow = element('span', 'guide-arrow', '↔'); arrow.setAttribute('aria-hidden', 'true');
    pair.append(actualValue, arrow, expected); wrapper.append(pair);
    return wrapper;
  };
  const list = element('ul', 'guide-list'); targets.slice(0, 4).forEach(row => list.append(item(row))); guide.append(list);
  if (targets.length > 4) {
    const more = element('details', 'guide-more'); more.append(element('summary', '', `나머지 ${targets.length - 4}개 비교할 값 보기`));
    const rest = element('ul', 'guide-list'); targets.slice(4).forEach(row => rest.append(item(row))); more.append(rest); guide.append(more);
  }
  guide.append(element('p', 'guide-footnote', `적용 기준: ${criteria.version} · 아래 비교표에서 확인 결과와 이유를 볼 수 있어요.`));
  return guide;
}
function renderFollowUps(record) {
  const tasks = followUpProgress(record, criteria, checklists);
  const section = element('section', 'detail-section follow-up-section');
  section.append(element('h3', '', '다음 확인 질문 · 체크리스트'));
  section.append(element('p', 'follow-up-intro', '자료를 확인했다면 체크하세요. 자료가 없거나 확인할 수 없다면 아래 「확인 불가」를 누르고 이유를 남기세요.'));
  const progress = element('p', 'follow-up-progress'); progress.setAttribute('role', 'status');
  const update = () => { progress.textContent = `확인 완료 ${tasks.filter(task => task.status === 'done').length}개 · 확인 불가 ${tasks.filter(task => task.status === 'unavailable').length}개 · 미확인 ${tasks.filter(task => task.status === 'pending').length}개`; progress.hidden = !tasks.length; };
  const save = () => {
    checklists[record.measurementId] = {signature: followUpSignature(record, criteria),
      checked: tasks.filter(task => task.status === 'done').map(task => task.id),
      outcomes: Object.fromEntries(tasks.map(task => [task.id, {status: task.status, reason: task.status === 'unavailable' ? task.reason : '', reasonCategory: task.status === 'unavailable' ? task.reasonCategory : '', completionNote: task.completionNote}]))};
    store(`poly-checklists-${datasetKey}`, checklists); update(); updateUnavailableRecord(record);
  };
  update(); section.append(progress);
  const list = element('div', 'follow-up-list');
  let previousCategory = null;
  for (const task of tasks) {
    if (task.category !== previousCategory) {
      list.append(element('h4', 'follow-up-category', CATEGORY_LABELS[task.category])); previousCategory = task.category;
    }
    const card = element('div', 'follow-up-task'); card.dataset.task = task.id;
    card.append(element('strong', 'follow-up-label', task.label), element('p', 'follow-up-evidence', `실험 기록: ${task.actual} / 검토 기준: ${task.expected}`), element('p', 'follow-up-question', task.question));
    const label = element('label', 'follow-up-check');
    const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.checked = task.checked;
    checkbox.setAttribute('aria-label', `${record.measurementId} ${task.label} 자료 확인`);
    const completionFields = element('div', 'follow-up-completion-fields');
    const completionLabel = element('label', 'follow-up-completion-label', '확인 완료 메모 (선택)');
    const completionNote = element('textarea', 'follow-up-completion-note'); completionNote.maxLength = 2000; completionNote.rows = 2;
    completionNote.value = task.completionNote;
    completionNote.placeholder = '확인한 자료, 확인한 내용과 추가로 확인할 점을 적으세요.';
    completionLabel.append(completionNote); completionFields.append(completionLabel,
      element('p', 'note-hint', '입력하면 이 브라우저에 자동 저장되고 보고서에도 포함돼요.'));
    completionNote.addEventListener('input', () => { task.completionNote = completionNote.value; save(); });
    const badge = element('span', 'badge follow-up-status'); badge.setAttribute('role', 'status');
    const unavailable = element('button', 'follow-up-unavailable', '확인 불가'); unavailable.type = 'button';
    unavailable.setAttribute('aria-label', `${record.measurementId} ${task.label} 확인 불가`);
    const reasonFields = element('div', 'follow-up-reason-fields');
    const categoryLabel = element('label', 'follow-up-reason-category-label', '확인 불가 이유 분류');
    const categorySelect = element('select', 'follow-up-reason-category');
    const unclassified = element('option', '', '미분류'); unclassified.value = ''; categorySelect.append(unclassified);
    const options = [...new Set([...reasonCategories, ...(task.reasonCategory ? [task.reasonCategory] : [])])];
    for (const name of options) { const option = element('option', '', name); option.value = name; categorySelect.append(option); }
    categorySelect.value = task.reasonCategory;
    categoryLabel.append(categorySelect);
    const manage = element('button', 'text-button follow-up-manage-categories', '분류 추가·삭제'); manage.type = 'button';
    manage.addEventListener('click', () => openReasonCategories({measurementId: record.measurementId, taskId: task.id}));
    categorySelect.addEventListener('change', () => { task.reasonCategory = categorySelect.value; save(); });
    const reasonLabel = element('label', 'follow-up-reason-label', '확인 불가 이유 메모');
    const reason = element('textarea', 'follow-up-reason'); reason.maxLength = 2000; reason.value = task.reason;
    reason.placeholder = '예: 원본 실험 기록에 측정 온도가 없어 확인할 수 없음'; reason.rows = 2;
    reasonLabel.append(reason); reasonFields.append(categoryLabel, manage, reasonLabel,
      element('p', 'note-hint', '분류와 메모는 입력하면 이 브라우저에 자동 저장돼요.'));
    const refresh = () => {
      card.dataset.status = task.status; checkbox.checked = task.status === 'done';
      badge.textContent = FOLLOW_UP_STATUS_LABELS[task.status];
      badge.classList.toggle('warning', task.status === 'unavailable'); badge.classList.toggle('muted-badge', task.status === 'pending');
      unavailable.setAttribute('aria-pressed', String(task.status === 'unavailable'));
      reasonFields.hidden = task.status !== 'unavailable';
      completionFields.hidden = task.status !== 'done';
    };
    checkbox.addEventListener('change', () => {
      task.status = checkbox.checked ? 'done' : 'pending'; refresh(); save();
    });
    unavailable.addEventListener('click', () => { task.status = task.status === 'unavailable' ? 'pending' : 'unavailable'; refresh(); save(); });
    reason.addEventListener('input', () => { task.reason = reason.value; save(); });
    label.append(checkbox, document.createTextNode('자료 확인 완료'));
    const actions = element('div', 'follow-up-actions'); actions.append(unavailable, badge);
    card.append(label, completionFields, actions, reasonFields); refresh(); list.append(card);
  }
  if (!tasks.length) list.append(element('p', 'follow-up-empty', '규칙에서 추가 확인할 차이·누락을 찾지 못했어요. 별도로 확인한 내용은 검토 메모에 남기세요.'));
  section.append(list, element('p', 'follow-up-note', '확인 불가를 다시 누르면 미확인으로 돌아갑니다. 자료 확인 상태는 판정 변경이나 출하 승인이 아닙니다. 기준·원본 기록이 달라지면 이전 상태를 적용하지 않습니다. 상태·이유는 결과 CSV와 보고서에 포함됩니다.'));
  return section;
}

function updateUnavailableRecord(record) {
  unavailableCache = unavailableCache.filter(task => task.measurementId !== record.measurementId).concat(unavailableEntries([record], criteria, checklists));
  renderUnavailableSummary();
}
function renderUnavailableSummary() {
  $('unavailable-count').textContent = `${unavailableCache.length}개 항목`;
  const filter = $('unavailable-filter'), selected = filter.value;
  const counts = new Map();
  for (const task of unavailableCache) { const name = task.reasonCategory || '미분류'; counts.set(name, (counts.get(name) || 0) + 1); }
  const all = element('option', '', `전체 분류 (${unavailableCache.length}개)`); all.value = ''; filter.replaceChildren(all);
  const names = [...new Set([...reasonCategories, ...counts.keys(), '미분류'])].filter(name => counts.has(name));
  for (const name of names) { const option = element('option', '', `${name} (${counts.get(name)}개)`); option.value = name; filter.append(option); }
  filter.value = counts.has(selected) ? selected : '';
  const entries = unavailableCache.filter(task => !filter.value || (task.reasonCategory || '미분류') === filter.value)
    .sort((a, b) => (a.reasonCategory || '미분류').localeCompare(b.reasonCategory || '미분류', 'ko') || String(a.measurementId).localeCompare(String(b.measurementId), 'ko') || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(entries.length / REASON_PAGE_SIZE));
  unavailablePage = Math.max(0, Math.min(unavailablePage, pages - 1));
  $('unavailable-page-label').textContent = `${entries.length}개 항목 · ${unavailablePage + 1} / ${pages} 페이지`;
  $('unavailable-previous').disabled = unavailablePage === 0; $('unavailable-next').disabled = unavailablePage + 1 >= pages;
  $('export-unavailable').disabled = entries.length === 0;
  const list = $('unavailable-list'); list.replaceChildren();
  if (!$('unavailable-summary').open) return;
  let previousCategory = null;
  for (const task of entries.slice(unavailablePage * REASON_PAGE_SIZE, (unavailablePage + 1) * REASON_PAGE_SIZE)) {
    const category = task.reasonCategory || '미분류';
    if (category !== previousCategory) { list.append(element('h3', 'unavailable-group-title', `${category} · ${counts.get(category)}개`)); previousCategory = category; }
    const card = element('article', 'unavailable-entry'); card.dataset.measurement = task.measurementId;
    card.append(element('h4', '', `${task.measurementId} · ${task.label}`), element('p', 'unavailable-entry-evidence', `배치 ${task.batchId} · 실험 기록: ${task.actual} / 기준: ${task.expected}`));
    card.append(element('p', 'unavailable-entry-note', task.reason.trim() || '메모를 아직 남기지 않았어요.'));
    const open = element('button', 'text-button unavailable-open-record', '측정 기록 열기'); open.type = 'button';
    open.setAttribute('aria-label', `${task.measurementId} ${task.label} 측정 기록 열기`);
    open.addEventListener('click', () => { resetFilters(); $('search').value = task.measurementId; applyFilters(); select(task.measurementId); $('detail').scrollIntoView({behavior: 'instant', block: 'start'}); });
    card.append(open); list.append(card);
  }
  if (!entries.length) list.append(element('p', 'empty-detail', '확인 불가로 남긴 항목이 아직 없어요. 체크리스트에서 확인 불가를 선택하고 이유 분류와 메모를 남겨보세요.'));
}
function renderReasonCategoryManager() {
  const list = $('reason-category-list'); list.replaceChildren();
  for (const name of reasonCategories) {
    const item = element('li'); item.append(element('span', '', name));
    const remove = element('button', 'text-button', '삭제'); remove.type = 'button'; remove.setAttribute('aria-label', `${name} 분류 삭제`);
    remove.addEventListener('click', () => deleteReasonCategory(name)); item.append(remove); list.append(item);
  }
  if (!reasonCategories.length) list.append(element('li', 'subtle', '저장된 분류가 없어요. 새 분류를 추가할 수 있어요.'));
}
function openReasonCategories(target = null) {
  reasonCategoryTarget = target; $('reason-category-name').value = ''; $('reason-category-error').hidden = true;
  renderReasonCategoryManager(); $('reason-category-dialog').showModal(); $('reason-category-name').focus();
}
function deleteReasonCategory(name) {
  const next = reasonCategories.filter(category => category !== name);
  if (!store(categoryStorageKey, next)) return;
  reasonCategories = next;
  // 분류는 모든 파일에서 공유한다. 다른 파일의 저장된 메모도 내용과 상태를 보존하며 미분류로 옮긴다.
  const currentKey = `poly-checklists-${datasetKey}`;
  let fullySaved = true;
  try {
    const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)).filter(key => key?.startsWith('poly-checklists-') && key !== currentKey);
    for (const key of keys) {
      const saved = stored(key, null);
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) fullySaved = store(key, removeReasonCategory(saved, name)) && fullySaved;
    }
  } catch { fullySaved = false; }
  checklists = removeReasonCategory(checklists, name); fullySaved = store(currentKey, checklists) && fullySaved;
  unavailableCache = unavailableEntries(records, criteria, checklists); renderDetail(); renderUnavailableSummary(); renderReasonCategoryManager();
  message(fullySaved ? `「${name}」 분류를 삭제했어요. 해당 메모는 미분류로 옮겼고 내용은 보존했어요.` : '분류는 삭제했지만 일부 파일의 저장 내용을 갱신하지 못했습니다. 기존 메모는 보존되어 있습니다.', !fullySaved);
}
function renderDetail() {
  const panel = $('detail'), previousComparison = panel.querySelector('.comparison-section');
  if (previousComparison) comparisonExpanded = previousComparison.open;
  rememberComparisonGroups(panel);
  panel.replaceChildren();
  const record = records.find(row => row.measurementId === selectedId);
  if (!record) { panel.append(element('p', 'empty-detail', '선택할 기록이 없습니다. 필터를 바꿔보세요.')); return; }
  const review = reviews.get(record.measurementId);
  const top = element('div', 'detail-top'), name = element('div');
  name.append(element('p', 'eyebrow muted', 'SELECTED MEASUREMENT'), element('h3', '', record.measurementId));
  top.append(name, element('span', `badge${review.issues.length ? ' warning' : ''}`, review.status)); panel.append(top);
  panel.append(element('p', 'detail-subtitle', `${record.batchId} · 시료 ${record.sampleId || '미기재'} · 반복 ${record.repeat || '?'}회차`));
  const reading = element('div', 'reading'); reading.append(element('strong', '', formatViscosity(review.viscosity)), element('span', '', review.viscosity === null ? '비교 불가' : record.unit));
  panel.append(reading, element('p', `conclusion${!review.comparable || review.numericStatus === '수치상 범위 외' ? ' attention' : ''}`, review.conclusion));
  panel.append(renderComparisonGuide(record));
  panel.append(renderComparison(record));
  panel.append(renderFollowUps(record));
  const repetitions = element('div', 'detail-section'); repetitions.append(element('h3', '', '같은 배치의 반복 측정'));
  const repetitionList = element('div', 'repeat-list');
  const siblings = batchMap.get(record.batchId) ?? [];
  for (const sibling of siblings.slice(0, 30)) {
    const result = reviews.get(sibling.measurementId);
    const row = element('button', `repeat-row${sibling.measurementId === selectedId ? ' current' : ''}`);
    row.append(element('span', '', sibling.measurementId), element('span', 'repeat-value', result.viscosity === null ? '비교 불가' : viscosityDisplay(sibling)));
    row.title = `${result.status} / ${result.conclusion}`;
    row.addEventListener('click', () => {
      if (!filtered.some(item => item.measurementId === sibling.measurementId)) { resetFilters(); $('search').value = sibling.batchId; applyFilters(); }
      select(sibling.measurementId);
    }); repetitionList.append(row);
  }
  repetitions.append(repetitionList, element('p', 'note-hint', `조건과 각 결과를 개별 확인하세요. 평균으로 합치지 않았습니다.${siblings.length > 30 ? ' 첫 30건을 표시합니다.' : ''}`)); panel.append(repetitions);
  const noteSection = element('div', 'detail-section'), label = element('label', 'note-label', '검토 메모');
  label.htmlFor = 'review-note';
  const input = element('textarea', 'note-input'); input.id = 'review-note'; input.maxLength = 4000;
  input.placeholder = '추가로 확인할 기록이나 검토 의견을 남기세요.'; input.value = notes[record.measurementId] ?? '';
  input.addEventListener('input', () => { notes[record.measurementId] = input.value; store(`poly-notes-${datasetKey}`, notes); });
  noteSection.append(label, input, element('p', 'note-hint', '입력하면 이 브라우저에 저장됩니다. 보고서에도 포함됩니다. 업로드 데이터는 새로고침 후 다시 불러오세요.')); panel.append(noteSection);
}

function svgElement(tag, attrs = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderChart() {
  const graph = $('chart'); graph.replaceChildren();
  const onlyComparable = $('comparable-only').checked;
  const xSelection = $('chart-axis').value;
  const xField = xSelection === 'condition' ? activeCondition?.field : xSelection.startsWith('field:') ? xSelection.slice(6) : null;
  const definition = CONDITION_FIELDS.find(item => item.field === xField);
  const yDefinition = CONDITION_FIELDS.find(item => item.field === $('chart-y-field').value && item.type === 'number');
  const yField = yDefinition?.field ?? 'viscosity', viscosityAxis = yField === 'viscosity';
  const yLabel = yDefinition ? chartFieldLabel(yDefinition) : '점도 (mPa·s)';
  const yName = yLabel.replace(/ \([^)]+\)$/, '');
  const range = activeCondition?.field === xField && activeCondition.mode === 'range' ? activeCondition : null;
  $('chart-title').textContent = `${definition ? '조건별' : '배치별'} ${yName} 기록`;
  $('chart-condition-hint').hidden = !definition && viscosityAxis;
  const legend = $('chart-legend'); legend.replaceChildren();
  legend.append(element('i', 'legend-dot green-dot'), ` ${viscosityAxis ? '수치상 범위 내' : '기준 충족'} `,
    element('i', 'legend-dot amber-dot'), ` ${viscosityAxis ? '수치상 범위 외' : '검토 필요'}`);
  const points = filtered.filter(record => {
    const review = reviews.get(record.measurementId);
    return conditionValue(record, yField) !== null && (!onlyComparable || review.comparable) && (!definition || conditionValue(record, xField) !== null);
  });
  const batchIds = [...new Set(filtered.map(record => record.batchId))];
  const conditionValues = definition ? [...new Set(points.map(record => conditionValue(record, xField)))] : [];
  const values = points.map(record => conditionValue(record, yField));
  $('chart-note').textContent = `${points.length.toLocaleString('ko-KR')}개 개별 값 · 목록 ${filtered.length.toLocaleString('ko-KR')}건 · 평균으로 합치지 않음`;
  const sameValueNotes = [];
  if (conditionValues.length === 1) sameValueNotes.push(`현재 표시된 ${definition.label} 기록값은 모두 ${conditionDisplay(points[0], xField)}입니다.`);
  if (!viscosityAxis && xField !== yField && new Set(values).size === 1) sameValueNotes.push(`현재 표시된 ${yLabel} 기록값은 모두 ${conditionDisplay(points[0], yField)}입니다.`);
  $('chart-condition-hint').textContent = `가로축: ${definition ? chartFieldLabel(definition) : '배치 순서'} · 세로축: ${yLabel}. ${datasetKey === 'demo-20261002' ? '가상 기록의 분포이며, ' : ''}다른 조건도 함께 확인하세요.${!viscosityAxis ? ' 점 색은 기존 검토 판정이며, 비교 조건 체크는 점도 시험 조건을 기준으로 해요.' : ''}${sameValueNotes.length ? ` ${sameValueNotes.join(' ')}` : ''}`;
  if (!points.length) {
    graph.append(element('p', 'empty-detail', `표시할 ${yName} 기록이 없습니다.${onlyComparable ? ' 「비교 조건이 맞는 값만」을 해제해 다른 기록도 살펴보세요.' : ' 선택한 가로축·세로축 항목에 유효한 기록값이 있는지 확인하세요.'}`)); return;
  }
  const minValue = Math.min(...values, ...(viscosityAxis ? [criteria.viscosityMin] : []));
  const maxValue = Math.max(...values, ...(viscosityAxis ? [criteria.viscosityMax] : []));
  const padding = viscosityAxis ? Math.max(100, (maxValue - minValue) * 0.18)
    : maxValue === minValue ? Math.max(1, Math.abs(minValue) * 0.05) : (maxValue - minValue) * 0.18;
  const low = viscosityAxis ? Math.max(0, minValue - padding) : minValue - padding, high = maxValue + padding;
  const tickDisplay = value => Number(value.toPrecision(12)).toLocaleString('ko-KR', {maximumFractionDigits: 12});
  const yTickValues = !viscosityAxis && minValue === maxValue ? [minValue] : [0,1,2,3].map(i => low + (high-low) * i / 3);
  const yTickLabels = yTickValues.map(value => viscosityAxis ? Math.round(value).toLocaleString('ko-KR') : tickDisplay(value));
  const width = Math.max(280, graph.clientWidth), height = graph.clientHeight;
  const left = Math.max(50, Math.min(110, Math.max(...yTickLabels.map(label => label.length)) * 6 + 12)), right = 18, top = 15, bottom = 33;
  const y = value => top + (high - value) / (high - low) * (height - top - bottom);
  const batchIndex = new Map(batchIds.map((id, i) => [id, i]));
  let xForRecord, xTicks;
  if (definition?.type === 'number') {
    const observedLow = Math.min(...conditionValues), observedHigh = Math.max(...conditionValues);
    let axisLow = range ? Number(range.center) - Number(range.tolerance) : observedLow;
    let axisHigh = range ? Number(range.center) + Number(range.tolerance) : observedHigh;
    if (axisLow === axisHigh) { const padding = Math.max(1, Math.abs(axisLow) * 0.05); axisLow -= padding; axisHigh += padding; }
    const x = value => left + (value - axisLow) / (axisHigh - axisLow) * (width - left - right);
    xForRecord = record => x(conditionValue(record, xField));
    const tickValues = conditionValues.length === 1 ? [observedLow] : [axisLow, axisLow + (axisHigh-axisLow)/2, axisHigh];
    xTicks = tickValues.map(value => [x(value), `${tickDisplay(value)}${definition.unit ? ` ${definition.unit}` : ''}`]);
  } else {
    const labels = definition ? conditionValues.sort((a,b) => a.localeCompare(b,'ko-KR')) : batchIds;
    const index = definition ? new Map(labels.map((value, i) => [value, i])) : batchIndex;
    const x = value => left + (value + 0.5) / labels.length * (width - left - right);
    xForRecord = record => x(index.get(definition ? conditionValue(record, xField) : record.batchId));
    xTicks = [...new Set([0, Math.floor((labels.length-1)/2), labels.length-1])].map(i => [x(i), String(labels[i])]);
  }
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': `${batchIds.length}개 배치의 개별 ${yName} ${points.length}건. 가로축은 ${definition ? chartFieldLabel(definition) : '배치 순서'}, 세로축은 ${yLabel}.${viscosityAxis ? ' 점선은 가상 점도 규격 상한과 하한.' : ' 점 색은 기존 검토 판정.'}`, 'aria-describedby': $('chart-condition-hint').hidden ? 'chart-hint' : 'chart-hint chart-condition-hint'});
  if (viscosityAxis) svg.append(svgElement('rect', {x: left, y: y(criteria.viscosityMax), width: width-left-right, height: y(criteria.viscosityMin)-y(criteria.viscosityMax), fill:'#eff6ec', class:'chart-spec-band'}));
  for (const [i, value] of yTickValues.entries()) {
    const ypos = y(value);
    svg.append(svgElement('line', {x1:left, x2:width-right, y1:ypos, y2:ypos, stroke:'#e9eee6', 'stroke-width':1}));
    svg.append(svgElement('text', {x:left-9, y:ypos+3, 'text-anchor':'end', fill:'#93a28f', 'font-size':10}, yTickLabels[i]));
  }
  for (const [value, label] of viscosityAxis ? [[criteria.viscosityMax,'상한'],[criteria.viscosityMin,'하한']] : []) {
    svg.append(svgElement('line', {x1:left, x2:width-right, y1:y(value), y2:y(value), stroke:'#b8cbb1', 'stroke-dasharray':'4 4', class:'chart-spec-limit'}));
    svg.append(svgElement('text', {x:width-right-2, y:y(value)-5, 'text-anchor':'end', fill:'#93a687','font-size':9}, `${label} ${format(value)}`));
  }
  for (const record of points) {
    const review = reviews.get(record.measurementId);
    const conditionDescription = definition ? `${definition.label} ${conditionDisplay(record, xField)} / ` : '';
    const resultDescription = viscosityAxis ? viscosityDisplay(record) : `${yLabel} ${conditionDisplay(record, yField)}`;
    const warning = viscosityAxis ? review.numericStatus === '수치상 범위 외' : review.issues.length > 0;
    const circle = svgElement('circle', {cx:xForRecord(record), cy:y(conditionValue(record, yField)), r:points.length > 500 ? 2 : 3, fill:warning ? '#bc863e' : '#37886c', opacity:review.comparable ? '.65' : '.3', class:'chart-point', 'data-measurement-id':record.measurementId, role:'button', tabindex:0, 'aria-label':`${record.measurementId} · ${conditionDescription}${resultDescription} · 상세 기록 열기`});
    circle.addEventListener('click', () => openChartRecord(record.measurementId));
    circle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openChartRecord(record.measurementId); }
    });
    circle.append(svgElement('title', {}, `${record.measurementId}: ${conditionDescription}${resultDescription} / ${review.conclusion}`)); svg.append(circle);
  }
  for (const [x, label] of xTicks) {
    const tick = svgElement('text', {x, y:height-8, 'text-anchor':'middle', fill:'#8c9b86', 'font-size':10}, label.length > 18 ? label.slice(0,17) + '…' : label);
    tick.append(svgElement('title', {}, label)); svg.append(tick);
  }
  graph.append(svg); updateChartSelection();
}

const CRITERIA_GROUPS = [
  ['기준 식별과 점도 규격', [['version','기준 버전'],['viscosityMin','점도 하한 (mPa·s)'],['viscosityMax','점도 상한 (mPa·s)']]],
  ['측정 온도와 장비 설정', [['temperature','목표 측정 온도 (℃)'],['temperatureTolerance','온도 허용 차이 (±℃)'],['spindle','스핀들'],['vessel','용기'],['rpm','측정 속도 (rpm)'],['elapsed','결과를 읽는 시점 (초)'],['volume','측정 시료량 (mL)'],['torqueMin','토크 하한 (%)'],['torqueMax','토크 상한 (%)']]],
  ['제조 조건과 조성', [['manufacturingTemperature','제조 온도 (℃)'],['manufacturingTolerance','제조 온도 허용 차이 (±℃)'],['mixingRpm','제조 교반 속도 (rpm)'],['mixingRpmTolerance','교반 속도 허용 차이 (±rpm)'],['mixingMinutes','제조 교반 시간 (분)'],['mixingMinutesTolerance','교반 시간 허용 차이 (±분)'],['concentration','농도 (wt%)'],['concentrationTolerance','농도 허용 차이 (±wt%)']]]
];
function fillCriteria(values) {
  const container = $('criteria-fields'); container.replaceChildren();
  for (const [title, fields] of CRITERIA_GROUPS) {
    const group = element('div', 'criteria-group'); group.append(element('h3', '', title));
    const grid = element('div', 'criteria-grid');
    for (const [key, label] of fields) {
      const wrapper = element('label', 'criteria-input', label), input = element('input');
      input.name = key; input.id = `criterion-${key}`; input.required = true;
      input.type = typeof DEFAULT_CRITERIA[key] === 'number' ? 'number' : 'text';
      if (input.type === 'number') input.step = 'any'; else input.maxLength = 80;
      input.value = values[key]; wrapper.append(input); grid.append(wrapper);
    }
    group.append(grid); container.append(group);
  }
}
function openCriteria() { fillCriteria(criteria); $('criteria-error').hidden = true; $('criteria-dialog').showModal(); }
function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
async function readDemoRecords() {
  if (Array.isArray(window.__POLY_DEMO__)) return window.__POLY_DEMO__;
  const response = await fetch('./data/demo-records.json');
  if (!response.ok) throw new Error('시연 데이터 파일을 읽을 수 없습니다.');
  return response.json();
}
async function demo() {
  loadRecords(await readDemoRecords(), '합성 시연 데이터', 'demo-20261002');
}
$('search').addEventListener('input', () => { page = 0; applyFilters(); });
for (const id of ['status-filter', 'category-filter']) $(id).addEventListener('change', () => { page = 0; applyFilters(); });
$('reset-filter').addEventListener('click', () => { resetFilters(); applyFilters(); });
$('comparable-only').addEventListener('change', renderChart);
$('condition-field').addEventListener('change', fillConditionDraft);
for (const id of ['condition-center', 'condition-tolerance', 'condition-value']) $(id).addEventListener('input', updateConditionPreview);
$('condition-limit').addEventListener('change', updateConditionPreview);
$('condition-form').addEventListener('submit', event => {
  event.preventDefault();
  const filter = draftCondition(), error = validateConditionFilter(filter);
  $('condition-error').hidden = !error;
  if (error) { $('condition-error').textContent = error; return; }
  activeCondition = filter; $('chart-axis').value = 'condition'; page = 0;
  updateConditionStatus(); applyFilters();
});
$('clear-condition').addEventListener('click', () => {
  activeCondition = null; $('chart-axis').value = 'batch'; $('condition-error').hidden = true; page = 0;
  updateConditionStatus(); applyFilters();
});
$('chart-axis').addEventListener('change', renderChart);
$('chart-y-field').addEventListener('change', renderChart);
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 100); });
$('previous-page').addEventListener('click', () => { page--; renderRows(); });
$('next-page').addEventListener('click', () => { page++; renderRows(); });
function openUnavailableSummary() {
  $('unavailable-summary').open = true;
  renderUnavailableSummary();
}
function syncSidebarNavigation() {
  const hash = window.location.hash || '#top';
  for (const link of document.querySelectorAll('.sidebar nav a.nav-link')) {
    const active = link.getAttribute('href') === hash;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  if (hash === '#unavailable-summary') openUnavailableSummary();
}
$('open-unavailable-nav').addEventListener('click', () => {
  openUnavailableSummary();
  $('unavailable-summary').querySelector('summary').focus({preventScroll: true});
});
window.addEventListener('hashchange', syncSidebarNavigation);
syncSidebarNavigation();
$('unavailable-summary').addEventListener('toggle', renderUnavailableSummary);
$('unavailable-filter').addEventListener('change', () => { unavailablePage = 0; renderUnavailableSummary(); });
$('unavailable-previous').addEventListener('click', () => { unavailablePage--; renderUnavailableSummary(); });
$('unavailable-next').addEventListener('click', () => { unavailablePage++; renderUnavailableSummary(); });
$('manage-reason-categories').addEventListener('click', () => openReasonCategories());
$('close-reason-categories').addEventListener('click', () => $('reason-category-dialog').close());
$('reason-category-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = reasonCategoryName($('reason-category-name').value), error = validateReasonCategory(name, reasonCategories);
  $('reason-category-error').hidden = !error;
  if (error) { $('reason-category-error').textContent = error; return; }
  const next = [...reasonCategories, name];
  if (!store(categoryStorageKey, next)) return;
  reasonCategories = next;
  const target = reasonCategoryTarget, record = target && records.find(record => record.measurementId === target.measurementId);
  const task = record && followUpProgress(record, criteria, checklists).find(task => task.id === target.taskId && task.status === 'unavailable');
  if (task) {
    checklists[record.measurementId].outcomes[task.id] = {status: 'unavailable', reason: task.reason, reasonCategory: name, completionNote: task.completionNote};
    store(`poly-checklists-${datasetKey}`, checklists); updateUnavailableRecord(record);
  }
  renderDetail(); renderReasonCategoryManager();
  if (target) $('reason-category-dialog').close();
  else { $('reason-category-name').value = ''; $('reason-category-name').focus(); }
});
$('export-unavailable').addEventListener('click', () => download(unavailableReasonCSV(records, criteria, checklists, $('unavailable-filter').value || null), '확인불가_이유별_메모.csv', 'text/csv;charset=utf-8'));
for (const id of ['open-criteria', 'open-criteria-nav']) $(id).addEventListener('click', openCriteria);
$('close-criteria').addEventListener('click', () => $('criteria-dialog').close());
$('reset-criteria').addEventListener('click', () => { fillCriteria(DEFAULT_CRITERIA); $('criteria-error').hidden = true; });
$('criteria-form').addEventListener('submit', event => {
  event.preventDefault();
  const next = Object.fromEntries(new FormData(event.target));
  const errors = validateCriteria(next);
  if (errors.length) { $('criteria-error').textContent = errors.map(error => {
    for (const [, fields] of CRITERIA_GROUPS) for (const [key, label] of fields) error = error.replace(`${key}:`, `${label}:`);
    return error;
  }).join(' / '); $('criteria-error').hidden = false; return; }
  for (const [key, value] of Object.entries(DEFAULT_CRITERIA)) if (typeof value === 'number') next[key] = Number(next[key]);
  const changed = Object.keys(DEFAULT_CRITERIA).some(key => next[key] !== criteria[key]);
  if (changed && next.version === criteria.version) next.version = `${DEFAULT_CRITERIA.version}-r${Date.now().toString(36)}`;
  criteria = next; store('poly-criteria-v1', criteria); page = 0; recalculate(); $('criteria-dialog').close();
  message(`기준 ${criteria.version}을 적용해 ${records.length.toLocaleString('ko-KR')}건을 다시 검토했습니다.`);
});
$('load-demo').addEventListener('click', async () => {
  try { await demo(); message('합성 시연 데이터 1,080건을 불러왔습니다. 현재 설정한 기준으로 검토합니다.'); }
  catch (error) { message(error.message, true); }
});
$('download-template').addEventListener('click', async event => {
  event.preventDefault();
  try { download(recordsCSV(await readDemoRecords(), DEFAULT_CRITERIA, {}, false), '점도_입력양식_1080건.csv', 'text/csv;charset=utf-8'); }
  catch (error) { message(`양식 저장 실패: ${error.message}`, true); }
});
$('csv-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('CSV 파일은 20MB 이하로 준비하세요.');
    const text = await file.text();
    const next = parseCSV(text);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const key = Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    loadRecords(next, file.name, key);
    message(`${file.name}: ${next.length.toLocaleString('ko-KR')}건을 불러왔습니다. 없는 열은 기록 누락으로 표시합니다.`);
  } catch (error) { message(`불러오기 실패: ${error.message} 기존 데이터는 유지했습니다.`, true); }
  finally { event.target.value = ''; }
});
$('export-csv').addEventListener('click', () => {
  download(recordsCSV(filtered, criteria, notes, true, checklists), '점도_검토결과.csv', 'text/csv;charset=utf-8');
  message(`현재 검색·필터에 해당하는 ${filtered.length}건의 검토 결과 CSV를 저장했습니다.`);
});
function selectReportFormat(format) {
  reportFormat = format;
  $('report-download-label').textContent = `${REPORT_FORMAT_LABELS[format]} 내려받기`;
  for (const button of document.querySelectorAll('[data-report-format]')) button.setAttribute('aria-pressed', String(button.dataset.reportFormat === format));
  $('report-formats').open = false;
  ($('export-report').disabled ? $('report-formats').querySelector('summary') : $('export-report')).focus();
}
function exportReport() {
  const targetRecords = reportRecords();
  if (!targetRecords.length) return;
  const plain = reportFormat === 'txt';
  const scope = $('report-scope').value === 'selected' ? `체크한 기록 ${targetRecords.length}건 (검색·필터 밖의 선택 포함)` : `현재 검색·필터 결과 ${targetRecords.length}건${activeCondition ? ` · ${describeConditionFilter(activeCondition)}` : ''}`;
  const report = (plain ? reportText : reportMarkdown)(targetRecords, criteria, notes, source, undefined, checklists, scope);
  // UTF-8 BOM과 CRLF로 Windows 메모장에서도 한글과 줄바꿈을 읽을 수 있게 한다.
  download(plain ? '\uFEFF' + report.replaceAll('\n', '\r\n') : report,
    `점도_검토보고서.${plain ? 'txt' : 'md'}`, plain ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8');
  if ($('report-formats').open) {
    $('report-formats').open = false; $('report-formats').querySelector('summary').focus();
  }
  message(`${scope}의 ${plain ? 'TXT' : 'Markdown'} 보고서를 내려받았습니다. 원본 CSV와 함께 보관하세요.`);
}
$('report-scope').addEventListener('change', updateReportControls);
$('select-visible-records').addEventListener('change', event => changeReportSelection(filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(record => record.measurementId), event.target.checked));
$('clear-report-selection').addEventListener('click', () => { selectedReportIds.clear(); updateReportControls(); });
$('export-report').addEventListener('click', exportReport);
for (const button of document.querySelectorAll('[data-report-format]')) button.addEventListener('click', () => selectReportFormat(button.dataset.reportFormat));
document.addEventListener('click', event => {
  if (!$('report-formats').contains(event.target)) $('report-formats').open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('report-formats').open) {
    $('report-formats').open = false; $('report-formats').querySelector('summary').focus();
  }
});
try {
  await demo();
  // 데이터로 측정 목록·상세 높이가 바뀐 뒤 하단 바로가기 위치를 맞춘다.
  if (window.location.hash === '#unavailable-summary') $('unavailable-summary').scrollIntoView({behavior: 'instant', block: 'start'});
}
catch (error) { message(`시작 실패: ${error.message} npm start로 서버를 실행했는지 확인하세요.`, true); }
