const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'public/vendor');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), path.join(destination, 'pdf.worker.min.mjs'));
fs.copyFileSync(path.join(root, 'node_modules/pdfjs-dist/LICENSE'), path.join(destination, 'PDFJS-LICENSE'));
