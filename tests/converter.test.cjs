const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  class Element {
    constructor() {
      this.children = []; this.listeners = {}; this.value = ''; this.checked = false;
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    removeAttribute(name) { delete this[name]; }
    querySelectorAll() { return []; }
    remove() {}
    click() {}
    set innerHTML(value) { this.html = value; this.children = []; }
    get innerHTML() { return this.html; }
  }
  const elements = new Map();
  const revoked = [];
  const context = vm.createContext({
    console, setTimeout, clearTimeout, Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: (url) => revoked.push(url) },
    document: {
      body: new Element(),
      querySelector: (id) => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
      },
      createElement: () => new Element(),
    },
    window: {},
  });
  vm.runInContext(fs.readFileSync('dist/app.js', 'utf8'), context);
  const run = (code) => vm.runInContext(code, context);
  run('formatSelect.value = "image/png"; resizeMode.value = "original"; qualityRange.value = "92"; preserveAlpha.checked = true;');
  return { context, elements, revoked, run };
}

test('custom sizing clamps invalid input and keeps extreme aspect ratios nonzero', () => {
  const { run } = setup();
  run('resizeMode.value = "custom"; maxSizeInput.value = "-50";');
  assert.equal(run('resolveSize(8000, 1).width'), 16);
  assert.equal(run('resolveSize(8000, 1).height'), 1);
  run('maxSizeInput.value = "99999";');
  assert.equal(run('resolveSize(16000, 8000).width'), 8192);
});

test('file error text is rendered as text, never injected as HTML', () => {
  const { run, elements } = setup();
  run('setEmptyPreview("<img src=x onerror=alert(1)>")');
  assert.equal(elements.get('#previewBoard').children[0].children[1].textContent, '<img src=x onerror=alert(1)>');
});

test('batch keeps successes, reports corrupt files, and avoids ZIP name collisions', async () => {
  const { run, elements } = setup();
  run(`imageFiles = [{name: 'ok.png'}, {name: 'broken.png'}, {name: 'ok.png'}];
    convertFile = async file => {
      if (file.name === 'broken.png') throw new Error('Unreadable');
      return {filename:'ok-10x10.png', url:'blob:ok', width:10, height:10, blob:new Blob(['a'])};
    };`);
  await run('handleImageConvert()');
  assert.equal(run('convertedAssets.length'), 2);
  assert.equal(run('convertedAssets[1].filename'), 'ok-10x10-2.png');
  assert.match(elements.get('#outputSummary').textContent, /broken.png: Unreadable/);
  assert.equal(elements.get('#downloadZip').disabled, false);
});

test('cancel does not publish a late conversion result', async () => {
  const { run, elements, revoked } = setup();
  run(`imageFiles = [{name:'slow.png'}]; var finish;
    convertFile = () => new Promise(resolve => { finish = resolve; });`);
  const pending = run('handleImageConvert()');
  elements.get('#cancelImages').listeners.click();
  run(`finish({filename:'slow.png', url:'blob:late', width:1, height:1, blob:new Blob(['a'])})`);
  await pending;
  assert.equal(run('convertedAssets.length'), 0);
  assert.ok(revoked.includes('blob:late'));
  assert.equal(elements.get('#convertImages').disabled, false);
});

test('background removal forces PNG with transparency even if JPEG/flattening was selected', async () => {
  const { context, run } = setup();
  let fillCount = 0;
  let outputType;
  context.document.createElement = () => ({
    getContext: () => ({ drawImage() {}, fillRect() { fillCount++; }, clearRect() {}, getImageData: () => ({data:new Uint8ClampedArray(4)}), putImageData() {} }),
    toBlob: (callback, type) => { outputType = type; callback(new Blob(['image'], { type })); },
  });
  context.createImageBitmap = async () => ({ close() {} });
  context.window.CutoutTools = { refineAlpha() {} };
  run(`loadImage = async () => ({ image:{naturalWidth:100,naturalHeight:80}, url:'blob:input' });
    removeImageBackground = async blob => blob;
    removeBackground.checked = true; formatSelect.value = 'image/jpeg'; preserveAlpha.checked = false;`);
  const output = await run('convertFile({name:"portrait.jpg"})');
  assert.equal(outputType, 'image/png');
  assert.equal(fillCount, 0);
  assert.equal(output.filename, 'portrait-no-bg-100x80.png');
});

