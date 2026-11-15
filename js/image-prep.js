// image-prep.js
// Gets a photo ready for text recognition: turns it into clean black text
// on white, and rubs out the table's ruled lines, which otherwise get read
// as stray letters. Works on plain pixel arrays, so it runs in the browser
// and in the Node tests alike.

// rgba: Uint8ClampedArray of width*height*4  ->  Uint8Array of grey levels
export function toGray(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return gray;
}

// Black-or-white decision for each pixel, compared with its neighbourhood
// rather than the whole picture, so shadows and uneven light do not matter.
// Returns Uint8Array: 1 = ink, 0 = paper.
export function threshold(gray, width, height, options = {}) {
  const win = options.window || Math.max(15, Math.round(Math.min(width, height) / 28) | 1);
  const t = options.contrast ?? 0.16;
  const half = win >> 1;
  const W = width + 1;
  const integral = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * W + (x + 1)] = integral[y * W + (x + 1)] + rowSum;
    }
  }
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * W + (x1 + 1)] - integral[y0 * W + (x1 + 1)]
        - integral[(y1 + 1) * W + x0] + integral[y0 * W + x0];
      if (gray[y * width + x] * count < sum * (1 - t)) ink[y * width + x] = 1;
    }
  }
  return ink;
}

// Finds ink that belongs to a long, nearly straight horizontal stroke.
// A stroke may drift up or down one pixel per step, so lines in a tilted
// photo are still followed. Marks matching pixels in `mark`.
function markLongRuns(ink, width, height, minLength, mark) {
  const size = width * height;
  const fromLeft = new Uint16Array(size);
  const fromRight = new Uint16Array(size);
  const cap = 65535;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (!ink[i]) continue;
      let best = 0;
      if (x > 0) {
        best = fromLeft[i - 1];
        if (y > 0 && fromLeft[i - 1 - width] > best) best = fromLeft[i - 1 - width];
        if (y < height - 1 && fromLeft[i - 1 + width] > best) best = fromLeft[i - 1 + width];
      }
      fromLeft[i] = best < cap ? best + 1 : cap;
    }
  }
  for (let x = width - 1; x >= 0; x--) {
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (!ink[i]) continue;
      let best = 0;
      if (x < width - 1) {
        best = fromRight[i + 1];
        if (y > 0 && fromRight[i + 1 - width] > best) best = fromRight[i + 1 - width];
        if (y < height - 1 && fromRight[i + 1 + width] > best) best = fromRight[i + 1 + width];
      }
      fromRight[i] = best < cap ? best + 1 : cap;
    }
  }
  for (let i = 0; i < size; i++) {
    if (ink[i] && fromLeft[i] + fromRight[i] - 1 >= minLength) mark[i] = 1;
  }
}

function transpose(src, width, height) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[x * height + y] = src[y * width + x];
  return out;
}

// Finds the pixels of ruled lines, widened a little so the soft grey edge
// of each line is covered too. Returns Uint8Array, 1 = part of a line.
export function findLines(ink, width, height, options = {}) {
  const minH = options.minHorizontal || Math.round(width * 0.08);
  // measured against the longer side, so a wide, short crop of a table
  // does not have its tall letters mistaken for lines
  const minV = options.minVertical || Math.round(Math.max(width, height) * 0.04);
  const spread = options.spread ?? Math.max(2, Math.round(Math.max(width, height) / 900));
  const across = new Uint8Array(width * height);
  markLongRuns(ink, width, height, minH, across);
  const turned = transpose(ink, width, height);
  const markTurned = new Uint8Array(width * height);
  markLongRuns(turned, height, width, minV, markTurned);
  const down = transpose(markTurned, height, width);

  const mark = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (across[i]) {
        // a line running across is widened up and down
        const y0 = Math.max(0, y - spread);
        const y1 = Math.min(height - 1, y + spread);
        for (let yy = y0; yy <= y1; yy++) mark[yy * width + x] = 1;
      }
      if (down[i]) {
        // a line running down is widened left and right
        const x0 = Math.max(0, x - spread);
        const x1 = Math.min(width - 1, x + spread);
        for (let xx = x0; xx <= x1; xx++) mark[y * width + xx] = 1;
      }
    }
  }
  return mark;
}

// Removes ruled lines. `ink` is changed in place and returned.
export function removeLines(ink, width, height, options = {}) {
  const mark = findLines(ink, width, height, options);
  for (let i = 0; i < mark.length; i++) if (mark[i]) ink[i] = 0;
  return ink;
}

// Removes single specks of ink (camera noise).
export function despeckle(ink, width, height) {
  const out = new Uint8Array(ink);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!ink[i]) continue;
      const neighbours = ink[i - 1] + ink[i + 1] + ink[i - width] + ink[i + width]
        + ink[i - width - 1] + ink[i - width + 1] + ink[i + width - 1] + ink[i + width + 1];
      if (neighbours <= 1) out[i] = 0;
    }
  }
  return out;
}

