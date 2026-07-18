const fs = require('node:fs');
const path = require('node:path');
const file = path.join(process.cwd(), 'dist', 'index.html');
let html = fs.readFileSync(file, 'utf8');
html = html.replaceAll('src="/assets/', 'src="./assets/').replaceAll('href="/assets/', 'href="./assets/');
fs.writeFileSync(file, html);
if (html.includes('src="/assets/') || html.includes('href="/assets/')) throw new Error('Absolute asset path remains in dist/index.html');
console.log('Electron asset paths normalized');
