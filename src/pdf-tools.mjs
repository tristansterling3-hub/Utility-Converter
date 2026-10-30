import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { createDocumentPdf } from './pdf-export.mjs';
import { prepareDocumentLayout } from './docx-layout.mjs';

// Resolve relative to the app page, including when hosted under a subdirectory.
GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;

async function renderPdfPreview(blob, container, isCurrent = () => true) {
  const loading = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
  try {
    const pdf = await loading.promise;
    for (let index = 1; index <= pdf.numPages; index++) {
      if (!isCurrent()) return;
      const page = await pdf.getPage(index);
      if (!isCurrent()) return;
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `PDF page ${index} of ${pdf.numPages}`);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      if (!isCurrent()) { canvas.width = canvas.height = 0; return; }
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `Page ${index} of ${pdf.numPages}`;
      figure.append(canvas, caption);
      container.append(figure);
      page.cleanup();
    }
  } finally {
    await loading.destroy();
  }
}

window.PdfTools = { createDocumentPdf, renderPdfPreview, prepareDocumentLayout };
