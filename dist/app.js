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

const docInput = document.querySelector("#docInput");
const docDrop = document.querySelector("#docDrop");
const convertDoc = document.querySelector("#convertDoc");
const printDoc = document.querySelector("#printDoc");
const clearDoc = document.querySelector("#clearDoc");
const docStatus = document.querySelector("#docStatus");
const docPreview = document.querySelector("#docPreview");

let imageFiles = [];
let convertedAssets = [];
let docFile = null;

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
    const max = Number(maxSizeInput.value) || 2048;
    const scale = Math.min(1, max / Math.max(width, height));
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
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
  previewBoard.innerHTML = `
    <div class="empty-state">
      <span aria-hidden="true">▧</span>
      <p>${message}</p>
    </div>
  `;
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
  const size = resolveSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = size.width;
  canvas.height = size.height;

  if (formatSelect.value === "image/jpeg" || !preserveAlpha.checked) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (flipY.checked) {
    context.translate(0, canvas.height);
    context.scale(1, -1);
  }

  context.drawImage(image, 0, 0, size.width, size.height);
  URL.revokeObjectURL(url);

  const type = formatSelect.value;
  const quality = Number(qualityRange.value) / 100;
  const blob = await canvasToBlob(canvas, type, quality);
  const extension = extensionByType[type];
  const filename = `${fileBaseName(file.name) || "asset"}-${size.width}x${size.height}.${extension}`;
  return {
    blob,
    filename,
    width: size.width,
    height: size.height,
    url: URL.createObjectURL(blob),
  };
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
    previewBoard.append(card);
  });

  outputSummary.textContent = `${convertedAssets.length} converted asset${convertedAssets.length === 1 ? "" : "s"} ready.`;
  downloadZip.disabled = convertedAssets.length === 0;
}

async function handleImageConvert() {
  if (!imageFiles.length) {
    setEmptyPreview("Add at least one image first.");
    return;
  }

  convertImages.disabled = true;
  convertImages.textContent = "Converting...";
  outputSummary.textContent = "Converting image files...";
  convertedAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  convertedAssets = [];

  try {
    convertedAssets = await Promise.all(imageFiles.map(convertFile));
    renderConvertedAssets();
  } catch (error) {
    setEmptyPreview(error.message);
  } finally {
    convertImages.disabled = false;
    convertImages.textContent = "Convert images";
  }
}

async function downloadAllAsZip() {
  const zip = new JSZip();
  convertedAssets.forEach((asset) => zip.file(asset.filename, asset.blob));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "converted-assets.zip";
  link.click();
  URL.revokeObjectURL(url);
}

function handleImageFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  imageFiles = [...imageFiles, ...images];
  renderImageList();
}

function handleDocFile(files) {
  const [file] = files.filter((item) => item.name.toLowerCase().endsWith(".docx"));
  docFile = file || null;
  convertDoc.disabled = !docFile;
  printDoc.disabled = true;
  docPreview.innerHTML = "";
  docPreview.classList.remove("is-visible");
  docStatus.textContent = docFile ? `${docFile.name} is ready to convert.` : "Please choose a DOCX file.";
}

async function convertDocxToHtml() {
  if (!docFile) return;

  convertDoc.disabled = true;
  convertDoc.textContent = "Reading DOCX...";
  docStatus.textContent = "Converting the DOCX into a PDF-ready preview...";

  try {
    const arrayBuffer = await docFile.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    docPreview.innerHTML = result.value || "<p>No readable document content was found.</p>";
    docPreview.classList.add("is-visible");
    printDoc.disabled = false;
    docStatus.textContent = result.messages.length
      ? "Preview created. Check the layout before downloading the PDF."
      : "Preview created and ready for PDF export.";

    await html2pdf()
      .set({
        margin: 0.45,
        filename: `${fileBaseName(docFile.name) || "document"}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      })
      .from(docPreview)
      .save();
  } catch (error) {
    docStatus.textContent = `Could not convert that DOCX: ${error.message}`;
  } finally {
    convertDoc.disabled = false;
    convertDoc.textContent = "Create PDF";
  }
}

bindDropZone(imageDrop, imageInput, handleImageFiles);
bindDropZone(docDrop, docInput, handleDocFile);

convertImages.addEventListener("click", handleImageConvert);
downloadZip.addEventListener("click", downloadAllAsZip);
clearImages.addEventListener("click", () => {
  imageFiles = [];
  convertedAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  convertedAssets = [];
  imageInput.value = "";
  renderImageList();
  setEmptyPreview();
});

convertDoc.addEventListener("click", convertDocxToHtml);
printDoc.addEventListener("click", () => window.print());
clearDoc.addEventListener("click", () => {
  docFile = null;
  docInput.value = "";
  convertDoc.disabled = true;
  printDoc.disabled = true;
  docPreview.innerHTML = "";
  docPreview.classList.remove("is-visible");
  docStatus.textContent = "Waiting for a DOCX file.";
});

renderImageList();
setEmptyPreview();
