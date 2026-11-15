// photo-reader.js
// Reads the text out of a photo (or a scanned page) in the browser.
// The photo is cleaned up, then handed to the Tesseract text-recognition
// engine, which is only downloaded the first time a photo is opened.
// Nothing leaves the device.

import { prepareForReading, readingScale } from './image-prep.js';
import { tsvToItems } from './ocr-items.js';

const ENGINE = new URL('../vendor/tesseract/', import.meta.url).href;
const MAX_BYTES = 40 * 1024 * 1024;

export class PhotoReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let enginePromise = null;
function loadEngine() {
  if (!enginePromise) {
    enginePromise = import('../vendor/tesseract/tesseract.esm.min.js').then((m) => m.default || m);
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

// Opens an image file as something that can be drawn on a canvas,
// turned the right way up.
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new PhotoReadError('not-image', 'That picture could not be opened. Use a JPG or PNG, or take a screenshot of it.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// Draws a picture at reading size and cleans it up. Returns a canvas.
export function prepareCanvas(source, sourceWidth, sourceHeight) {
  if (!sourceWidth || !sourceHeight) throw new PhotoReadError('not-image', 'That picture is empty.');
  const scale = readingScale(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  image.data.set(prepareForReading(image.data, width, height));
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// recognise(canvases, onProgress) -> items for the shift finder.
// Each canvas is one page.
export async function recognise(canvases, onProgress = () => {}) {
  let engine;
  try {
    engine = await loadEngine();
  } catch {
    throw new PhotoReadError('reader-missing', 'The photo reader could not be loaded. Check your connection and try again.');
  }
  let worker;
  let page = 0;
  try {
    worker = await engine.createWorker('eng', 1, {
      workerPath: `${ENGINE}worker.min.js`,
      corePath: ENGINE,
      langPath: ENGINE,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => {
        if (m && m.status === 'recognizing text') {
          onProgress((page + (m.progress || 0)) / canvases.length);
        }
      },
    });
    // Sparse text: find words wherever they are, which suits tables.
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const items = [];
    for (page = 0; page < canvases.length; page++) {
      const { data } = await worker.recognize(canvases[page], {}, { tsv: true, text: false, blocks: false, hocr: false });
      items.push(...tsvToItems(data.tsv, { page: page + 1 }));
    }
    onProgress(1);
    return items;
  } catch (err) {
    if (err instanceof PhotoReadError) throw err;
    throw new PhotoReadError('reader-failed', 'The photo reader stopped before it finished. Try again, or try a smaller picture.');
  } finally {
    if (worker) { try { await worker.terminate(); } catch { /* already gone */ } }
  }
}

// readPhoto(file, onProgress) -> { items }
export async function readPhoto(file, onProgress) {
  if (!file || !file.size) throw new PhotoReadError('empty-file', 'That file is empty.');
  if (file.size > MAX_BYTES) throw new PhotoReadError('too-big', 'That picture is larger than 40 MB.');
  const picture = await decode(file);
  const width = picture.width || picture.naturalWidth;
  const height = picture.height || picture.naturalHeight;
  const canvas = prepareCanvas(picture, width, height);
  if (picture.close) picture.close();
  const items = await recognise([canvas], onProgress);
  canvas.width = 0; // free the memory
  return { items };
}
