const imageInput = document.querySelector("#imageInput");
const imageDrop = document.querySelector("#imageDrop");
const imageList = document.querySelector("#imageList");
const previewBoard = document.querySelector("#previewBoard");
const outputSummary = document.querySelector("#outputSummary");
const formatSelect = document.querySelector("#formatSelect");
const resizeMode = document.querySelector("#resizeMode");
const maxSizeInput = document.querySelector("#maxSize");
const qualityRange = document.querySelector("#qualityRange");
const preserveAlpha = document.querySelector("#preserveAlpha");
const flipY = document.querySelector("#flipY");
const convertImages = document.querySelector("#convertImages");
const clearImages = document.querySelector("#clearImages");
const downloadZip = document.querySelector("#downloadZip");
const removeBackground = document.querySelector("#removeBackground");
const cancelImages = document.querySelector("#cancelImages");
const cutoutStyle = document.querySelector("#cutoutStyle");
const detailRecovery = document.querySelector("#detailRecovery");

const docInput = document.querySelector("#docInput");
const docDrop = document.querySelector("#docDrop");
const convertDoc = document.querySelector("#convertDoc");
const printDoc = document.querySelector("#printDoc");
const clearDoc = document.querySelector("#clearDoc");
const docStatus = document.querySelector("#docStatus");
const docPreview = document.querySelector("#docPreview");
const downloadPdf = document.querySelector("#downloadPdf");
const pdfOutput = document.querySelector("#pdfOutput");
const pdfPages = document.querySelector("#pdfPages");
const pdfPreviewStatus = document.querySelector("#pdfPreviewStatus");
const openPdf = document.querySelector("#openPdf");

let imageFiles = [];
let convertedAssets = [];
let docFile = null;
let imageBusy = false;
let imageRun = 0;
let backgroundWorker = null;
let pendingRemoval = null;
let removalId = 0;
let docRevision = 0;
let docReady = false;
let generatedPdf = null;

const extensionByType = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function bindDropZone(zone, input, onFiles) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-dragging");
  });

  zone.addEventListener("dragleave", () => zone.classList.remove("is-dragging"));

  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-dragging");
    onFiles([...event.dataTransfer.files]);
  });

  input.addEventListener("change", () => onFiles([...input.files]));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileBaseName(name) {
  return name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
}

function nearestPowerOfTwo(value) {
  const lower = 2 ** Math.floor(Math.log2(value));
  const upper = 2 ** Math.ceil(Math.log2(value));
  return value - lower < upper - value ? lower : upper;
}

function resolveSize(width, height) {
  if (resizeMode.value === "pot") {
    return {
      width: Math.max(16, nearestPowerOfTwo(width)),
      height: Math.max(16, nearestPowerOfTwo(height)),
    };
  }

  if (resizeMode.value === "custom") {
    const requested = Number(maxSizeInput.value);
    const max = Number.isFinite(requested) ? Math.min(8192, Math.max(16, requested || 2048)) : 2048;
    const scale = Math.min(1, max / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  return { width, height };
}

function renderImageList() {
  imageList.innerHTML = "";
  if (!imageFiles.length) {
    const item = document.createElement("li");
    item.innerHTML = "<span>No images queued.</span><small>Add files to begin</small>";
    imageList.append(item);
    return;
  }

  imageFiles.forEach((file) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const size = document.createElement("small");
    name.textContent = file.name;
    size.textContent = formatBytes(file.size);
    item.append(name, size);
    imageList.append(item);
  });
}

function setEmptyPreview(message = "Converted assets will show here with dimensions and download links.") {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  const icon = document.createElement("span");
  icon.textContent = "▧";
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("p");
  text.textContent = message;
  empty.append(icon, text);
  previewBoard.replaceChildren(empty);
  outputSummary.textContent = "No files converted yet.";
  downloadZip.disabled = true;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not export this format."))),
      type,
      quality,
    );
  });
}

