// Tests for the photo clean-up: black-and-white decision, removing table
// lines, straightening a tilted picture.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  despeckle, estimateSkew, findLines, prepareForReading, readingScale,
  removeLines, rotateGray, threshold, toGray,
} from '../js/image-prep.js';

// A grey page with helpers to draw on it.
function page(width, height, paper = 230) {
  const gray = new Uint8Array(width * height).fill(paper);
  return {
    gray, width, height,
    rect(x0, y0, w, h, v = 20) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) gray[y * width + x] = v;
      }
      return this;
    },
    // a line from (x0,y0) to (x1,y1), `t` pixels thick
    line(x0, y0, x1, y1, t = 2, v = 20) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / steps);
        const y = Math.round(y0 + ((y1 - y0) * s) / steps);
        this.rect(x, y, t, t, v);
      }
      return this;
    },
    rgba() {
      const out = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < gray.length; i++) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = gray[i]; out[i * 4 + 3] = 255; }
      return out;
    },
  };
}
const count = (arr) => arr.reduce((n, v) => n + (v ? 1 : 0), 0);
const inkAt = (ink, width, x, y) => ink[y * width + x];

test('colour is turned into grey', () => {
  const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1);
  assert.equal(g[0], 255);
  assert.equal(g[1], 0);
  assert.ok(g[2] > 60 && g[2] < 90);
});

test('ink is found on plain paper', () => {
  const p = page(200, 120).rect(40, 40, 30, 12);
  const ink = threshold(p.gray, 200, 120);
  assert.equal(inkAt(ink, 200, 50, 45), 1);
  assert.equal(inkAt(ink, 200, 120, 45), 0);
  assert.equal(count(ink), 30 * 12);
});

test('ink is still found when half the page is in shadow', () => {
  const p = page(300, 120);
  for (let y = 0; y < 120; y++) for (let x = 150; x < 300; x++) p.gray[y * 300 + x] = 120; // shadow
  p.rect(40, 50, 20, 10, 20).rect(220, 50, 20, 10, 10);
  const ink = threshold(p.gray, 300, 120);
  assert.equal(inkAt(ink, 300, 50, 55), 1, 'letter in the light');
  assert.equal(inkAt(ink, 300, 230, 55), 1, 'letter in the shadow');
  assert.equal(inkAt(ink, 300, 200, 20), 0, 'shadowed paper is still paper');
});

test('single specks are removed, strokes are kept', () => {
  const p = page(100, 60).rect(20, 20, 1, 1).rect(50, 20, 12, 3);
  const ink = despeckle(threshold(p.gray, 100, 60), 100, 60);
  assert.equal(inkAt(ink, 100, 20, 20), 0);
  assert.equal(inkAt(ink, 100, 55, 21), 1);
});

test('long ruled lines are found, letters are not', () => {
  const W = 1200;
  const H = 800;
  const p = page(W, H)
    .rect(40, 300, 1100, 3) // a horizontal rule
    .rect(600, 60, 3, 680) // a vertical rule
    .rect(120, 200, 16, 30) // letter-sized blobs
    .rect(142, 200, 16, 30)
    .rect(800, 500, 16, 30);
  const ink = threshold(p.gray, W, H);
  const lines = findLines(ink, W, H);
  assert.equal(inkAt(lines, W, 300, 301), 1, 'horizontal rule');
  assert.equal(inkAt(lines, W, 601, 500), 1, 'vertical rule');
  assert.equal(inkAt(lines, W, 128, 215), 0, 'a letter is not a line');
  assert.equal(inkAt(lines, W, 808, 515), 0);
  removeLines(ink, W, H);
  assert.equal(inkAt(ink, W, 300, 301), 0, 'the rule is gone');
  assert.equal(inkAt(ink, W, 128, 215), 1, 'the letter is still there');
});

test('a ruled line that slopes is still found', () => {
  const W = 1200;
  const H = 800;
  const p = page(W, H).line(40, 300, 1160, 360, 3).rect(120, 100, 16, 30);
  const ink = threshold(p.gray, W, H);
  const lines = findLines(ink, W, H);
  assert.equal(inkAt(lines, W, 600, 331), 1);
  assert.equal(inkAt(lines, W, 128, 115), 0);
});

test('tall letters in a wide, short picture are not taken for lines', () => {
  const W = 2400;
  const H = 500;
  const p = page(W, H).rect(300, 200, 8, 48).rect(40, 400, 2300, 3); // an "l", and a rule
  const lines = findLines(threshold(p.gray, W, H), W, H);
  assert.equal(inkAt(lines, W, 303, 220), 0, 'the letter stays');
  assert.equal(inkAt(lines, W, 1000, 401), 1, 'the rule goes');
});

test('the tilt of a page is measured', () => {
  for (const degrees of [0, 2, -3, 5]) {
    const p = page(700, 500);
    const slope = Math.tan((degrees * Math.PI) / 180);
    for (let row = 0; row < 6; row++) {
      const y = 120 + row * 45;
      p.line(60, Math.round(y + 60 * slope), 640, Math.round(y + 640 * slope), 2);
    }
    const ink = threshold(p.gray, 700, 500);
    const found = estimateSkew(ink, 700, 500);
    assert.ok(Math.abs(found - degrees) <= 0.5, `expected about ${degrees}, got ${found}`);
  }
});

test('a tilted page is straightened', () => {
  const p = page(700, 500);
  const slope = Math.tan((3 * Math.PI) / 180);
  for (let row = 0; row < 6; row++) {
    const y = 120 + row * 45;
    p.line(60, Math.round(y + 60 * slope), 640, Math.round(y + 640 * slope), 3);
  }
  const before = estimateSkew(threshold(p.gray, 700, 500), 700, 500);
  const turned = rotateGray(p.gray, 700, 500, before);
  const after = estimateSkew(threshold(turned, 700, 500), 700, 500);
  assert.ok(Math.abs(before - 3) <= 0.5);
  assert.ok(Math.abs(after) <= 0.3, `still tilted by ${after}`);
  assert.equal(rotateGray(p.gray, 700, 500, 0), p.gray, 'no tilt means no change');
});

test('a blank or nearly blank page reports no tilt', () => {
  const p = page(300, 200);
  assert.equal(estimateSkew(threshold(p.gray, 300, 200), 300, 200), 0);
});

test('the full clean-up keeps letters, drops lines, and returns a picture of the same size', () => {
  const W = 1200;
  const H = 800;
  const p = page(W, H, 200)
    .rect(40, 300, 1100, 3)
    .rect(40, 420, 1100, 3)
    .rect(600, 300, 3, 123)
    .rect(120, 340, 18, 30, 30)
    .rect(800, 340, 18, 30, 30);
  const out = prepareForReading(p.rgba(), W, H);
  assert.equal(out.length, W * H * 4);
  const at = (x, y) => out[(y * W + x) * 4];
  assert.ok(at(128, 355) < 60, 'letter stays dark');
  assert.equal(at(300, 301), 255, 'rule is painted over');
  assert.equal(at(300, 600), 255, 'grey paper becomes white');
  assert.equal(out[3], 255, 'fully opaque');
});

test('pictures are scaled to a readable size', () => {
  assert.equal(readingScale(2600, 2000), 1);
  assert.equal(readingScale(5200, 3900), 0.5);
  assert.equal(readingScale(1300, 900), 2);
  assert.equal(readingScale(400, 300), 3, 'never enlarged more than three times');
  assert.equal(readingScale(2550, 2000), 1, 'close enough is left alone');
  assert.equal(readingScale(0, 0), 3);
});
