// html2canvas 1.4.1 (MIT) measures text using its global document. When the
// supplied canvas belongs to a DOCX iframe, its embedded fonts live there too.
export function patchCanvasFontMetrics(source) {
  const before = 'new FontMetrics(document)';
  if (source.split(before).length !== 2) throw new Error('html2canvas changed; review the iframe-font patch.');
  return source.replace(before, 'new FontMetrics(_this.canvas.ownerDocument)');
}
