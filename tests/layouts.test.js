// Harder layouts, built by hand as text items, that real schedules use.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSchedule } from '../js/parser.js';
import { brief, TODAY } from './helpers.js';

// rows of [x, text, width?]
const mk = (rows, page = 1, lineHeight = 18, size = 9) => rows.flatMap((row, r) => row.map(([x, str, w]) => ({
  str, x, y: 40 + r * lineHeight, w: w ?? str.length * size * 0.5, h: size, page,
})));
const run = (items, name = 'Avery Collins') => parseSchedule(items, { name, today: TODAY });

test('"Monday 11/16" headers and upper-case "LAST, FIRST" names', () => {
  const r = run(mk([
    [[30, 'TEAM MEMBER'], [150, 'Monday 11/16'], [250, 'Tuesday 11/17'], [350, 'Wednesday 11/18'], [450, 'Thursday 11/19']],
    [[30, 'MEHTA, JORDAN'], [150, '8:45a - 5:15p'], [250, 'OFF'], [350, '8:45a - 5:15p'], [450, 'OFF']],
    [[30, 'COLLINS, AVERY'], [150, 'OFF'], [250, '10:00a - 6:30p'], [350, 'OFF'], [450, '12:15p - 8:45p']],
  ]), 'avery collins');
  assert.deepEqual(brief(r.shifts), ['2026-11-17 10:00-18:30', '2026-11-19 12:15-20:45']);
});

