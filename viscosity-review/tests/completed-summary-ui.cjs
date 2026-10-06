// 별도 브라우저 저장소에서 완료 목록과 기존 체크 상태의 연결을 확인한다.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const core = await import('../src/core.js');
  const records = JSON.parse(await fs.readFile(path.resolve(__dirname, '../data/demo-records.json'), 'utf8'));
  const output = path.resolve(__dirname, '../test-artifacts');
  await fs.mkdir(output, {recursive: true});
  const portable = process.env.PORTABLE_TEST === '1';
  const targetURL = portable ? pathToFileURL(path.resolve(__dirname, '../점도_검토실_바로열기.html')).href : 'http://127.0.0.1:4173/';
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
  const ready = () => page.waitForFunction(() => document.getElementById('total-count').textContent === '1,080');
  const search = id => page.locator('#search').fill(id);
  const task = id => page.locator(`.follow-up-task[data-task="${id}"]`);
  const count = () => page.locator('#completed-count').innerText();
  const cards = page.locator('#completed-list .completed-entry');
  try {
    await page.goto(targetURL); await ready();
    assert.equal(await count(), '0개 항목 · 0건 측정');
    await page.locator('#open-completed-nav').click();
    await page.waitForFunction(() => document.getElementById('open-completed-nav').getAttribute('aria-current') === 'location');
    assert.ok((await page.locator('#completed-list').innerText()).includes('아직 없어요'));
    assert.ok((await page.locator('#completed-summary').innerText()).includes('기준과의 차이가 해결됐거나'));
    assert.equal(await page.locator('#open-completed-nav').getAttribute('aria-current'), 'location');
    assert.ok(await page.locator('#completed-summary').evaluate(node => Boolean(document.querySelector('#records').compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)));
    pass('빈 완료 목록·의미 안내·하단 배치·사이드바 현재 메뉴');

    await search('PA-006-M1');
    await task('measurement:sampleTemperature').locator('input[type=checkbox]').check();
    const memo = '원본 기록 28℃ 확인\n차이는 남아 있음 <img src=x onerror=alert(1)>';
    await task('measurement:sampleTemperature').locator('.follow-up-completion-note').fill(memo);
    await search('PA-006-M2'); await task('measurement:rpm').locator('input[type=checkbox]').check();
    await search('PA-007-M1'); await task('missing:sampleTemperature').locator('input[type=checkbox]').check();
    await task('missing:sampleTemperature').locator('.follow-up-completion-note').fill('확보한 원본을 검토함. 입력 데이터의 누락은 유지.');
    assert.equal(await count(), '3개 항목 · 3건 측정');
    await search('PA-006-M3');
    await page.locator('#status-filter').selectOption('review');
    await page.locator('.report-record-check[data-measurement-id="PA-006-M3"]').check();
    const before = await page.evaluate(() => ({search: document.getElementById('search').value, status: document.getElementById('status-filter').value, report: document.getElementById('report-selection-count').textContent, detail: document.querySelector('.detail-top h3').textContent}));
    await page.locator('#open-completed-nav').click();
    assert.equal(await cards.count(), 3);
    const first = cards.filter({hasText: 'PA-006-M1'});
    assert.ok((await first.innerText()).includes(memo)); assert.equal(await first.locator('img').count(), 0);
    assert.ok((await first.innerText()).includes('현재 검토 상태: 검토 필요'));
    assert.ok((await cards.filter({hasText: 'PA-006-M2'}).innerText()).includes('남긴 메모가 없어요'));
    assert.ok((await cards.filter({hasText: 'PA-007-M1'}).innerText()).includes('미기재'));
    assert.deepEqual(await page.evaluate(() => ({search: document.getElementById('search').value, status: document.getElementById('status-filter').value, report: document.getElementById('report-selection-count').textContent, detail: document.querySelector('.detail-top h3').textContent})), before);
    await page.locator('#completed-filter').selectOption('sampleTemperature'); assert.equal(await cards.count(), 2);
    await page.locator('#completed-filter').selectOption('');
    pass('3개 완료·전체 데이터 범위·항목 필터·메모와 빈 메모·문자열 안전 표시·검색과 보고서 선택 보존');

    await first.locator('.completed-open-record').click();
    assert.equal(await page.locator('.detail-top h3').innerText(), 'PA-006-M1');
    assert.equal(await task('measurement:sampleTemperature').locator('.follow-up-completion-note').inputValue(), memo);
    await task('measurement:sampleTemperature').locator('input[type=checkbox]').uncheck();
    assert.equal(await count(), '2개 항목 · 2건 측정');
    await task('measurement:sampleTemperature').locator('input[type=checkbox]').check();
    await task('measurement:sampleTemperature').locator('.follow-up-unavailable').click();
    assert.equal(await count(), '2개 항목 · 2건 측정');
    assert.ok((await page.locator('#unavailable-count').innerText()).includes('1개'));
    await task('measurement:sampleTemperature').locator('input[type=checkbox]').check();
    assert.equal(await count(), '3개 항목 · 3건 측정');
    await task('measurement:sampleTemperature').locator('.follow-up-completion-note').fill('새 메모: 기준 차이 검토 필요');
    assert.ok((await first.innerText()).includes('새 메모: 기준 차이 검토 필요'));
    assert.equal(await page.locator('#unavailable-count').innerText(), '0개 항목');
    pass('원본 기록 이동·체크 해제·확인 불가 전환·메모 수정 즉시 갱신');

    await page.reload(); await ready();
    assert.equal(await count(), '3개 항목 · 3건 측정');
    assert.equal(await page.locator('#completed-summary').evaluate(node => node.open), true);
    assert.ok((await first.innerText()).includes('새 메모'));
    await page.locator('#completed-filter').focus();
    await page.locator('#completed-summary').screenshot({path: path.join(output, 'completed-summary-desktop.png')});
    await page.screenshot({path: path.join(output, 'completed-sidebar-desktop.png')});
    await page.locator('#completed-summary > summary').click();
    await page.locator('#open-completed-nav').press('Enter');
    assert.equal(await page.locator('#completed-summary').evaluate(node => node.open), true);
    await page.locator('a.nav-link[href="#records"]').click(); await page.goBack();
    assert.equal(await page.locator('#completed-summary').evaluate(node => node.open), true);
    for (const width of [1440, 1024, 800, 390, 320]) {
      await page.setViewportSize({width, height: 1000});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
      assert.equal(await page.locator('#open-completed-nav .nav-copy').isVisible(), true, `menu label ${width}`);
    }
    await page.locator('#completed-filter').focus();
    await page.locator('#completed-summary').screenshot({path: path.join(output, 'completed-summary-mobile-320.png')});
    await page.locator('#top').scrollIntoViewIfNeeded();
    await page.locator('.sidebar').screenshot({path: path.join(output, 'completed-sidebar-mobile-320.png')});
    pass('완료 체크와 메모 새로고침 복원·Enter와 같은 주소 재이동·뒤로가기·5개 화면 폭');

    await page.locator('#open-criteria-nav').click();
    await page.locator('#criterion-temperature').fill('26'); await page.locator('#criteria-form button[type=submit]').click();
    assert.equal(await count(), '0개 항목 · 0건 측정');
    assert.equal(await cards.count(), 0);
    await page.locator('#open-criteria-nav').click(); await page.locator('#reset-criteria').click();
    await page.locator('#criteria-form button[type=submit]').click();
    assert.equal(await count(), '3개 항목 · 3건 측정');
    pass('변경 기준에 무효한 완료 제외·기존 기준에서 유효 상태 복원');

    const seed = {};
    for (const record of records.filter(record => Number(record.sampleTemperature) === 28).slice(0, 21)) {
      seed[record.measurementId] = {signature: core.followUpSignature(record, core.DEFAULT_CRITERIA), checked: ['measurement:sampleTemperature']};
    }
    const multi = {...records[0], measurementId: 'multi-done', sampleTemperature: 28, rpm: 30};
    await page.setViewportSize({width: 1440, height: 1100});
    await page.evaluate(value => localStorage.setItem('poly-checklists-demo-20261002', JSON.stringify(value)), seed);
    await page.reload(); await ready(); await page.locator('#open-completed-nav').click();
    assert.equal(await count(), '21개 항목 · 21건 측정');
    assert.equal(await cards.count(), 20); await page.locator('#completed-next').click(); assert.equal(await cards.count(), 1);
    await page.locator('#completed-previous').click(); assert.equal(await cards.count(), 20);
    pass('기존 체크 저장 형식·21개 완료 항목의 페이지 이동');

    const upload = core.recordsCSV([multi], core.DEFAULT_CRITERIA, {}, false);
    await page.locator('#csv-file').setInputFiles({name: '완료목록.csv', mimeType: 'text/csv', buffer: Buffer.from(upload)});
    await page.waitForFunction(() => document.getElementById('source-name').textContent === '완료목록.csv');
    assert.equal(await count(), '0개 항목 · 0건 측정');
    for (const id of ['measurement:sampleTemperature', 'measurement:rpm']) await task(id).locator('input[type=checkbox]').check();
    assert.equal(await count(), '2개 항목 · 1건 측정');
    await page.locator('#load-demo').click(); await ready(); assert.equal(await count(), '21개 항목 · 21건 측정');
    pass('업로드 데이터와 시연 데이터 상태 분리·한 측정의 여러 완료 질문 집계');
    assert.deepEqual(errors, []); pass('브라우저 JavaScript·콘솔 오류 없음');
    await fs.writeFile(path.join(output, portable ? 'completed-portable-results.json' : 'completed-ui-results.json'), JSON.stringify({targetURL, checks, errors}, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
