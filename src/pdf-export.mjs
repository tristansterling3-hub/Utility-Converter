import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

function ensureCurrent(isCurrent) {
  if (!isCurrent()) {
    const error = new Error('Document changed while creating the PDF.');
    error.name = 'AbortError';
    throw error;
  }
}

// Capture each laid-out DOCX page independently. If browser layout overflows,
// retain all content and fit it proportionally onto the original paper size.
export async function createDocumentPdf(sections, {
  title = 'document', isCurrent = () => true, onProgress = () => {},
  onWarning = () => {},
  capture = html2canvas,
} = {}) {
  if (!sections.length) throw new Error('No document pages were found.');
  let pdf;
  for (const [index, section] of sections.entries()) {
    ensureCurrent(isCurrent);
    const view = section.ownerDocument.defaultView;
    const bounds = section.getBoundingClientRect();
    const styles = view.getComputedStyle(section);
    const width = bounds.width;
    const height = parseFloat(styles.minHeight) || bounds.height;
    if (!(width > 0 && height > 0)) throw new Error('The document page has no printable dimensions.');
    const contentHeight = Math.max(bounds.height, section.scrollHeight || 0);
    const contentWidth = Math.max(width, section.scrollWidth || 0);
    const captureHeight = contentHeight > height + 2 ? contentHeight : height;
    const captureWidth = contentWidth > width + 2 ? contentWidth : width;
    const fit = Math.min(1, width / captureWidth, height / captureHeight);
    if (fit < 1) onWarning(`Page ${index + 1} was fitted to ${Math.round(fit * 100)}% to keep all content on its original paper size. Review the preview for readability.`);
    onProgress(index + 1, sections.length);
    // 3x CSS resolution (288 dpi), bounded for unusually large paper sizes.
    const scale = Math.min(3, 8192 / captureWidth, 8192 / captureHeight, Math.sqrt(24000000 / (captureWidth * captureHeight)));
    const targetCanvas = section.ownerDocument.createElement('canvas');
    targetCanvas.width = Math.ceil(captureWidth * scale);
    targetCanvas.height = Math.ceil(captureHeight * scale);
    targetCanvas.style.width = `${captureWidth}px`;
    targetCanvas.style.height = `${captureHeight}px`;
    const canvas = await capture(section, {
      // Canvas text must use the same FontFaceSet as the DOCX layout. A canvas
      // created in the app document silently falls back to unrelated fonts.
      canvas: targetCanvas,
      scale, width: captureWidth, height: captureHeight, backgroundColor: '#ffffff', logging: false,
      useCORS: false, allowTaint: false, imageTimeout: 15000,
      windowWidth: Math.max(1200, Math.ceil(captureWidth + 40)),
      windowHeight: Math.max(1000, Math.ceil(captureHeight + 40)),
      onclone: (_document, element) => {
        element.style.boxShadow = 'none';
        element.style.overflow = 'visible';
        element.style.minHeight = `${captureHeight}px`;
      },
    });
    try {
      ensureCurrent(isCurrent);
      const pageSize = [width * 72 / 96, height * 72 / 96];
      const orientation = width > height ? 'landscape' : 'portrait';
      if (!pdf) {
        pdf = new jsPDF({ unit: 'pt', format: pageSize, orientation, compress: true });
        pdf.setProperties({ title, creator: 'Asset Forge Converter' });
      } else {
        pdf.addPage(pageSize, orientation);
      }
      const imageWidth = captureWidth * fit * 72 / 96;
      const imageHeight = captureHeight * fit * 72 / 96;
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageSize[0] - imageWidth) / 2, 0, imageWidth, imageHeight, undefined, 'FAST');
    } finally {
      canvas.width = canvas.height = 0;
    }
  }
  ensureCurrent(isCurrent);
  return pdf.output('blob');
}
