import { copyFile, mkdir } from 'node:fs/promises';

// Keep development files and local review state outside the hosted assets.
const assets = [
  'index.html',
  'src/styles.css',
  'src/app.js',
  'src/core.js',
  'data/demo-records.json',
  'data/demo-records.csv'
];

for (const asset of assets) {
  const source = new URL(`../${asset}`, import.meta.url);
  const destination = new URL(`../dist/${asset}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(source, destination);
}

console.log(`웹 배포 파일 준비 완료: dist/ (${assets.length}개 파일)`);