test('every word stored as a separate piece of text', () => {
  const split = (x, words) => { let cx = x; return words.map((w) => { const it = [cx, w]; cx += w.length * 4.5 + 2.5; return it; }); };
  const r = run(mk([
    [...split(30, ['Name']), ...split(150, ['Mon', 'Nov', '16']), ...split(260, ['Tue', 'Nov', '17']), ...split(370, ['Wed', 'Nov', '18'])],
    [...split(30, ['Avery', 'Collins']), ...split(150, ['9:00', 'AM', '-', '5:00', 'PM']), ...split(260, ['OFF']), ...split(370, ['1:00', 'PM', '-', '9:00', 'PM'])],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00']);
});

test('tight columns where neighbouring cells almost touch', () => {
  const r = run(mk([
    [[30, 'Name'], [120, 'Mon 16'], [182, 'Tue 17'], [244, 'Wed 18'], [306, 'Thu 19']],
    [[30, 'Avery Collins'], [120, '9:00a-5:00p', 58], [182, '9:00a-5:00p', 58], [244, 'OFF'], [306, '1:00p-9:00p', 58]],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-17 09:00-17:00', '2026-11-19 13:00-21:00']);
});

test('first and last name in separate columns, with an ID column', () => {
  const r = run(mk([
    [[20, 'ID'], [60, 'First'], [110, 'Last'], [200, 'Sun 11/15'], [290, 'Mon 11/16'], [380, 'Tue 11/17']],
    [[20, '1042'], [60, 'Jordan'], [110, 'Mehta'], [200, 'OFF'], [290, '9-5'], [380, '9-5']],
    [[20, '1077'], [60, 'Avery'], [110, 'Collins'], [200, '10-4'], [290, 'OFF'], [380, '12-8']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-15 10:00-16:00', '2026-11-17 12:00-20:00']);
});

test('department headings and a totals row inside the grid', () => {
  const r = run(mk([
    [[30, 'Week of Nov 16, 2026']],
    [[30, 'Employee'], [200, 'Mon'], [290, 'Tue'], [380, 'Wed'], [470, 'Hours']],
    [[30, 'Front Counter']],
    [[30, 'Jordan Mehta'], [200, '9:00 AM - 5:00 PM'], [290, 'OFF'], [380, '9:00 AM - 5:00 PM'], [470, '16.00']],
    [[30, 'Back Office']],
    [[30, 'Avery Collins'], [200, 'OFF'], [290, '9:00 AM - 5:00 PM'], [380, '12:00 PM - 8:00 PM'], [470, '16.00']],
    [[30, 'Total'], [200, '8.00'], [290, '8.00'], [380, '16.00'], [470, '32.00']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-17 09:00-17:00', '2026-11-18 12:00-20:00']);
});

test('a "Week of" line printed under the table is still used', () => {
  const r = run(mk([
    [[30, 'Employee'], [200, 'Mon'], [290, 'Tue'], [380, 'Wed']],
    [[30, 'Avery Collins'], [200, 'OFF'], [290, '9:00 AM - 5:00 PM'], [380, 'OFF']],
    [[30, 'Week of Nov 16, 2026']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-17 09:00-17:00']);
});

test('a "Printed on" date is not mistaken for the week', () => {
  const r = run(mk([
    [[30, 'Printed 11/02/2026 3:15 PM']],
    [[30, 'Employee'], [200, 'Mon'], [290, 'Tue'], [380, 'Wed']],
    [[30, 'Avery Collins'], [200, 'OFF'], [290, '9:00 AM - 5:00 PM'], [380, 'OFF']],
  ]));
  assert.equal(r.status, 'needs-week-start');
});

test('the same person listed twice gets both rows', () => {
  const r = run(mk([
    [[30, 'Employee'], [200, 'Mon Nov 16'], [290, 'Tue Nov 17'], [380, 'Wed Nov 18']],
    [[30, 'Avery Collins'], [200, '9:00 AM - 1:00 PM'], [290, 'OFF'], [380, 'OFF']],
    [[30, 'Jordan Mehta'], [200, 'OFF'], [290, '9:00 AM - 5:00 PM'], [380, 'OFF']],
    [[30, 'Avery Collins'], [200, 'OFF'], [290, 'OFF'], [380, '2:00 PM - 6:00 PM']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-13:00', '2026-11-18 14:00-18:00']);
});

const pageOne = [
  [[30, 'Employee'], [200, 'Mon Nov 16'], [290, 'Tue Nov 17'], [380, 'Wed Nov 18']],
  [[30, 'Jordan Mehta'], [200, '9-5'], [290, 'OFF'], [380, '9-5']],
];

test('the header repeated at the top of page 2', () => {
  const r = run([...mk(pageOne), ...mk([pageOne[0], [[30, 'Avery Collins'], [200, 'OFF'], [290, '9-5'], [380, '9-5']]], 2)]);
  assert.deepEqual(brief(r.shifts), ['2026-11-17 09:00-17:00', '2026-11-18 09:00-17:00']);
});

test('rows that run on to page 2 with no repeated header', () => {
  const r = run([...mk(pageOne), ...mk([[[30, 'Avery Collins'], [200, 'OFF'], [290, '9-5'], [380, '9-5']]], 2)]);
  assert.deepEqual(brief(r.shifts), ['2026-11-17 09:00-17:00', '2026-11-18 09:00-17:00']);
});

test('a neighbour\'s shifts never leak into your row', () => {
  const r = run(mk([
    [[30, 'Employee'], [200, 'Mon Nov 16'], [290, 'Tue Nov 17'], [380, 'Wed Nov 18']],
    [[30, 'Jordan Mehta'], [200, '9-5'], [290, '9-5'], [380, '9-5']],
    [[30, 'Avery Collins'], [200, 'OFF'], [290, 'OFF'], [380, 'OFF']],
    [[30, 'Sam Okafor'], [200, '1-9'], [290, '1-9'], [380, '1-9']],
  ]));
  assert.equal(r.status, 'no-shifts');
  assert.equal(r.shifts.length, 0);
});

// --- extra safeguards added for text read from photos; they apply to PDFs too

test('day names glued to the date ("TueNov17", "Wed18") are understood', () => {
  const r = run(mk([
    [[30, 'Name'], [150, 'MonNov16'], [250, 'TueNov17'], [350, 'WedNov18'], [450, 'ThuNov19']],
    [[30, 'Avery Collins'], [150, '9-5'], [250, 'OFF'], [350, '12-8'], [450, 'OFF']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 12:00-20:00']);
});

test('a header column that could not be read is put back, not skipped', () => {
  // "Wed Nov 18" is missing from the header: the Wed cell must not slide to Thu
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [450, 'Thu Nov 19'], [550, 'Fri Nov 20']],
    [[30, 'Avery Collins'], [150, 'OFF'], [250, 'OFF'], [350, '12-8'], [450, 'OFF'], [550, '9-5']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-18 12:00-20:00', '2026-11-20 09:00-17:00']);
});

test('one misread date in the header is corrected from its neighbours', () => {
  // "Thu Nov 13" should be Nov 19; Nov 13 is not even a Thursday
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [350, 'Wed Nov 18'], [450, 'Thu Nov 13'], [550, 'Fri Nov 20']],
    [[30, 'Avery Collins'], [150, 'OFF'], [250, 'OFF'], [350, 'OFF'], [450, '1-9'], [550, 'OFF']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-19 13:00-21:00']);
});

test('a schedule that really skips a day keeps its own dates', () => {
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [350, 'Wed Nov 18'], [450, 'Thu Nov 19'], [550, 'Sat Nov 21']],
    [[30, 'Avery Collins'], [150, 'OFF'], [250, 'OFF'], [350, 'OFF'], [450, 'OFF'], [550, '10-4']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-21 10:00-16:00']);
});

test('when the next person\'s name is unreadable, their shifts are not taken', () => {
  // the second name is missing, so its row has no owner of its own
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [350, 'Wed Nov 18']],
    [[30, 'Avery Collins'], [150, '9-5'], [250, 'OFF'], [350, 'OFF']],
    [],
    [],
    [[150, 'OFF'], [250, '1-9'], [350, '1-9']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00']);
});

test('a name centred beside a two-line cell gets both lines, and only those', () => {
  const rows = [
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [350, 'Wed Nov 18']],
    [[150, '9:00am-5:00pm'], [350, '10:00pm-6:00am']],
    [[30, 'Avery Collins'], [250, 'OFF']],
    [[150, 'Front desk'], [350, 'Night audit']],
    [],
    [[250, '9:00am-5:00pm']],
    [[30, 'Sam Okafor'], [150, 'OFF'], [350, 'OFF']],
    [[250, 'Front desk']],
  ];
  const items = rows.flatMap((row, r) => row.map(([x, str]) => ({ str, x, y: 40 + r * 12, w: str.length * 4.5, h: 9, page: 1 })));
  const avery = parseSchedule(items, { name: 'Avery Collins', today: TODAY });
  assert.deepEqual(brief(avery.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 22:00-06:00+1']);
  const sam = parseSchedule(items, { name: 'Sam Okafor', today: TODAY });
  assert.deepEqual(brief(sam.shifts), ['2026-11-17 09:00-17:00']);
});

test('a table whose heading was not understood is not read as a list', () => {
  // no usable header: the row must not have every shift stamped with one date
  const r = run(mk([
    [[30, 'Rota for Nov 16']],
    [[30, 'Name'], [150, 'M'], [250, 'T'], [350, 'W'], [450, 'T']],
    [[30, 'Avery Collins'], [150, '9-5'], [250, '12-8'], [350, '1-9'], [450, '7-3']],
  ]));
  assert.equal(r.shifts.length, 0);
});

test('a line with several dates never lends its date to the rows under it', () => {
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17']],
    [[30, 'Avery Collins'], [150, '9-5'], [250, '12-8']],
  ]));
  assert.equal(r.shifts.length, 0);
});

test('a stray space inside a time is ignored', () => {
  const r = run(mk([
    [[30, 'Name'], [150, 'Mon Nov 16'], [250, 'Tue Nov 17'], [350, 'Wed Nov 18']],
    [[30, 'Avery Collins'], [150, '9:00am-1 :00pm'], [250, 'OFF'], [350, '9: 00am-5:00pm']],
  ]));
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-13:00', '2026-11-18 09:00-17:00']);
});