test('controls prevent settings and queued files changing during conversion', () => {
  const { run, elements } = setup();
  run('imageBusy = true; syncImageControls(); handleImageFiles([{name:"new.png",type:"image/png"}]);');
  assert.equal(run('imageFiles.length'), 0);
  assert.equal(elements.get('#removeBackground').disabled, true);
  assert.equal(elements.get('#cancelImages').hidden, false);
});

test('applying a cutout repair replaces the downloadable asset used by ZIP export', async () => {
  const { run, context, elements, revoked } = setup();
  const repaired = new Blob(['repaired'], {type:'image/png'});
  context.window.CutoutTools = { editCutout: async (asset, save) => save(repaired) };
  run(`convertedAssets = [{filename:'cutout.png',url:'blob:old',width:10,height:10,blob:new Blob(['old']),originalBlob:new Blob(['source'])}]; renderConvertedAssets();`);
  const card = elements.get('#previewBoard').children[0];
  await card.children[4].listeners.click();
  assert.equal(run('convertedAssets[0].blob'), repaired);
  assert.ok(revoked.includes('blob:old'));
  assert.equal(elements.get('#previewBoard').children[0].children[3].href, 'blob:test');
  assert.equal(elements.get('#downloadZip').disabled, false);
});

test('preview and direct download use the same generated PDF and filename', async () => {
  const { context, run, elements } = setup();
  const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
  let previewed;
  let clicked;
  context.window.PdfTools = {
    createDocumentPdf: async () => blob,
    renderPdfPreview: async input => { previewed = input; },
  };
  await run('preparePdfDownload([{}], "resume.pdf", docRevision)');
  context.document.createElement = () => ({ click() { clicked = { href: this.href, download: this.download }; }, remove() {} });
  elements.get('#downloadPdf').listeners.click();
  assert.equal(previewed, blob);
  assert.equal(clicked.href, elements.get('#openPdf').href);
  assert.equal(clicked.download, 'resume.pdf');
  assert.equal(elements.get('#downloadPdf').disabled, false);
  assert.match(elements.get('#pdfPreviewStatus').textContent, /same PDF/);
});

test('clearing a PDF revokes its URL and disables stale downloads', async () => {
  const { context, run, elements, revoked } = setup();
  context.window.PdfTools = {
    createDocumentPdf: async () => new Blob(['pdf']), renderPdfPreview: async () => {},
  };
  await run('preparePdfDownload([{}], "old.pdf", docRevision)');
  run('clearGeneratedPdf()');
  assert.ok(revoked.includes('blob:test'));
  assert.equal(elements.get('#downloadPdf').disabled, true);
  assert.equal(elements.get('#pdfOutput').hidden, true);
  assert.equal(elements.get('#openPdf').href, undefined);
});

test('a PDF finishing after document replacement cannot become downloadable', async () => {
  const { context, run, elements } = setup();
  let finish;
  context.window.PdfTools = {
    createDocumentPdf: () => new Promise(resolve => { finish = resolve; }),
    renderPdfPreview: async () => { throw new Error('Must not preview stale PDF'); },
  };
  run('clearGeneratedPdf()');
  const pending = run('preparePdfDownload([{}], "old.pdf", docRevision)');
  run('docRevision++');
  finish(new Blob(['old pdf']));
  await pending;
  assert.equal(elements.get('#downloadPdf').disabled, true);
  assert.equal(run('generatedPdf'), null);
});

test('viewer failure still leaves the successfully generated PDF downloadable', async () => {
  const { context, run, elements } = setup();
  context.window.PdfTools = {
    createDocumentPdf: async () => new Blob(['pdf']),
    renderPdfPreview: async () => { throw new Error('Viewer unavailable'); },
  };
  await run('preparePdfDownload([{}], "resume.pdf", docRevision)');
  assert.equal(elements.get('#downloadPdf').disabled, false);
  assert.match(elements.get('#pdfPreviewStatus').textContent, /Viewer unavailable/);
});
