// 개발 환경의 Playwright로 실행하는 실제 브라우저 검증. 앱 실행에는 필요하지 않다.
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const output = path.resolve(__dirname, '../test-artifacts'); await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context = await browser.newContext({viewport:{width:1440,height:1100}, acceptDownloads:true});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const checks = []; const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
  try {
    const targetURL = process.env.PORTABLE_TEST === '1'
      ? pathToFileURL(path.resolve(__dirname, '../점도_검토실_바로열기.html')).href
      : 'http://127.0.0.1:4173';
    await page.goto(targetURL);
    await page.waitForFunction(() => document.getElementById('total-count').textContent === '1,080');
    assert.equal(await page.locator('#pass-count').innerText(), '432');
    assert.equal(await page.locator('#review-count').innerText(), '648');
    assert.equal(await page.locator('#chart circle').count(), 648);
    assert.equal(await page.locator('.comparison-guide .guide-item').count(), 3);
    assert.ok((await page.locator('.follow-up-empty').innerText()).includes('추가 확인할 차이·누락'));
    assert.equal(await page.locator('.comparison-guide .guide-item[data-field="viscosity"] .guide-expected span').innerText(), '1000~1500 mPa·s');
    pass('1,080건 로딩과 실제 화면 집계·그래프');
    await page.screenshot({path:path.join(output,'desktop.png'), fullPage:true});

    await page.locator('#search').fill('PA-006');
    assert.equal(await page.locator('#record-rows tr').count(), 4);
    assert.ok((await page.locator('#detail').innerText()).includes('비교 조건 확인 필요'));
    assert.equal(await page.locator('.comparison-guide .guide-item[data-field="sampleTemperature"] .guide-actual span').innerText(), '28 ℃');
    assert.equal(await page.locator('.comparison-guide .guide-item[data-field="sampleTemperature"] .guide-expected span').innerText(), '25 ± 0.5 ℃');
    await page.locator('.comparison-guide').screenshot({path:path.join(output,'guidance-desktop.png')});
    await page.locator('.record-link').nth(1).click();
    assert.ok((await page.locator('#detail').innerText()).includes('측정 속도 (rpm)'));
    const rpmRow = page.locator('.comparison-row[data-field="rpm"]');
    assert.equal(await rpmRow.locator('.comparison-actual').innerText(), '30');
    assert.equal(await rpmRow.locator('.comparison-expected').innerText(), '60 rpm');
    assert.ok((await rpmRow.locator('.comparison-status').innerText()).includes('조건 차이'));
    assert.equal(await page.locator('.follow-up-task').count(), 1);
    assert.ok((await page.locator('.follow-up-question').innerText()).includes('회전 속도'));
    await page.locator('.follow-up-check input').check();
    assert.equal(await page.locator('.follow-up-progress').innerText(), '자료 확인 표시 1 / 1개');
    assert.ok((await page.locator('.detail-top .badge').innerText()).includes('검토 필요'));
    await page.locator('.follow-up-section').screenshot({path:path.join(output,'checklist-desktop.png')});
    assert.equal(await page.locator('.comparison-guide .guide-item').count(), 1);
    assert.equal(await page.locator('.comparison-guide .guide-actual span').innerText(), '30 rpm');
    pass('배치 검색·반복 기록 선택·실제 값과 기준 이유');

    assert.equal(await page.locator('.comparison-row').count(), 40);
    await page.locator('#comparison-only-issues').check();
    assert.equal(await page.locator('.comparison-row').count(), 1);
    await page.screenshot({path:path.join(output,'comparison-desktop.png'), fullPage:true});
    await page.locator('.comparison-section').screenshot({path:path.join(output,'comparison-panel-desktop.png')});
    await page.locator('#search').fill('PA-001');
    assert.ok((await page.locator('.comparison-empty').innerText()).includes('차이·누락이 없습니다'));
    await page.locator('#comparison-only-issues').uncheck();
    assert.equal(await page.locator('.comparison-row[data-field="sourceNote"] .badge').innerText(), '기록 있음');
    await page.locator('#search').fill('PA-007');
    assert.equal(await page.locator('.comparison-row[data-field="sampleTemperature"] .comparison-actual').innerText(), '미기재');
    assert.equal(await page.locator('.comparison-row[data-field="sampleTemperature"] .comparison-expected').innerText(), '25 ± 0.5 ℃');
    assert.equal(await page.locator('.comparison-guide .guide-actual span').innerText(), '미기재');
    await page.locator('#search').fill('PA-008');
    assert.equal(await page.locator('.comparison-row[data-field="viscosity"] .badge').innerText(), '범위 이탈');
    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    pass('40항목 비교표·차이 필터·기록 전용·누락·범위 이탈 구분');

    await page.locator('#review-note').fill('측정 방법 확인 후 검토합니다.');
    const [report] = await Promise.all([page.waitForEvent('download'), page.locator('#export-report').click()]);
    const reportText = await fs.readFile(await report.path(), 'utf8');
    assert.ok(reportText.includes('측정 방법 확인 후 검토합니다.'));
    assert.ok(reportText.includes('temperatureTolerance'));
    assert.ok(reportText.includes('대상 측정: 4건'));
    assert.ok(reportText.includes('- [x] 측정 속도'));
    const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('#export-csv').click()]);
    const csvText = await fs.readFile(await csv.path(), 'utf8');
    assert.ok(csvText.includes('criteriaSnapshot')); assert.ok(csvText.includes('측정 방법 확인 후 검토합니다.'));
    assert.ok(csvText.includes('followUpChecklist')); assert.ok(csvText.includes('""checked"":true'));
    pass('실제 CSV·Markdown 다운로드에 필터·전체 기준·메모 포함');
    const [template] = await Promise.all([page.waitForEvent('download'), page.locator('#download-template').click()]);
    const templateText = await fs.readFile(await template.path(), 'utf8');
    assert.ok(templateText.includes('PA-270-M4'));
    assert.ok(templateText.startsWith('\uFEFF"batchId"'));
    pass('서버 연결 없이도 입력 양식 다운로드');

    await page.locator('#reset-filter').click();
    await page.locator('#category-filter').selectOption('missing');
    assert.ok((await page.locator('#filtered-count').innerText()).includes('108건'));
    await page.locator('#reset-filter').click();
    await page.locator('#search').fill('없는배치');
    assert.ok((await page.locator('#record-rows').innerText()).includes('해당하는 기록이 없습니다'));
    assert.equal(await page.locator('#export-report').isDisabled(), true);
    await page.locator('#reset-filter').click();
    await page.locator('#next-page').click();
    assert.ok((await page.locator('#page-label').innerText()).startsWith('2 /'));
    pass('누락 필터·검색 결과 없음·페이지 이동');

    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    assert.equal(await page.locator('.follow-up-check input').isChecked(), true);
    await page.reload(); await page.waitForFunction(() => document.getElementById('total-count').textContent === '1,080');
    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    assert.equal(await page.locator('.follow-up-check input').isChecked(), true);

    await page.locator('#open-criteria').click();
    await page.locator('#criterion-viscosityMin').fill('2000');
    await page.locator('#criteria-form button[type=submit]').click();
    assert.ok((await page.locator('#criteria-error').innerText()).includes('하한은 상한보다'));
    await page.locator('#criterion-viscosityMin').fill('1000');
    await page.locator('#criterion-viscosityMax').fill('1250');
    await page.locator('#criteria-form button[type=submit]').click();
    assert.notEqual(await page.locator('#pass-count').innerText(), '432');
    assert.equal(await page.locator('.follow-up-task[data-task="measurement:rpm"] input').isChecked(), false);
    assert.equal(await page.locator('.comparison-row[data-field="viscosity"] .comparison-expected').innerText(), '1000~1250 mPa·s');
    await page.locator('#search').fill('PA-008');
    assert.equal(await page.locator('.comparison-guide .guide-item[data-field="viscosity"] .guide-expected span').innerText(), '1000~1250 mPa·s');
    const version = await page.locator('#criteria-version').innerText();
    await page.reload(); await page.waitForFunction(() => document.getElementById('total-count').textContent === '1,080');
    assert.equal(await page.locator('#criteria-version').innerText(), version);
    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    assert.equal(await page.locator('#review-note').inputValue(), '측정 방법 확인 후 검토합니다.');
    pass('잘못된 기준 거부·기준 변경 재검토·새로고침 후 기준과 메모 유지');

    await page.locator('#open-criteria').click(); await page.locator('#reset-criteria').click();
    await page.locator('#criteria-form button[type=submit]').click();
    const data = JSON.parse(await fs.readFile(path.join(__dirname,'../data/demo-records.json'),'utf8'));
    const original = await fs.readFile(path.join(__dirname,'../data/demo-records.csv'),'utf8');
    await page.locator('#csv-file').setInputFiles({name:'가상자료.csv', mimeType:'text/csv', buffer:Buffer.from(original)});
    await page.waitForFunction(() => document.getElementById('source-name').textContent === '가상자료.csv');
    assert.equal(await page.locator('#total-count').innerText(), '1,080');
    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    assert.equal(await page.locator('.follow-up-check input').isChecked(), false);
    await page.locator('#csv-file').setInputFiles({name:'중복.csv', mimeType:'text/csv', buffer:Buffer.from('batchId,measurementId,viscosity,unit\nb,m,1200,cP\nb,m,1300,cP')});
    await page.waitForFunction(() => document.getElementById('message').textContent.includes('중복 측정 번호'));
    assert.equal(await page.locator('#total-count').innerText(), '1,080');
    pass('실제 CSV 입력·중복 ID 거부·기존 데이터 유지');

    const headers = Object.keys(data[0]);
    const malicious = {...data[0], sourceNote:'<img src=x onerror="window.__injected=true">'};
    const quote = value => `"${String(value).replaceAll('"','""')}"`;
    await page.locator('#csv-file').setInputFiles({name:'문자검증.csv', mimeType:'text/csv', buffer:Buffer.from(headers.join(',')+'\n'+headers.map(key=>quote(malicious[key])).join(','))});
    await page.waitForFunction(() => document.getElementById('total-count').textContent === '1');
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    assert.ok((await page.locator('.comparison-row[data-field="sourceNote"] .comparison-actual').innerText()).includes('<img src=x'));
    pass('CSV의 HTML을 실행하지 않고 원문으로 표시');

    await page.locator('#csv-file').setInputFiles({name:'누락안내.csv', mimeType:'text/csv', buffer:Buffer.from('batchId,measurementId,viscosity,unit\nb,m,1200,cP')});
    await page.waitForFunction(() => document.getElementById('source-name').textContent === '누락안내.csv');
    assert.equal(await page.locator('.comparison-guide > .guide-list .guide-item').count(), 4);
    assert.ok((await page.locator('.guide-more summary').innerText()).includes('나머지'));
    await page.locator('.guide-more summary').click();
    assert.ok(await page.locator('.guide-more .guide-item').count() > 0);
    assert.ok(await page.locator('.follow-up-task').count() > 4);
    assert.ok((await page.locator('.follow-up-list').innerText()).includes('추정값'));
    pass('상단 비교 안내: 정상·차이·누락·기준 변경·여러 확인 항목 표시');
    pass('후속 체크리스트: 자료 확인·저장·판정 유지·기준 변경·데이터 분리·보고서 내보내기');

    await page.locator('#load-demo').click(); await page.waitForFunction(() => document.getElementById('total-count').textContent === '1,080');
    await page.locator('#reset-filter').click();
    for (const width of [390,320]) {
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(() => Number(document.querySelector('#chart svg').viewBox.baseVal.width) === Math.max(280, document.getElementById('chart').clientWidth));
      await page.evaluate(() => window.scrollTo(0,0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.comparison-row[data-field="sampleTemperature"] .comparison-expected').innerText(), '25 ± 0.5 ℃');
      await page.locator('#open-criteria').click();
      assert.equal(await page.evaluate(() => document.querySelector('dialog').getBoundingClientRect().width <= innerWidth), true);
      await page.locator('#close-criteria').click();
      await page.screenshot({path:path.join(output,`mobile-${width}.png`), fullPage:true});
    }
    pass('390px·320px 화면에 가로 넘침 없음·기준 창 사용 가능');
    await page.locator('#search').fill('PA-006'); await page.locator('.record-link').nth(1).click();
    await page.locator('#comparison-only-issues').check();
    assert.equal(await page.locator('.comparison-row').count(), 1);
    await page.locator('.comparison-section').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'comparison-mobile.png'), fullPage:true});
    await page.locator('.comparison-section').screenshot({path:path.join(output,'comparison-panel-mobile.png')});
    await page.locator('.record-link').first().click();
    await page.locator('.comparison-guide').screenshot({path:path.join(output,'guidance-mobile.png')});
    await page.locator('.follow-up-section').screenshot({path:path.join(output,'checklist-mobile.png')});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []); pass('브라우저 JavaScript·콘솔 오류 없음');
    await fs.writeFile(path.join(output, process.env.PORTABLE_TEST === '1' ? 'portable-results.json' : 'ui-results.json'), JSON.stringify({targetURL,checks,errors},null,2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
