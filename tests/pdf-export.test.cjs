const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

function page(width, height, overflow = 0) {
  return {
    ownerDocument: { createElement: () => canvas(), defaultView: { getComputedStyle: () => ({ minHeight: `${height}px` }) } },
    getBoundingClientRect: () => ({ width, height: height + overflow }),
    scrollHeight: height + overflow, scrollWidth: width,
  };
}

// Real PNG bytes and real PDF writer/reader. Only browser rasterization is stubbed.
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=';
function canvas() { return { width: 10, height: 10, style: {}, toDataURL: () => png }; }

test('downloadable PDF contains all pages with original portrait/landscape dimensions', async () => {
  const { createDocumentPdf } = await import('../src/pdf-export.mjs');
  const captures = [];
  const blob = await createDocumentPdf([page(816, 1056), page(1122.5, 793.7)], {
    title: 'Resume', capture: async (_page, options) => { captures.push(options); return canvas(); },
  });
  assert.equal(blob.type, 'application/pdf');
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getTitle(), 'Resume');
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  assert.ok(Math.abs(pdf.getPage(1).getWidth() - 841.875) < 0.01);
  assert.ok(Math.abs(pdf.getPage(1).getHeight() - 595.275) < 0.01);
  assert.equal(captures[0].scale, 3);
  assert.equal(captures[0].height, 1056);
  assert.equal(captures[0].canvas.width, 2448);
  assert.equal(captures[0].canvas.height, 3168);
});

test('overflow includes the bottom of the resume and still exports original paper size', async () => {
  const { createDocumentPdf } = await import('../src/pdf-export.mjs');
  let capturedHeight;
  const warnings = [];
  const blob = await createDocumentPdf([page(816, 1056, 100)], {
    onWarning: warning => warnings.push(warning),
    capture: async (_page, options) => { capturedHeight = options.height; return canvas(); },
  });
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  assert.equal(capturedHeight, 1156);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  assert.match(warnings[0], /fitted to 91%/);
});

test('horizontal overflow is captured too, without changing portrait paper', async () => {
  const { createDocumentPdf } = await import('../src/pdf-export.mjs');
  const section = page(816, 1056); section.scrollWidth = 1000;
  let capturedWidth;
  const blob = await createDocumentPdf([section], {
    capture: async (_page, options) => { capturedWidth = options.width; return canvas(); },
  });
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  assert.equal(capturedWidth, 1000);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
});

test('obsolete conversion releases its canvas and never produces a stale PDF', async () => {
  const { createDocumentPdf } = await import('../src/pdf-export.mjs');
  let current = true;
  const captured = canvas();
  await assert.rejects(createDocumentPdf([page(816, 1056)], {
    isCurrent: () => current,
    capture: async () => { current = false; return captured; },
  }), { name: 'AbortError' });
  assert.equal(captured.width, 0);
  assert.equal(captured.height, 0);
});
