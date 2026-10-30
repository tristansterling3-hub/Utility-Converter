const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');

test('9pt resume runs do not inherit an 11pt minimum paragraph height', async () => {
  const { prepareDocumentLayout } = await import('../src/docx-layout.mjs');
  const dom = new JSDOM('<div id="pages" style="font-size:11pt"><p><span style="font-size:9pt">Body text</span></p><p><span style="font-size:19pt">Heading</span></p><p><span style="font-size:7pt"> </span></p></div>');
  const root = dom.window.document.querySelector('#pages');
  await prepareDocumentLayout(root);
  assert.deepEqual([...root.querySelectorAll('p')].map(p => p.style.fontSize), ['12px', `${19 * 96 / 72}px`, `${7 * 96 / 72}px`]);
  dom.window.close();
});

test('DOCX render waits for fonts and layout callback before completing tab alignment', async () => {
  const { patchDocxRenderer } = await import('../scripts/patch-docx.mjs');
  const dom = new JSDOM('<div id="styles"></div><div id="pages"></div>', { runScripts: 'outside-only' });
  const win = dom.window;
  win.JSZip = JSZip;
  let releaseFonts;
  let fontsResolved = false;
  Object.defineProperty(win.document, 'fonts', { value: { ready: new Promise(resolve => {
    releaseFonts = () => { fontsResolved = true; resolve(); };
  }) } });
  const source = fs.readFileSync('node_modules/docx-preview/dist/docx-preview.js', 'utf8').replaceAll('\r\n', '\n');
  win.eval(patchDocxRenderer(source));
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Role</w:t><w:tab/><w:t>Date</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>');
  let layoutCalled = false;
  let renderDone = false;
  const result = win.docx.renderAsync(await zip.generateAsync({ type: 'uint8array' }), win.document.querySelector('#pages'), win.document.querySelector('#styles'), {
    experimental: true,
    afterRender: () => { assert.ok(fontsResolved); layoutCalled = true; },
  }).then(() => { renderDone = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(renderDone, false);
  assert.equal(layoutCalled, false);
  releaseFonts();
  await result;
  assert.equal(layoutCalled, true);
  assert.equal(renderDone, true);
  dom.window.close();
});

test('renderer patch fails clearly if the pinned upstream implementation changes', async () => {
  const { patchDocxRenderer } = await import('../scripts/patch-docx.mjs');
  assert.throws(() => patchDocxRenderer('new incompatible implementation'), /review the layout patch/);
});

test('raw XML newlines become spaces while explicit Word line breaks survive', async () => {
  const { patchDocxRenderer } = await import('../scripts/patch-docx.mjs');
  const dom = new JSDOM('<div id="pages"></div>', { runScripts: 'outside-only' });
  const win = dom.window; win.JSZip = JSZip;
  win.eval(patchDocxRenderer(fs.readFileSync('node_modules/docx-preview/dist/docx-preview.js', 'utf8').replaceAll('\r\n', '\n')));
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:spacing w:val="100"/></w:rPr><w:t xml:space="preserve">Front\nEnd  Skills</w:t><w:br/><w:t>Next line</w:t></w:r></w:p><w:p><w:pPr><w:spacing w:line="280" w:lineRule="exact"/></w:pPr><w:r><w:t>Exact spacing</w:t></w:r></w:p></w:body></w:document>');
  const root = win.document.querySelector('#pages');
  await win.docx.renderAsync(await zip.generateAsync({type:'uint8array'}), root);
  assert.match(root.querySelector('p').textContent, /Front End  Skills/);
  assert.equal(root.querySelectorAll('br').length, 1);
  assert.equal(root.querySelector('p').style.lineHeight, 'normal');
  assert.equal(root.querySelector('p').style.getPropertyValue('--docx-line-multiple'), '1');
  assert.equal(root.querySelector('span').style.letterSpacing, '5.00pt');
  assert.equal(root.querySelectorAll('p')[1].style.lineHeight, '14pt');
  dom.window.close();
});

test('explicit line heights are not overridden by inherited automatic spacing', async () => {
  const { prepareDocumentLayout } = await import('../src/docx-layout.mjs');
  const dom = new JSDOM('<div id="pages"><p style="line-height:14pt;--docx-line-multiple:1.15"><span style="font:9pt Raleway">Exact spacing</span></p></div>');
  const root = dom.window.document.querySelector('#pages');
  await prepareDocumentLayout(root);
  assert.equal(root.querySelector('p').style.lineHeight, '14pt');
  assert.equal(root.querySelector('p').style.fontFamily, 'Raleway');
  dom.window.close();
});

test('canvas font measurement follows the canvas document, not the app font set', async () => {
  const { patchCanvasFontMetrics } = await import('../scripts/patch-html2canvas.mjs');
  const source = fs.readFileSync('node_modules/html2canvas/dist/html2canvas.esm.js', 'utf8');
  const patched = patchCanvasFontMetrics(source);
  assert.ok(patched.includes('new FontMetrics(_this.canvas.ownerDocument)'));
  assert.ok(!patched.includes('new FontMetrics(document)'));
  assert.throws(() => patchCanvasFontMetrics('incompatible source'), /review the iframe-font patch/);
});