async function convertFile(file) {
  const { image, url } = await loadImage(file);
  try {
  const size = resolveSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = size.width;
  canvas.height = size.height;

  const type = removeBackground.checked ? "image/png" : formatSelect.value;
  let source = image;
  let cutout = null;
  let originalBlob = null;
  if (removeBackground.checked) {
    // Rasterize all browser-readable inputs (including SVG/GIF) before inference.
    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = image.naturalWidth;
    inputCanvas.height = image.naturalHeight;
    const inputContext = inputCanvas.getContext("2d");
    // Decode a stable first frame, so inference and manual restoration match.
    const firstFrame = await createImageBitmap(file);
    inputContext.drawImage(firstFrame, 0, 0);
    firstFrame.close();
    const originalPixels = inputContext.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
    const inputBlob = await canvasToBlob(inputCanvas, "image/png", 1);
    cutout = await createImageBitmap(await removeImageBackground(inputBlob));
    inputContext.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
    inputContext.drawImage(cutout, 0, 0);
    cutout.close(); cutout = null;
    const cutoutPixels = inputContext.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
    window.CutoutTools.refineAlpha(originalPixels.data, cutoutPixels.data, cutoutStyle.value === "soft" ? 0 : Number(detailRecovery.value));
    inputContext.putImageData(cutoutPixels, 0, 0);
    source = inputCanvas;
    // Store the original in the same output dimensions/orientation for brushes.
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = size.width; originalCanvas.height = size.height;
    const originalContext = originalCanvas.getContext("2d");
    const originalBitmap = await createImageBitmap(inputBlob);
    if (flipY.checked) { originalContext.translate(0, size.height); originalContext.scale(1, -1); }
    originalContext.drawImage(originalBitmap, 0, 0, size.width, size.height);
    originalBitmap.close();
    originalBlob = await canvasToBlob(originalCanvas, "image/png", 1);
    originalCanvas.width = originalCanvas.height = 0;
  }

  if (!removeBackground.checked && (type === "image/jpeg" || !preserveAlpha.checked)) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (flipY.checked) {
    context.translate(0, canvas.height);
    context.scale(1, -1);
  }

  try {
    context.drawImage(source, 0, 0, size.width, size.height);
  } finally {
    cutout?.close();
    if (source !== image) source.width = source.height = 0;
  }

  const quality = Number(qualityRange.value) / 100;
  const blob = await canvasToBlob(canvas, type, quality);
  const extension = extensionByType[type];
  const filename = `${fileBaseName(file.name) || "asset"}${removeBackground.checked ? "-no-bg" : ""}-${size.width}x${size.height}.${extension}`;
  return {
    blob,
    originalBlob,
    filename,
    width: size.width,
    height: size.height,
    url: URL.createObjectURL(blob),
  };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function stopBackgroundWorker(message = "Background removal cancelled.") {
  backgroundWorker?.terminate();
  backgroundWorker = null;
  pendingRemoval?.reject(new Error(message));
  pendingRemoval = null;
}

function removeImageBackground(blob) {
  if (!backgroundWorker) {
    backgroundWorker = new Worker("background-worker.js", { type: "module" });
    backgroundWorker.onerror = () => stopBackgroundWorker("The background remover could not start. Try a current Chrome, Edge, or Firefox browser.");
    backgroundWorker.onmessage = ({ data }) => {
      if (!pendingRemoval || pendingRemoval.id !== data.id) return;
      if (data.kind === "progress") {
        const percent = data.total ? Math.round(data.current / data.total * 100) : 0;
        outputSummary.textContent = data.key.startsWith("fetch:")
          ? `Downloading background-removal resources: ${percent}% of current file. First use can take a few minutes.`
          : "Removing background on your device…";
      } else {
        const pending = pendingRemoval;
        pendingRemoval = null;
        if (data.kind === "result") pending.resolve(data.blob);
        else {
          pending.reject(new Error(`Background removal failed: ${data.message}. Check your connection for the model download and try again.`));
          stopBackgroundWorker();
        }
      }
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++removalId;
    const timeout = setTimeout(() => stopBackgroundWorker("Background removal timed out. Try again with a smaller image or a faster connection."), 300000);
    pendingRemoval = {
      id,
      resolve: (result) => { clearTimeout(timeout); resolve(result); },
      reject: (error) => { clearTimeout(timeout); reject(error); },
    };
    backgroundWorker.postMessage({ id, blob });
  });
}

function syncImageControls() {
  [imageInput, clearImages, convertImages, resizeMode, maxSizeInput, qualityRange, flipY, removeBackground, cutoutStyle].forEach((control) => { control.disabled = imageBusy; });
  detailRecovery.disabled = imageBusy || cutoutStyle.value === "soft";
  document.querySelector("#cutoutSettings").hidden = !removeBackground.checked;
  document.querySelector("#cutoutHelp").hidden = !removeBackground.checked;
  formatSelect.disabled = imageBusy || removeBackground.checked;
  preserveAlpha.disabled = imageBusy || removeBackground.checked;
  downloadZip.disabled = imageBusy || !convertedAssets.length;
  imageDrop.classList.toggle("is-disabled", imageBusy);
  cancelImages.hidden = !imageBusy;
  convertImages.textContent = imageBusy ? "Processing…" : removeBackground.checked ? "Remove backgrounds" : "Convert images";
}

function renderConvertedAssets() {
  previewBoard.innerHTML = "";
  convertedAssets.forEach((asset) => {
    const card = document.createElement("article");
    card.className = "asset-card";

    const image = document.createElement("img");
    image.src = asset.url;
    image.alt = `${asset.filename} preview`;

    const title = document.createElement("strong");
    title.textContent = asset.filename;

    const meta = document.createElement("small");
    meta.textContent = `${asset.width} × ${asset.height} · ${formatBytes(asset.blob.size)}`;

    const link = document.createElement("a");
    link.href = asset.url;
    link.download = asset.filename;
    link.textContent = "Download";

    card.append(image, title, meta, link);
    if (asset.originalBlob) {
      const refine = document.createElement("button");
      refine.type = "button"; refine.className = "secondary"; refine.textContent = "Refine cutout";
      refine.disabled = imageBusy;
      refine.addEventListener("click", async () => {
        refine.disabled = true;
        try {
          await window.CutoutTools.editCutout(asset, blob => {
            URL.revokeObjectURL(asset.url);
            asset.blob = blob; asset.url = URL.createObjectURL(blob);
            renderConvertedAssets();
          });
        } catch (error) { outputSummary.textContent = `Could not open cutout editor: ${error.message}`; }
        finally { refine.disabled = false; }
      });
      card.append(refine);
    }
    previewBoard.append(card);
  });

  outputSummary.textContent = `${convertedAssets.length} converted asset${convertedAssets.length === 1 ? "" : "s"} ready.`;
  downloadZip.disabled = convertedAssets.length === 0;
}

async function handleImageConvert() {
  if (imageBusy) return;
  if (!imageFiles.length) {
    setEmptyPreview("Add at least one image first.");
    return;
  }

  imageBusy = true;
  const run = ++imageRun;
  syncImageControls();
  convertedAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  convertedAssets = [];

  previewBoard.replaceChildren();
  const failures = [];
  const usedNames = new Set();
  for (const [index, file] of imageFiles.entries()) {
    if (run !== imageRun) break;
    outputSummary.textContent = `Processing ${index + 1} of ${imageFiles.length}: ${file.name}`;
    try {
      const asset = await convertFile(file);
      if (run !== imageRun) { URL.revokeObjectURL(asset.url); break; }
      const original = asset.filename;
      let suffix = 2;
      while (usedNames.has(asset.filename.toLowerCase())) {
        asset.filename = original.replace(/(\.[^.]+)$/, `-${suffix++}$1`);
      }
      usedNames.add(asset.filename.toLowerCase());
      convertedAssets.push(asset);
      renderConvertedAssets();
      downloadZip.disabled = true;
    } catch (error) {
      if (run === imageRun) failures.push(`${file.name}: ${error.message}`);
    }
  }
  const cancelled = run !== imageRun;
  imageBusy = false;
  if (convertedAssets.length) renderConvertedAssets();
  else setEmptyPreview(cancelled ? "Conversion cancelled." : "No images could be converted.");
  if (failures.length || cancelled) {
    outputSummary.textContent = `${convertedAssets.length} ready. ${cancelled ? "Cancelled. " : ""}${failures.join(" ")}`;
  }
  syncImageControls();
}

async function downloadAllAsZip() {
  downloadZip.disabled = true;
  try {
  const zip = new JSZip();
  convertedAssets.forEach((asset) => zip.file(asset.filename, asset.blob));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "converted-assets.zip";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    outputSummary.textContent = `Could not create ZIP: ${error.message}`;
  } finally {
    syncImageControls();
  }
}

function handleImageFiles(files) {
  if (imageBusy) return;
  const images = files.filter((file) => file.type.startsWith("image/"));
  imageFiles = [...imageFiles, ...images];
  renderImageList();
}

function handleDocFile(files) {
  const [file] = files.filter((item) => item.name.toLowerCase().endsWith(".docx"));
  docFile = file || null;
  docRevision++;
  docReady = false;
  clearGeneratedPdf();
  convertDoc.disabled = !docFile;
  convertDoc.textContent = "Create PDF preview";
  printDoc.disabled = true;
  resetDocFrame();
  docPreview.classList.remove("is-visible");
  docStatus.textContent = docFile ? `${docFile.name} is ready to convert.` : "Please choose a DOCX file.";
}

function clearGeneratedPdf() {
  if (generatedPdf) URL.revokeObjectURL(generatedPdf.url);
  generatedPdf = null;
  downloadPdf.disabled = true;
  openPdf.removeAttribute("href");
  pdfOutput.hidden = true;
  // Release preview pixel buffers when changing or clearing documents.
  pdfPages.querySelectorAll("canvas").forEach((canvas) => { canvas.width = canvas.height = 0; });
  pdfPages.replaceChildren();
  pdfPreviewStatus.textContent = "";
}

async function preparePdfDownload(sections, filename, revision) {
  const isCurrent = () => revision === docRevision;
  if (!window.PdfTools) throw new Error("The PDF tools did not load. Reload the page and try again.");
  const adjustments = [];
  const blob = await window.PdfTools.createDocumentPdf(sections, {
    title: filename.replace(/\.pdf$/i, ""), isCurrent,
    onWarning: (message) => adjustments.push(message),
    onProgress: (page, total) => {
      if (isCurrent()) docStatus.textContent = `Creating PDF page ${page} of ${total}…`;
    },
  });
  if (!isCurrent()) return;
  generatedPdf = { blob, url: URL.createObjectURL(blob), filename };
  openPdf.href = generatedPdf.url;
  downloadPdf.disabled = false;
  pdfOutput.hidden = false;
  pdfPreviewStatus.textContent = "Loading the generated PDF preview…";
  docStatus.textContent = `${sections.length} PDF page${sections.length === 1 ? "" : "s"} ready • ${formatBytes(blob.size)}. Download PDF saves this file directly. ${adjustments.join(" ")}`;
  try {
    await window.PdfTools.renderPdfPreview(blob, pdfPages, isCurrent);
    if (isCurrent()) pdfPreviewStatus.textContent = "This preview shows the same PDF that Download PDF saves.";
  } catch (error) {
    if (isCurrent()) {
      pdfPreviewStatus.textContent = `The PDF is ready, but the inline preview could not load: ${error.message}. Use Open PDF in new tab or Download PDF.`;
    }
  }
}

function resetDocFrame() {
  const frameDocument = docPreview.contentDocument;
  frameDocument.open();
  // The document has its own CSS context: the app's dark theme, typography and
  // global resets must never alter a resume. Remote resources/scripts are blocked.
  frameDocument.write(`<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; frame-src 'self' about:;">
    <title>Document</title></head><body><div id="documentStyles"></div><div id="pages"></div></body></html>`);
  frameDocument.close();
  return frameDocument;
}

async function convertDocxToHtml() {
  if (!docFile) return;
  const file = docFile;
  const revision = ++docRevision;
  docReady = false;
  clearGeneratedPdf();
  convertDoc.disabled = true;
  printDoc.disabled = true;
  convertDoc.textContent = "Reading DOCX...";
  docStatus.textContent = "Rendering document pages, fonts, tables, and images…";

  try {
    if (!window.docx) throw new Error("The DOCX renderer did not load. Reload the page and try again.");
    const arrayBuffer = await file.arrayBuffer();
    if (revision !== docRevision) return;
    const frameDocument = resetDocFrame();
    frameDocument.title = fileBaseName(file.name) || "document";
    const pages = frameDocument.querySelector("#pages");
    docPreview.classList.add("is-visible");
    await docx.renderAsync(arrayBuffer, pages, frameDocument.querySelector("#documentStyles"), {
      inWrapper: true,
      hideWrapperOnPrint: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderAltChunks: false,
      useBase64URL: true,
      afterRender: (container) => window.PdfTools.prepareDocumentLayout(container),
    });
    if (revision !== docRevision) return;
    const sections = [...pages.querySelectorAll("section.docx")];
    if (!sections.length) throw new Error("No document pages were found.");
    const pageRules = sections.map((section, index) => {
      const width = section.style.width;
      const height = section.style.minHeight;
      // Use each section's actual paper size, including A4 and landscape pages.
      const validLength = (value) => /^\d+(\.\d+)?(pt|px|in|mm|cm)$/.test(value);
      if (!validLength(width) || !validLength(height)) return "";
      section.style.page = `docxPage${index}`;
      return `@page docxPage${index} { size: ${width} ${height}; margin: 0; }`;
    }).join("\n");
    const style = frameDocument.createElement("style");
    style.textContent = `
      html { color-scheme: light; }
      body { margin: 0; background: #e4e7ec; }
      .docx-wrapper { padding: 20px; }
      .docx-wrapper > section.docx { flex-shrink: 0; }
      @page { margin: 0; }
      ${pageRules}
      @media print {
        html, body { margin: 0; padding: 0; background: white; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .docx-wrapper { display: block !important; padding: 0 !important; background: none !important; }
        .docx-wrapper > section.docx {
          margin: 0 !important; box-shadow: none !important;
          break-after: page; page-break-after: always;
        }
        .docx-wrapper > section.docx:last-child { break-after: auto; page-break-after: auto; }
      }`;
    frameDocument.head.append(style);
    await frameDocument.fonts.ready;
    await Promise.all([...pages.querySelectorAll("img")].map((image) => image.decode()));
    if (revision !== docRevision) return;
    docReady = true;
    printDoc.disabled = false;
    await preparePdfDownload(sections, `${fileBaseName(file.name) || "document"}.pdf`, revision);
  } catch (error) {
    if (revision !== docRevision) return;
    if (!docReady) {
      printDoc.disabled = true;
      docPreview.classList.remove("is-visible");
    }
    docStatus.textContent = `Could not convert that DOCX: ${error.message}`;
  } finally {
    if (revision === docRevision) {
      convertDoc.disabled = !docFile;
      convertDoc.textContent = "Create PDF preview";
    }
  }
}

bindDropZone(imageDrop, imageInput, handleImageFiles);
bindDropZone(docDrop, docInput, handleDocFile);

convertImages.addEventListener("click", handleImageConvert);
removeBackground.addEventListener("change", syncImageControls);
cancelImages.addEventListener("click", () => {
  imageRun++;
  stopBackgroundWorker();
  outputSummary.textContent = "Cancelling…";
});
downloadZip.addEventListener("click", downloadAllAsZip);
clearImages.addEventListener("click", () => {
  if (imageBusy) return;
  imageFiles = [];
  convertedAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  convertedAssets = [];
  imageInput.value = "";
  renderImageList();
  setEmptyPreview();
});

convertDoc.addEventListener("click", convertDocxToHtml);
cutoutStyle.addEventListener("change", syncImageControls);
downloadPdf.addEventListener("click", () => {
  if (!generatedPdf) return;
  const link = document.createElement("a");
  link.href = generatedPdf.url;
  link.download = generatedPdf.filename;
  document.body.append(link);
  link.click();
  link.remove();
});
printDoc.addEventListener("click", () => {
  if (!docReady) return;
  try {
    docPreview.contentWindow.focus();
    docPreview.contentWindow.print();
  } catch (error) {
    docStatus.textContent = `Could not open the print dialog: ${error.message}`;
  }
});
clearDoc.addEventListener("click", () => {
  docInput.value = "";
  handleDocFile([]);
  docStatus.textContent = "Waiting for a DOCX file.";
});

renderImageList();
setEmptyPreview();
syncImageControls();
