// pdf-reader.js
// Opens a PDF in the browser with pdf.js and returns its text items.
// A scanned PDF (pictures of pages, no text) is passed on to the photo reader.
// pdf.js is only downloaded the first time a PDF is opened.

import { readDocumentItems } from './pdf-items.js';

const MAX_BYTES = 25 * 1024 * 1024;
let pdfjsPromise = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

export class PdfReadError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// How many pages of a scanned PDF are read. Reading a page as a picture
// is slow, and a schedule is rarely longer than this.
const MAX_SCANNED_PAGES = 4;

// readPdf(arrayBuffer, options) -> { items, scanned }
//   options.onScanned()        called when the PDF turns out to be a scan
//   options.onProgress(0..1)   progress while a scan is being read
// A normal PDF gives its text straight away. A scanned PDF has no text,
// so its pages are drawn as pictures and read like photos.
export async function readPdf(buffer, options = {}) {
  if (!buffer || !buffer.byteLength) throw new PdfReadError('empty-file', 'That file is empty.');
  if (buffer.byteLength > MAX_BYTES) throw new PdfReadError('too-big', 'That file is larger than 25 MB.');
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer.slice(0, 1024)));
  if (!head.includes('%PDF-')) throw new PdfReadError('not-pdf', 'That file is not a PDF.');

  let pdfjs;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new PdfReadError('reader-missing', 'The PDF reader could not be loaded. Check your connection and try again.');
  }
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    verbosity: 0,
    wasmUrl: new URL('../vendor/pdfjs/wasm/', import.meta.url).href,
  });
  try {
    const doc = await task.promise;
    const items = await readDocumentItems(doc);
    if (items.length || options.scans === false) return { items, scanned: false };

    // No text at all: draw the pages and read them as pictures.
    if (options.onScanned) options.onScanned();
    const { prepareCanvas, recognise } = await import('./photo-reader.js');
    const canvases = [];
    const pages = Math.min(doc.numPages, MAX_SCANNED_PAGES);
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, 2600 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      canvases.push(prepareCanvas(canvas, canvas.width, canvas.height));
      canvas.width = 0;
    }
    const read = await recognise(canvases, options.onProgress);
    return { items: read, scanned: true };
  } catch (err) {
    if (err && err.code) throw err; // already explained
    const name = err && err.name;
    if (name === 'PasswordException') {
      throw new PdfReadError('password', 'This PDF is locked with a password. Save an unlocked copy and try again.');
    }
    if (name === 'InvalidPDFException') {
      throw new PdfReadError('damaged', 'This PDF is damaged and cannot be opened.');
    }
    throw new PdfReadError('unknown', 'This PDF could not be read.');
  } finally {
    try { await task.destroy(); } catch { /* already closed */ }
  }
}
