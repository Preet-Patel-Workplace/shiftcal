// Test helpers: read a fixture PDF with the same pdf.js copy the app ships.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { readDocumentItems } from '../js/pdf-items.js';
import { parseSchedule } from '../js/parser.js';

const here = dirname(fileURLToPath(import.meta.url));
pdfjs.GlobalWorkerOptions.workerSrc = join(here, '..', 'vendor', 'pdfjs', 'pdf.worker.min.mjs');

export const TODAY = '2026-11-13';

export async function readPdf(path) {
  const data = new Uint8Array(readFileSync(path));
  const task = pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  const items = await readDocumentItems(doc);
  await task.destroy();
  return items;
}

export function fixture(name) {
  return readPdf(join(here, 'fixtures', name));
}

export async function parseFixture(name, options = {}) {
  const items = await fixture(name);
  return parseSchedule(items, { name: 'Avery Collins', today: TODAY, ...options });
}

// "2026-11-16 09:00-17:00" strings are easier to compare than objects.
export function brief(shifts) {
  return shifts.map((s) => `${s.date} ${s.start}-${s.end}${s.endsNextDay ? '+1' : ''}`);
}

// Builds parser items by hand: rows of [x, text] pairs, one row per line.
export function grid(rows, { lineHeight = 20, size = 10, page = 1 } = {}) {
  const items = [];
  rows.forEach((row, r) => {
    for (const [x, str] of row) {
      items.push({ str, x, y: 50 + r * lineHeight, w: str.length * size * 0.5, h: size, page });
    }
  });
  return items;
}
