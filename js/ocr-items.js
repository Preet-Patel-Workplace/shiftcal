// ocr-items.js
// Turns the output of text recognition (OCR) on a photo into the same
// { str, x, y, w, h, page } items the PDF reader produces, so the shift
// finder in parser.js works on photos too.
// Pure functions: shared by the browser and the Node tests.

// Fixes the slips OCR makes most often inside times ("9:O0", "1O:30").
export function fixTimeText(text) {
  let t = String(text);
  // a semicolon or comma standing in for the colon of a time
  t = t.replace(/(\d)[;,](\d{2})(?!\d)/g, '$1:$2');
  // letters that look like digits, only inside something shaped like a time
  t = t.replace(/(?<![A-Za-z])([\dOoIlSsBZz]{1,2})([:.])([\dOoIlSsB]{2})(?![\dA-Za-z]*[c-oq-z])/g, (m, h, sep, min) => {
    if (!/\d/.test(h + min)) return m;
    const fix = (s) => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8').replace(/[Zz]/g, '2');
    return `${fix(h)}${sep}${fix(min)}`;
  });
  // a final 1 read as i, l or ! after another digit ("Nov 2i", "1l/16")
  t = t.replace(/(\d)[il!|](?![A-Za-z])/g, '$11');
  // am/pm read as AN, PN, FM and the like, right after a time
  t = t.replace(/(\d)(\s?)(AN|AH|AW)\b/g, '$1$2AM').replace(/(\d)(\s?)(PN|PH|FM|PW)\b/g, '$1$2PM');
  return t;
}

// Cleans one recognised word. Returns '' for table-border junk.
export function cleanWord(raw) {
  let t = String(raw ?? '').trim();
  if (!t) return '';
  // long dashes and look-alikes used between times
  t = t.replace(/[‐-―−]/g, '-');
  if (/^[-~=_]{1,3}$/.test(t)) return '-';
  // table borders show up as stray bars and brackets at the edges of words
  t = t.replace(/^[|\[\]{}_`'"‘’“”!]+/, '').replace(/[|\[\]{}_`'"‘’“”]+$/, '');
  if (!/[A-Za-z0-9]/.test(t)) return '';
  if (/^[O0][FE][FE]$/i.test(t)) return 'OFF';
  return fixTimeText(t);
}

// Reads the TSV table that the OCR engine returns.
// Columns: level page block par line word left top width height conf text
export function parseTsv(tsv) {
  const words = [];
  for (const line of String(tsv || '').split(/\r?\n/)) {
    const c = line.split('\t');
    if (c.length < 12 || c[0] !== '5') continue;
    const text = c.slice(11).join('\t');
    const left = Number(c[6]);
    const top = Number(c[7]);
    const width = Number(c[8]);
    const height = Number(c[9]);
    const conf = Number(c[10]);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
    words.push({ text, left, top, width, height, conf: Number.isFinite(conf) ? conf : 0 });
  }
  return words;
}

function median(values) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// wordsToItems(words, options)
//   words: [{ text, left, top, width, height, conf }] in image pixels
//   options.page     page number to stamp on the items (default 1)
//   options.minConf  words the engine is less sure of than this are dropped
//
// Words are gathered into visual rows by following each row from left to
// right, so a photo that is slightly tilted or bowed still gives straight
// rows. Every word in a row then gets the same y, which is what the shift
// finder needs.
export function wordsToItems(words, options = {}) {
  const page = options.page || 1;
  const minConf = options.minConf ?? 15;
  const clean = [];
  for (const w of words || []) {
    if (!w || w.conf < minConf) continue;
    const str = cleanWord(w.text);
    if (!str) continue;
    clean.push({ str, x: w.left, x1: w.left + w.width, cy: w.top + w.height / 2, hh: w.height, conf: w.conf });
  }
  if (!clean.length) return [];

  // A dash or a lone lower-case letter is much shorter than the text
  // around it, so heights are taken from the taller words.
  const tall = clean.filter((w) => /[A-Z0-9]/.test(w.str)).map((w) => w.hh);
  const size = median(tall.length ? tall : clean.map((w) => w.hh)) || 10;

  // Follow each row from left to right. A row remembers which way it is
  // heading (a photo taken at an angle makes rows slope, and not all by the
  // same amount), so the next word is looked for where the row is going,
  // not simply at the same height.
  clean.sort((a, b) => a.x - b.x || a.cy - b.cy);
  const rows = [];
  const slopes = [];
  for (const w of clean) {
    const reach = 0.55 * Math.max(Math.min(w.hh, size * 2), size * 0.6);
    const typical = slopes.length >= 3 ? median(slopes.slice(-40)) : 0;
    let best = null;
    for (const row of rows) {
      // where the row is heading, or simply level with its last word:
      // whichever fits better
      const slope = row.slope ?? typical;
      const heading = row.anchorCy + slope * (w.x - row.anchorX);
      const d = Math.min(Math.abs(heading - w.cy), Math.abs(row.lastCy - w.cy));
      if (d <= reach && (!best || d < best.d)) best = { row, d };
    }
    if (best) {
      const row = best.row;
      // The direction is measured over a long stretch of the row, never
      // between two neighbouring words, where letter shapes would fool it.
      const dx = w.x - row.anchorX;
      if (dx > size * 12) {
        const seen = Math.max(-0.06, Math.min(0.06, (w.cy - row.anchorCy) / dx));
        row.slope = row.slope == null ? seen : row.slope * 0.5 + seen * 0.5;
        slopes.push(row.slope);
      }
      row.words.push(w);
      row.lastCy = w.cy;
      row.lastX = w.x;
    } else {
      rows.push({ words: [w], lastCy: w.cy, lastX: w.x, anchorCy: w.cy, anchorX: w.x, slope: null });
    }
  }

  // Order rows by where they start (their left end), which stays correct
  // even when rows slope.
  const startY = (row) => row.words[0].cy;
  const items = [];
  rows.sort((a, b) => startY(a) - startY(b));
  let y = 0;
  let prevStart = null;
  for (const row of rows) {
    const tallInRow = row.words.filter((w) => /[A-Z0-9]/.test(w.str)).map((w) => w.hh);
    const h = median(tallInRow.length ? tallInRow : row.words.map((w) => w.hh)) || size;
    // Rows keep their real spacing, measured where they start.
    const start = startY(row);
    y = prevStart == null ? start : y + Math.max(start - prevStart, 0.01);
    prevStart = start;
    for (const w of row.words) {
      items.push({ str: w.str, x: w.x, y: y + h / 2, w: Math.max(w.x1 - w.x, 0.01), h, page, conf: w.conf });
    }
  }
  return items;
}

export function tsvToItems(tsv, options = {}) {
  return wordsToItems(parseTsv(tsv), options);
}
