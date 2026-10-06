import { DEFAULT_CRITERIA, CATEGORY_LABELS, FOLLOW_UP_STATUS_LABELS, DEFAULT_REASON_CATEGORIES, reasonCategoryName, validateReasonCategory, unavailableEntries, removeReasonCategory, unavailableReasonCSV, numeric, reviewRecord, comparisonRows, followUpSignature, followUpProgress, validateCriteria, parseCSV, recordsCSV, reportMarkdown } from './core.js';

const $ = id => document.getElementById(id);
const format = value => numeric(value) === null ? '—' : Number(value).toLocaleString('ko-KR', {maximumFractionDigits: 2});
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

function loadRecords(next, name, key) {
  records = next; source = name; datasetKey = key;
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
  resetFilters(); recalculate();
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
}
function applyFilters() {
  const query = $('search').value.trim().toLowerCase();
  const status = $('status-filter').value, category = $('category-filter').value;
  filtered = records.filter(record => {
    const review = reviews.get(record.measurementId);
    return (!query || [record.batchId, record.measurementId, record.sampleId].some(value => String(value ?? '').toLowerCase().includes(query)))
      && (status === 'all' || (status === 'pass' ? !review.issues.length : !!review.issues.length))
      && (category === 'all' || review.categories.includes(category));
  });
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  if (!filtered.some(record => record.measurementId === selectedId)) selectedId = filtered[0]?.measurementId ?? null;
  $('filtered-count').textContent = `현재 ${filtered.length.toLocaleString('ko-KR')}건 / 전체 ${records.length.toLocaleString('ko-KR')}건`;
  $('export-csv').disabled = !$('export-report') || !filtered.length;
  $('export-report').disabled = !filtered.length;
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
    const name = element('td'), button = element('button', 'record-link', record.batchId);
    button.append(element('span', '', `${record.measurementId} · ${record.repeat || '?'}회차`));
    button.setAttribute('aria-label', `${record.measurementId} 상세 기록`);
    button.setAttribute('aria-pressed', String(record.measurementId === selectedId));
    button.addEventListener('click', () => select(record.measurementId));
    name.append(button);
    const status = element('td'); status.append(element('span', `badge${review.issues.length ? ' warning' : ''}`, review.status));
    tr.append(name, element('td', 'number-cell', format(review.viscosity)), element('td', '', format(record.sampleTemperature)), status);
    tbody.append(tr);
  }
  if (!filtered.length) {
    const row = element('tr'), cell = element('td', 'empty-row', '해당하는 기록이 없습니다. 검색어나 필터를 바꿔보세요.'); cell.colSpan = 4; row.append(cell); tbody.append(row);
  }
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  $('page-label').textContent = `${page + 1} / ${pages} 페이지 · 한 페이지 ${PAGE_SIZE}건`;
  $('previous-page').disabled = page === 0; $('next-page').disabled = page + 1 >= pages;
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
  section.append(label);
  const scroll = element('div', 'comparison-scroll'); scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '실험 기록과 검토 기준 비교표');
  const table = element('table', 'comparison-table');
  table.append(element('caption', 'sr-only', `${record.measurementId}의 40개 기록과 현재 검토 기준 비교`));
  const head = element('thead'), header = element('tr');
  for (const title of ['항목', '실험 기록', '검토 기준', '확인 결과']) {
    const cell = element('th', '', title); cell.scope = 'col'; header.append(cell);
  }
  head.append(header); const body = element('tbody'); table.append(head, body); scroll.append(table); section.append(scroll);
  const draw = () => {
    body.replaceChildren(); let previousGroup = null;
    const rows = comparisonRows(record, criteria).filter(row => !comparisonOnlyIssues || row.warning);
    for (const row of rows) {
      if (row.group !== previousGroup) {
        const group = element('tr', 'comparison-group'), cell = element('th', '', row.group);
        cell.colSpan = 4; cell.scope = 'rowgroup'; group.append(cell); body.append(group); previousGroup = row.group;
      }
      const tr = element('tr', `comparison-row${row.warning ? ' needs-review' : ''}`); tr.dataset.field = row.field;
      const name = element('th', 'comparison-name', row.label); name.scope = 'row';
      const actual = element('td', 'comparison-actual', row.actual); actual.dataset.label = '실험 기록';
      const expected = element('td', 'comparison-expected', row.expected); expected.dataset.label = '검토 기준';
      const status = element('td', 'comparison-status'); status.dataset.label = '확인 결과';
      status.append(element('span', `badge${row.warning ? ' warning' : !row.hasRule ? ' muted-badge' : ''}`, row.status));
      for (const issue of row.issues) status.append(element('small', 'comparison-reason', issue.reason));
      tr.append(name, actual, expected, status); body.append(tr);
    }
    if (!rows.length) {
      const tr = element('tr'), cell = element('td', 'comparison-empty', '이 측정에서 확인할 차이·누락이 없습니다. 전체 항목을 보려면 체크를 해제하세요.');
      cell.colSpan = 4; tr.append(cell); body.append(tr);
    }
  };
  filter.addEventListener('change', () => { comparisonOnlyIssues = filter.checked; draw(); }); draw();
  section.append(element('p', 'comparison-footnote', '「기록 있음」은 값이 기록되었다는 뜻이에요. 비교 기준이 없는 항목까지 적합하다고 판정한 것은 아닙니다.'));
  return section;
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
    const actual = units[row.field] && numeric(record[row.field]) !== null ? `${row.actual} ${units[row.field]}` : row.actual;
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
      outcomes: Object.fromEntries(tasks.map(task => [task.id, {status: task.status, reason: task.status === 'unavailable' ? task.reason : '', reasonCategory: task.status === 'unavailable' ? task.reasonCategory : ''}]))};
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
    };
    checkbox.addEventListener('change', () => {
      task.status = checkbox.checked ? 'done' : 'pending'; refresh(); save();
    });
    unavailable.addEventListener('click', () => { task.status = task.status === 'unavailable' ? 'pending' : 'unavailable'; refresh(); save(); });
    reason.addEventListener('input', () => { task.reason = reason.value; save(); });
    label.append(checkbox, document.createTextNode('자료 확인 완료'));
    const actions = element('div', 'follow-up-actions'); actions.append(unavailable, badge);
    card.append(label, actions, reasonFields); refresh(); list.append(card);
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
  panel.replaceChildren();
  const record = records.find(row => row.measurementId === selectedId);
  if (!record) { panel.append(element('p', 'empty-detail', '선택할 기록이 없습니다. 필터를 바꿔보세요.')); return; }
  const review = reviews.get(record.measurementId);
  const top = element('div', 'detail-top'), name = element('div');
  name.append(element('p', 'eyebrow muted', 'SELECTED MEASUREMENT'), element('h3', '', record.measurementId));
  top.append(name, element('span', `badge${review.issues.length ? ' warning' : ''}`, review.status)); panel.append(top);
  panel.append(element('p', 'detail-subtitle', `${record.batchId} · 시료 ${record.sampleId || '미기재'} · 반복 ${record.repeat || '?'}회차`));
  const reading = element('div', 'reading'); reading.append(element('strong', '', format(review.viscosity)), element('span', '', review.viscosity === null ? '비교 불가' : 'mPa·s'));
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
    row.append(element('span', '', sibling.measurementId), element('span', 'repeat-value', `${format(result.viscosity)} mPa·s`));
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
  const points = filtered.filter(record => {
    const review = reviews.get(record.measurementId); return review.viscosity !== null && (!onlyComparable || review.comparable);
  });
  const batchIds = [...new Set(filtered.map(record => record.batchId))];
  $('chart-note').textContent = `${points.length.toLocaleString('ko-KR')}개 개별 값 · 평균으로 합치지 않음`;
  if (!points.length) { graph.append(element('p', 'empty-detail', '표시할 점도 기록이 없습니다. 필터나 비교 조건 설정을 확인하세요.')); return; }
  const width = Math.max(280, graph.clientWidth), height = graph.clientHeight, left = 50, right = 18, top = 15, bottom = 33;
  const values = points.map(record => reviews.get(record.measurementId).viscosity);
  const minValue = Math.min(criteria.viscosityMin, ...values), maxValue = Math.max(criteria.viscosityMax, ...values);
  const padding = Math.max(100, (maxValue - minValue) * 0.18), low = Math.max(0, minValue - padding), high = maxValue + padding;
  const y = value => top + (high - value) / (high - low) * (height - top - bottom);
  const x = index => left + (index + 0.5) / batchIds.length * (width - left - right);
  const svg = svgElement('svg', {viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': `${batchIds.length}개 배치의 개별 점도 ${points.length}건. 가로축은 배치 순서, 세로축은 점도 mPa·s. 점선은 가상 규격 상한과 하한.`, 'aria-describedby': 'chart-hint'});
  svg.append(svgElement('rect', {x: left, y: y(criteria.viscosityMax), width: width-left-right, height: y(criteria.viscosityMin)-y(criteria.viscosityMax), fill:'#eff6ec'}));
  for (let i = 0; i <= 3; i++) {
    const value = low + (high-low) * i / 3, ypos = y(value);
    svg.append(svgElement('line', {x1:left, x2:width-right, y1:ypos, y2:ypos, stroke:'#e9eee6', 'stroke-width':1}));
    svg.append(svgElement('text', {x:left-9, y:ypos+3, 'text-anchor':'end', fill:'#93a28f', 'font-size':10}, Math.round(value).toLocaleString('ko-KR')));
  }
  for (const [value, label] of [[criteria.viscosityMax,'상한'],[criteria.viscosityMin,'하한']]) {
    svg.append(svgElement('line', {x1:left, x2:width-right, y1:y(value), y2:y(value), stroke:'#b8cbb1', 'stroke-dasharray':'4 4'}));
    svg.append(svgElement('text', {x:width-right-2, y:y(value)-5, 'text-anchor':'end', fill:'#93a687','font-size':9}, `${label} ${format(value)}`));
  }
  const batchIndex = new Map(batchIds.map((id, i) => [id, i]));
  for (const record of points) {
    const review = reviews.get(record.measurementId);
    const circle = svgElement('circle', {cx:x(batchIndex.get(record.batchId)), cy:y(review.viscosity), r:points.length > 500 ? 2 : 3, fill:review.numericStatus === '수치상 범위 외' ? '#bc863e' : '#37886c', opacity:review.comparable ? '.65' : '.3', class:'chart-point', 'data-measurement-id':record.measurementId, role:'button', tabindex:0, 'aria-label':`${record.measurementId} · ${format(review.viscosity)} mPa·s · 상세 기록 열기`});
    circle.addEventListener('click', () => openChartRecord(record.measurementId));
    circle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openChartRecord(record.measurementId); }
    });
    circle.append(svgElement('title', {}, `${record.measurementId}: ${format(review.viscosity)} mPa·s / ${review.conclusion}`)); svg.append(circle);
  }
  const ticks = [...new Set([0, Math.floor((batchIds.length - 1)/2), batchIds.length-1])];
  for (const index of ticks) svg.append(svgElement('text', {x:x(index), y:height-8, 'text-anchor':'middle', fill:'#8c9b86', 'font-size':10}, batchIds[index]));
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
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderChart, 100); });
$('previous-page').addEventListener('click', () => { page--; renderRows(); });
$('next-page').addEventListener('click', () => { page++; renderRows(); });
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
    checklists[record.measurementId].outcomes[task.id] = {status: 'unavailable', reason: task.reason, reasonCategory: name};
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
function exportReport() {
  if (!filtered.length) return;
  download(reportMarkdown(filtered, criteria, notes, source, undefined, checklists), '점도_검토보고서.md', 'text/markdown;charset=utf-8');
  message(`현재 검색·필터에 해당하는 ${filtered.length}건의 보고서를 저장했습니다. 원본 CSV와 함께 보관하세요.`);
}
$('export-report').addEventListener('click', exportReport);
try { await demo(); }
catch (error) { message(`시작 실패: ${error.message} npm start로 서버를 실행했는지 확인하세요.`, true); }
