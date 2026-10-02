import { readFile, writeFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const [html, css, core, app, data] = await Promise.all([
  read('index.html'), read('src/styles.css'), read('src/core.js'), read('src/app.js'), read('data/demo-records.json')
]);
const importLine = /^import \{[^\n]+\} from '\.\/core\.js';\r?\n/;
if (!importLine.test(app)) throw new Error('앱의 모듈 구조가 바뀌었습니다. 단일 파일 생성기를 확인하세요.');
const script = `window.__POLY_DEMO__ = ${JSON.stringify(JSON.parse(data)).replaceAll('<', '\\u003c')};\n` +
  core.replace(/^export /gm, '') + '\n' + app.replace(importLine, '');
const portable = html
  .replace('<link rel="stylesheet" href="./src/styles.css">', `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>', '')
  .replace('</body>', `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`)
  .replace(/^[\t ]+$/gm, '');
if (portable.includes('src="./src/app.js"') || portable.includes('href="./src/styles.css"')) throw new Error('외부 코드 연결이 남았습니다.');
await writeFile(new URL('../점도_검토실_바로열기.html', import.meta.url), portable, 'utf8');
console.log('생성 완료: 점도_검토실_바로열기.html — 서버 없이 브라우저에서 열 수 있습니다.');
