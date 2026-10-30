// Keep source colors/alpha intact; only the inferred foreground mask changes.
export function refineAlpha(source, cutout, strength = 85) {
  const ceiling = 255 - Math.max(0, Math.min(100, Number(strength) || 0)) * 2.2;
  for (let i = 0; i < cutout.length; i += 4) {
    cutout[i] = source[i]; cutout[i + 1] = source[i + 1]; cutout[i + 2] = source[i + 2];
    cutout[i + 3] = Math.min(source[i + 3], Math.round(cutout[i + 3] * 255 / ceiling));
  }
  return cutout;
}

export function brushStroke(pixels, source, width, height, from, to, radius, restore) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
  for (let step = 0; step <= steps; step++) {
    const cx = from.x + (to.x - from.x) * step / steps;
    const cy = from.y + (to.y - from.y) * step / steps;
    for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(height, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, Math.ceil(cx + radius)); x++) {
        const d = Math.hypot(x + .5 - cx, y + .5 - cy);
        if (d > radius) continue;
        const i = (y * width + x) * 4;
        const weight = Math.min(1, Math.max(0, radius - d));
        const target = restore ? source[i + 3] : 0;
        pixels[i] = source[i]; pixels[i + 1] = source[i + 1]; pixels[i + 2] = source[i + 2];
        pixels[i + 3] = Math.round(pixels[i + 3] + (target - pixels[i + 3]) * weight);
      }
    }
  }
}

async function readPixels(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0); bitmap.close();
  return { canvas, ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

export async function editCutout(asset, onSave) {
  const original = await readPixels(asset.originalBlob);
  const edited = await readPixels(asset.blob);
  const { canvas, ctx, pixels } = edited;
  const initial = new Uint8ClampedArray(pixels.data);
  const dialog = document.createElement('dialog');
  dialog.className = 'cutout-editor';
  dialog.setAttribute('aria-label', 'Refine cutout');
  dialog.innerHTML = `<h2>Refine cutout</h2>
    <p>Restore brings back the original pixels. Erase removes unwanted background. Paint over the faint original to recover missing parts.</p>
    <div class="editor-controls">
      <label>Brush<select data-tool><option value="restore">Restore</option><option value="erase">Erase</option></select></label>
      <label>Brush size<input data-size type="range" min="1" max="80" value="12" /></label>
      <label>Zoom<select data-zoom><option value="1">100%</option><option value="2" selected>200%</option><option value="4">400%</option></select></label>
      <label><input data-original type="checkbox" checked /> Show faint original</label>
      <button type="button" data-undo disabled>Undo stroke</button><button type="button" data-reset>Reset edits</button>
    </div><div class="editor-viewport"><div class="editor-layers"></div></div>
    <p data-status role="status">Changes are saved only when you apply them.</p>
    <div class="action-row"><button class="primary" data-save>Apply changes</button><button class="secondary" data-cancel>Cancel</button></div>`;
  const q = s => dialog.querySelector(s);
  const layers = q('.editor-layers');
  original.canvas.className = 'editor-original'; canvas.className = 'editor-paint';
  canvas.setAttribute('aria-label', 'Cutout canvas. Drag to paint with the selected brush.');
  layers.append(original.canvas, canvas);
  const history = [];
  const historyLimit = Math.max(1, Math.min(8, Math.floor(32 * 1024 * 1024 / (canvas.width * canvas.height))));
  let last = null;
  let saving = false;
  function redraw() { ctx.putImageData(pixels, 0, 0); q('[data-undo]').disabled = !history.length; }
  function zoom() {
    layers.style.width = `${canvas.width * Number(q('[data-zoom]').value)}px`;
    layers.style.height = `${canvas.height * Number(q('[data-zoom]').value)}px`;
  }
  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * canvas.width / rect.width, y: (e.clientY - rect.top) * canvas.height / rect.height };
  }
  function paint(e) {
    const next = point(e);
    brushStroke(pixels.data, original.pixels.data, canvas.width, canvas.height, last || next, next, Number(q('[data-size]').value) / 2, q('[data-tool]').value === 'restore');
    last = next; redraw();
  }
  canvas.addEventListener('pointerdown', e => {
    if (saving || e.button !== 0) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3];
    history.push(alpha); if (history.length > historyLimit) history.shift();
    paint(e);
  });
  canvas.addEventListener('pointermove', e => { if (last) paint(e); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, () => { last = null; });
  q('[data-undo]').onclick = () => { const alpha = history.pop(); if (alpha) for (let i = 0; i < alpha.length; i++) pixels.data[i * 4 + 3] = alpha[i]; redraw(); };
  q('[data-reset]').onclick = () => { pixels.data.set(initial); history.length = 0; redraw(); };
  q('[data-zoom]').onchange = zoom;
  q('[data-original]').onchange = e => { original.canvas.hidden = !e.target.checked; };
  function close() { dialog.close(); dialog.remove(); canvas.width = canvas.height = original.canvas.width = original.canvas.height = 0; }
  q('[data-cancel]').onclick = close;
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!saving) close(); });
  q('[data-save]').onclick = async () => {
    saving = true; last = null;
    for (const el of dialog.querySelectorAll('button, input, select')) el.disabled = true;
    try {
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not save image.')), 'image/png'));
      await onSave(blob); close();
    } catch (error) {
      q('[data-status]').textContent = error.message;
      saving = false;
      for (const el of dialog.querySelectorAll('button, input, select')) el.disabled = false;
      redraw();
    }
  };
  document.body.append(dialog); zoom(); dialog.showModal();
}

if (typeof window !== 'undefined') window.CutoutTools = { refineAlpha, editCutout };
