// Tests for reading photos: cleaning recognised words, building rows from
// them, and finding shifts in text recorded from real recognition runs.
// The .tsv files in fixtures/ocr are what the recognition engine returned
// for made-up schedule photos (clean, tilted, small and poor ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cleanWord, fixTimeText, parseTsv, tsvToItems, wordsToItems } from '../js/ocr-items.js';
import { parseSchedule } from '../js/parser.js';
import { brief, TODAY } from './helpers.js';

const recorded = (name) => readFileSync(new URL(`./fixtures/ocr/${name}.tsv`, import.meta.url), 'utf8');
const read = (name, who = 'Avery Collins') => parseSchedule(tsvToItems(recorded(name)), {
  name: who, today: TODAY, fuzzyNames: true, cellGap: 0.85,
});

test('common misreadings inside times are fixed', () => {
  assert.equal(fixTimeText('9:O0'), '9:00');
  assert.equal(fixTimeText('1O:30'), '10:30');
  assert.equal(fixTimeText('S:00'), '5:00');
  assert.equal(fixTimeText('l2:00'), '12:00');
  assert.equal(fixTimeText('9;00'), '9:00');
  assert.equal(fixTimeText('9:00 AN'), '9:00 AM');
  assert.equal(fixTimeText('5:00PN'), '5:00PM');
  assert.equal(fixTimeText('Nov 2i'), 'Nov 21');
  assert.equal(fixTimeText('SatNov2!'), 'SatNov21');
});

test('ordinary words are left alone', () => {
  for (const w of ['Collins', 'Sam', 'Okafor', 'OFF', 'Teller', 'Bob', 'Isla', 'Sol', '9:00', '12:30pm', 'Monday']) {
    assert.equal(fixTimeText(w), w, w);
  }
});

test('table-border junk is dropped and dashes are normalised', () => {
  assert.equal(cleanWord('|'), '');
  assert.equal(cleanWord('___'), '-');
  assert.equal(cleanWord('—'), '-');
  assert.equal(cleanWord('~'), '-');
  assert.equal(cleanWord('|OFF|'), 'OFF');
  assert.equal(cleanWord('[Avery'), 'Avery');
  assert.equal(cleanWord('0FF'), 'OFF');
  assert.equal(cleanWord('OFE'), 'OFF');
  assert.equal(cleanWord('  '), '');
  assert.equal(cleanWord(null), '');
  assert.equal(cleanWord('...'), '');
});

test('the engine output is parsed, and broken lines are skipped', () => {
  const tsv = [
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
    '1\t1\t0\t0\t0\t0\t0\t0\t800\t600\t-1\t',
    '5\t1\t1\t1\t1\t1\t10\t20\t60\t18\t96.5\tAvery',
    '5\t1\t1\t1\t1\t2\t80\t20\t70\t18\t95\tCollins',
    '5\t1\t1\t1\t1\t3\tx\t20\t70\t18\t95\tbroken',
    '5\t1\t1\t1\t1\t4\t10\t20\t0\t18\t95\tzero-width',
    'not a row at all',
    '',
  ].join('\n');
  const words = parseTsv(tsv);
  assert.deepEqual(words.map((w) => w.text), ['Avery', 'Collins']);
  assert.equal(words[0].conf, 96.5);
  assert.deepEqual(parseTsv(''), []);
  assert.deepEqual(parseTsv(null), []);
});

const word = (text, left, top, conf = 90, width = text.length * 10, height = 18) => ({ text, left, top, width, height, conf });

test('words on one line share a row, even with small height differences', () => {
  const items = wordsToItems([
    word('Avery', 10, 100), word('Collins', 70, 102), word('9:00', 300, 99), word('-', 350, 106, 90, 8, 4), word('5:00', 370, 101),
    word('Jordan', 10, 140), word('OFF', 300, 141),
  ]);
  const ys = [...new Set(items.map((i) => i.y))];
  assert.equal(ys.length, 2);
  assert.deepEqual(items.filter((i) => i.y === ys[0]).map((i) => i.str), ['Avery', 'Collins', '9:00', '-', '5:00']);
});