// Works out how far the page is tilted, in degrees (positive = the right
// side sits lower). It tries a range of angles and keeps the one where the
// ink lines up best into rows: straight text and ruled lines give sharp
// peaks only at the true angle.
export function estimateSkew(ink, width, height, options = {}) {
  const maxAngle = options.maxAngle ?? 12;
  const step = Math.max(1, Math.round(width / 520));
  const xs = [];
  const ys = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (ink[y * width + x]) { xs.push(x / step); ys.push(y / step); }
    }
  }
  if (xs.length < 50) return 0;
  const rows = Math.ceil(height / step);
  const cols = Math.ceil(width / step);
  const offset = cols; // room for rows pushed above the top
  const hist = new Float64Array(rows + 2 * cols + 2);
  const score = (deg) => {
    hist.fill(0);
    const t = Math.tan((deg * Math.PI) / 180);
    for (let i = 0; i < xs.length; i++) hist[Math.round(ys[i] - xs[i] * t) + offset]++;
    let sum = 0;
    for (let i = 0; i < hist.length; i++) sum += hist[i] * hist[i];
    return sum;
  };
  let best = 0;
  let bestScore = score(0);
  for (let deg = -maxAngle; deg <= maxAngle; deg += 0.5) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  const coarse = best;
  for (let deg = coarse - 0.4; deg <= coarse + 0.4001; deg += 0.1) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  return Math.round(best * 10) / 10;
}

// Turns a grey image by `degrees` about its centre (same size, edges
// filled with white). Used to straighten a tilted photo.
export function rotateGray(gray, width, height, degrees) {
  if (!degrees) return gray;
  const out = new Uint8Array(width * height).fill(255);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const sx = cx + dx * cos - dy * sin;
      const sy = cy + dx * sin + dy * cos;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * width + x0;
      const top = gray[i] * (1 - fx) + gray[i + 1] * fx;
      const bottom = gray[i + width] * (1 - fx) + gray[i + width + 1] * fx;
      out[y * width + x] = (top * (1 - fy) + bottom * fy + 0.5) | 0;
    }
  }
  return out;
}

const TONE_BLACK = 40;
const TONE_WHITE = 232;

// The whole clean-up. Takes RGBA pixels, returns RGBA pixels of the same
// size: the photo straightened, in grey, lighting evened out, and ruled
// lines painted over.
// The soft edges of the letters are kept, which the reader does better with
// than with hard black and white.
export function prepareForReading(rgba, width, height) {
  let gray = toGray(rgba, width, height);
  let ink = despeckle(threshold(gray, width, height), width, height);
  // Straighten a tilted photo first, so rows of the table are level.
  const tilt = estimateSkew(ink, width, height);
  if (Math.abs(tilt) >= 0.3) {
    gray = rotateGray(gray, width, height, tilt);
    ink = despeckle(threshold(gray, width, height), width, height);
  }
  const lines = findLines(ink, width, height);

  // Paper brightness around each pixel: the brightest of a coarse grid of
  // block averages, so shadows and a darker corner are levelled out.
  const block = Math.max(16, Math.round(Math.min(width, height) / 40));
  const bw = Math.ceil(width / block);
  const bh = Math.ceil(height / block);
  const paper = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let n = 0;
      const y1 = Math.min(height, (by + 1) * block);
      const x1 = Math.min(width, (bx + 1) * block);
      for (let y = by * block; y < y1; y += 2) {
        for (let x = bx * block; x < x1; x += 2) {
          const i = y * width + x;
          if (ink[i]) continue; // paper only, not letters or lines
          sum += gray[i];
          n++;
        }
      }
      paper[by * bw + bx] = n ? sum / n : 0;
    }
  }
  // blocks with no paper in them borrow from their neighbours
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < paper.length; i++) {
      if (paper[i]) continue;
      const bx = i % bw;
      const by = (i - bx) / bw;
      let sum = 0;
      let n = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = bx + dx;
        const y = by + dy;
        if (x < 0 || y < 0 || x >= bw || y >= bh || !paper[y * bw + x]) continue;
        sum += paper[y * bw + x];
        n++;
      }
      if (n) paper[i] = sum / n;
    }
  }

  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const by = Math.min(bh - 1, (y / block) | 0);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      let v = 255;
      if (!lines[i]) { // a ruled line becomes paper
        const level = paper[by * bw + Math.min(bw - 1, (x / block) | 0)] || 255;
        // Even out the light, then stretch the tones so pale smudges and
        // the faint leftovers of lines go white while letters stay dark.
        const flat = (gray[i] / level) * 255;
        v = flat >= TONE_WHITE ? 255 : flat <= TONE_BLACK ? 0 : Math.round(((flat - TONE_BLACK) / (TONE_WHITE - TONE_BLACK)) * 255);
      }
      out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
    }
  }
  return out;
}

// How much to scale a picture before reading: small pictures are enlarged
// so the letters are big enough, huge ones are shrunk to keep it quick.
export function readingScale(width, height, target = 2600, maxUp = 3) {
  const longSide = Math.max(width, height) || 1;
  const scale = Math.min(maxUp, target / longSide);
  return Math.abs(scale - 1) < 0.05 ? 1 : scale;
}
