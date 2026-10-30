import { build, transform } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { patchDocxRenderer } from './patch-docx.mjs';
import { createHash } from 'node:crypto';
import { patchCanvasFontMetrics } from './patch-html2canvas.mjs';

await mkdir('dist/vendor', { recursive: true });
const docxSource = await readFile('node_modules/docx-preview/dist/docx-preview.js', 'utf8');
const patchedDocx = patchDocxRenderer(docxSource.replaceAll('\r\n', '\n'));
const { code } = await transform(patchedDocx, { minify: true, target: 'es2022', legalComments: 'inline' });
await writeFile('dist/vendor/docx-preview.min.js', '// docx-preview 0.4.1, Apache-2.0. Layout fixes: scripts/patch-docx.mjs\n' + code);
await Promise.all([
  build({ entryPoints: ['src/cutout-tools.mjs'], outfile: 'dist/cutout-tools.js', bundle: true,
    format: 'iife', platform: 'browser', target: 'es2022', minify: true }),
  copyFile('node_modules/jszip/dist/jszip.min.js', 'dist/vendor/jszip.min.js'),
  copyFile('node_modules/@imgly/background-removal/LICENSE.md', 'dist/vendor/background-removal-LICENSE.md'),
  // .js is served as JavaScript by Windows/Python static servers; .mjs may
  // incorrectly get text/plain and be rejected by module workers.
  copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/vendor/pdf.worker.min.js'),
  build({
    entryPoints: ['src/pdf-tools.mjs'],
    outfile: 'dist/pdf-tools.js',
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
    minify: true, legalComments: 'linked',
    plugins: [{ name: 'iframe-font-metrics', setup(builder) {
      builder.onLoad({ filter: /html2canvas[\\/]dist[\\/]html2canvas\.esm\.js$/ }, async ({ path }) => ({
        contents: patchCanvasFontMetrics(await readFile(path, 'utf8')), loader: 'js',
      }));
    } }],
  }),
  build({
    entryPoints: ['src/background-worker.js'],
    outfile: 'dist/background-worker.js',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'linked',
  }),
]);

// A refreshed page must never combine a cached PDF exporter with newer layout
// code. Fingerprint each browser entry after building; static hosts need no
// cache-header configuration to pick up fixes.
let html = await readFile('dist/index.html', 'utf8');
for (const asset of ['styles.css', 'app.js', 'pdf-tools.js', 'cutout-tools.js', 'vendor/jszip.min.js', 'vendor/docx-preview.min.js']) {
  const bytes = await readFile(`dist/${asset}`);
  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reference = new RegExp(`((?:src|href)=")${escaped}(?:\\?v=[a-zA-Z0-9-]+)?"`, 'g');
  html = html.replace(reference, `$1${asset}?v=${version}"`);
}
await writeFile('dist/index.html', html);