test('rows that slope (a photo taken at an angle) stay separate', () => {
  // two rows 40 px apart, both dropping 60 px across the page
  const words = [];
  for (let c = 0; c < 8; c++) {
    const x = 20 + c * 150;
    const drop = (x / 1070) * 60;
    words.push(word(`a${c}`, x, 100 + drop), word(`b${c}`, x, 140 + drop));
  }
  const items = wordsToItems(words);
  const rowOf = (s) => items.find((i) => i.str === s).y;
  for (let c = 1; c < 8; c++) {
    assert.equal(rowOf(`a${c}`), rowOf('a0'), `a${c}`);
    assert.equal(rowOf(`b${c}`), rowOf('b0'), `b${c}`);
  }
  assert.ok(rowOf('a0') < rowOf('b0'));
});

test('words the engine is unsure of are dropped', () => {
  const items = wordsToItems([word('Avery', 10, 100, 92), word('xq', 200, 100, 4), word('OFF', 300, 100, 80)]);
  assert.deepEqual(items.map((i) => i.str), ['Avery', 'OFF']);
  assert.deepEqual(wordsToItems([]), []);
  assert.deepEqual(wordsToItems(null), []);
});

const basic = ['2026-11-16 09:00-17:00', '2026-11-17 09:00-17:00', '2026-11-19 12:00-20:00', '2026-11-20 09:00-17:00'];

test('recorded screenshot of a grid schedule', () => {
  const r = read('grid_basic_screenshot');
  assert.equal(r.status, 'ok');
  assert.deepEqual(brief(r.shifts), basic);
});

test('recorded phone photo of the same schedule', () => {
  assert.deepEqual(brief(read('grid_basic_photo').shifts), basic);
});

test('recorded tilted photo of the same schedule', () => {
  assert.deepEqual(brief(read('grid_basic_tilted_photo').shifts), basic);
});

test('each person still gets their own row from a photo', () => {
  assert.deepEqual(brief(read('grid_basic_photo', 'Jordan Mehta').shifts), [
    '2026-11-15 10:00-16:00', '2026-11-17 12:00-20:00', '2026-11-18 12:00-20:00', '2026-11-21 09:00-15:00',
  ]);
  assert.deepEqual(brief(read('grid_basic_tilted_photo', 'Sam Okafor').shifts), [
    '2026-11-16 08:30-16:30', '2026-11-18 08:30-16:30', '2026-11-19 08:30-16:30', '2026-11-20 13:00-21:00',
  ]);
});

test('recorded small screenshot with dates in the header and no am/pm', () => {
  assert.deepEqual(brief(read('grid_dates_small_screenshot').shifts), [
    '2026-11-16 09:00-17:00', '2026-11-18 12:00-20:00', '2026-11-19 10:30-18:30', '2026-11-21 07:00-15:00',
  ]);
});

test('recorded photo of a two-week schedule with two-line cells', () => {
  const r = read('grid_two_weeks_photo');
  assert.deepEqual(brief(r.shifts).slice(0, 4), [
    '2026-11-16 09:00-17:00', '2026-11-18 09:00-13:00', '2026-11-18 14:00-18:00', '2026-11-20 22:00-06:00+1',
  ]);
});

test('recorded photos of list-style schedules', () => {
  assert.deepEqual(brief(read('list_by_day_photo').shifts), ['2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00']);
  assert.deepEqual(brief(read('list_by_person_tilted_photo').shifts), [
    '2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00', '2026-11-21 10:00-16:00',
  ]);
  assert.deepEqual(brief(read('rows_per_shift_poor_photo').shifts), [
    '2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00', '2026-11-21 10:00-16:00',
  ]);
});

test('recorded tilted photo with names across the top', () => {
  assert.deepEqual(brief(read('names_across_top_tilted_photo').shifts), [
    '2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00', '2026-11-20 09:00-15:00',
  ]);
});

test('a name that is not in the photo is not matched to someone else', () => {
  const r = read('grid_basic_photo', 'Chris Nobody');
  assert.equal(r.status, 'name-not-found');
  assert.equal(r.shifts.length, 0);
  assert.ok(r.names.length >= 3);
});
