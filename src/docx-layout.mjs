function pixels(value) {
  const number = parseFloat(value);
  return value?.endsWith('pt') ? number * 96 / 72 : number;
}

export async function prepareDocumentLayout(container) {
  const document = container.ownerDocument;
  const view = document.defaultView;
  container.getBoundingClientRect();
  await document.fonts?.ready;
  // Prevent an 11pt default paragraph strut from enlarging every 9pt resume line.
  for (const paragraph of container.querySelectorAll('p')) {
    const walker = document.createTreeWalker(paragraph, 4 /* SHOW_TEXT */);
    const sizes = [];
    let largestRun;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.length) continue;
      const parent = node.parentElement;
      if (parent.closest('sup, sub, .docx-tab-stop')) continue;
      const runStyle = view.getComputedStyle(parent);
      const size = pixels(runStyle.fontSize);
      if (Number.isFinite(size) && size > 0) {
        if (!sizes.length || size > Math.max(...sizes)) largestRun = runStyle;
        sizes.push(size);
      }
    }
    if (sizes.length) paragraph.style.fontSize = `${Math.max(...sizes)}px`;
    // Match the paragraph strut to its text instead of mixing fallback metrics.
    if (largestRun?.fontFamily) paragraph.style.fontFamily = largestRun.fontFamily;
    const paragraphStyle = view.getComputedStyle(paragraph);
    const multiple = parseFloat(paragraphStyle.getPropertyValue('--docx-line-multiple'));
    if (paragraphStyle.lineHeight === 'normal' && Number.isFinite(multiple) && multiple > 0 && multiple !== 1) {
      const probe = paragraph.cloneNode(true);
      Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', width: 'max-content',
        height: 'auto', minHeight: '0', lineHeight: 'normal', margin: '0', padding: '0', border: '0' });
      // Preserve run fonts without allowing wrapping or explicit breaks.
      for (const br of probe.querySelectorAll('br')) br.remove();
      paragraph.parentNode.appendChild(probe);
      const height = probe.getBoundingClientRect().height;
      probe.remove();
      if (height > 0) paragraph.style.lineHeight = `${height * multiple}px`;
    }
  }
  container.getBoundingClientRect();
  await document.fonts?.ready;
}
