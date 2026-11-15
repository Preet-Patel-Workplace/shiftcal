// End-to-end tests: real PDF files in, shifts out.
// The PDFs are made-up schedules built by tools/make_fixtures.py.
import test from 'node:test';
import assert from 'node:assert/strict';

import { brief, parseFixture } from './helpers.js';

test('grid, day names only, week in the title', async () => {
  const r = await parseFixture('grid_basic.pdf');
  assert.equal(r.status, 'ok');
  assert.equal(r.layout, 'grid');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-17 09:00-17:00',
    '2026-11-19 12:00-20:00',
    '2026-11-20 09:00-17:00',
  ]);
  assert.deepEqual(r.names, ['Avery Collins', 'Jordan Mehta', 'Riley Tremblay', 'Sam Okafor']);
  assert.deepEqual(r.coveredDates, [
    '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
  ]);
});

test('grid: each person gets their own row, never a neighbour', async () => {
  const jordan = await parseFixture('grid_basic.pdf', { name: 'Jordan Mehta' });
  assert.deepEqual(brief(jordan.shifts), [
    '2026-11-15 10:00-16:00',
    '2026-11-17 12:00-20:00',
    '2026-11-18 12:00-20:00',
    '2026-11-21 09:00-15:00',
  ]);
  const riley = await parseFixture('grid_basic.pdf', { name: 'riley' });
  assert.deepEqual(brief(riley.shifts), [
    '2026-11-17 09:00-13:00',
    '2026-11-18 09:00-13:00',
    '2026-11-19 09:00-13:00',
    '2026-11-21 10:00-18:00',
  ]);
});

test('grid, dates in the header, no am/pm', async () => {
  const r = await parseFixture('grid_dates_no_ampm.pdf');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 12:00-20:00',
    '2026-11-19 10:30-18:30',
    '2026-11-21 07:00-15:00',
  ]);
  assert.ok(r.shifts.every((s) => s.guessed));
  const sam = await parseFixture('grid_dates_no_ampm.pdf', { name: 'Sam Okafor' });
  assert.deepEqual(brief(sam.shifts), [
    '2026-11-16 08:00-16:00',
    '2026-11-17 08:00-16:00',
    '2026-11-20 17:00-22:00',
    '2026-11-21 14:00-22:00',
  ]);
});

test('grid, two header lines, 24-hour times, extra columns', async () => {
  const r = await parseFixture('grid_two_line_header_24h.pdf');
  assert.equal(r.matchedName, 'Collins, Avery');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:30',
    '2026-11-17 09:00-17:30',
    '2026-11-19 13:00-21:00',
    '2026-11-22 10:00-16:00',
  ]);
  const dana = await parseFixture('grid_two_line_header_24h.pdf', { name: 'Dana Collins' });
  assert.deepEqual(brief(dana.shifts), [
    '2026-11-16 13:00-21:00',
    '2026-11-18 09:00-17:30',
    '2026-11-19 09:00-17:30',
  ]);
});

test('same surname twice: asks which person', async () => {
  const r = await parseFixture('grid_two_line_header_24h.pdf', { name: 'Collins' });
  assert.equal(r.status, 'ambiguous-name');
  assert.deepEqual(r.candidates, ['Collins, Avery', 'Collins, Dana']);
});

test('two weeks on two pages, roles on a second line, split and overnight shifts', async () => {
  const r = await parseFixture('grid_two_weeks_multiline.pdf');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 09:00-13:00',
    '2026-11-18 14:00-18:00',
    '2026-11-20 22:00-06:00+1',
    '2026-11-24 12:00-20:00',
    '2026-11-25 12:00-20:00',
    '2026-11-28 09:00-17:00',
  ]);
  assert.equal(r.shifts[0].label, 'Front desk');
  assert.equal(r.shifts[3].label, 'Night audit');
  assert.equal(r.coveredDates.length, 14);
  const sam = await parseFixture('grid_two_weeks_multiline.pdf', { name: 'Sam Okafor' });
  assert.deepEqual(brief(sam.shifts), [
    '2026-11-17 09:00-17:00',
    '2026-11-19 09:00-17:00',
    '2026-11-21 12:00-20:00',
    '2026-11-23 09:00-17:00',
    '2026-11-26 09:00-17:00',
    '2026-11-27 09:00-17:00',
  ]);
});

test('a time wrapped over two lines in a narrow cell', async () => {
  const r = await parseFixture('grid_wrapped_time.pdf');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-17 09:00-17:00',
    '2026-11-20 13:00-21:00',
  ]);
  const jordan = await parseFixture('grid_wrapped_time.pdf', { name: 'Jordan Mehta' });
  assert.deepEqual(brief(jordan.shifts), [
    '2026-11-15 09:00-15:00',
    '2026-11-18 09:00-17:00',
    '2026-11-19 09:00-17:00',
  ]);
});

test('no dates anywhere: asks for the week, then places the shifts', async () => {
  const first = await parseFixture('grid_no_dates.pdf');
  assert.equal(first.status, 'needs-week-start');
  const second = await parseFixture('grid_no_dates.pdf', { weekStart: '2026-11-16' });
  assert.deepEqual(brief(second.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 09:00-17:00',
    '2026-11-21 11:00-19:00',
  ]);
});

test('list grouped by day', async () => {
  const r = await parseFixture('list_by_day.pdf');
  assert.equal(r.layout, 'list');
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 13:00-21:00']);
  assert.equal(r.shifts[0].label, 'Teller');
  assert.deepEqual(r.names, ['Avery Collins', 'Jordan Mehta', 'Sam Okafor']);
});

test('list grouped by person', async () => {
  const r = await parseFixture('list_by_person.pdf');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 13:00-21:00',
    '2026-11-21 10:00-16:00',
  ]);
  const sam = await parseFixture('list_by_person.pdf', { name: 'Sam Okafor' });
  assert.deepEqual(brief(sam.shifts), ['2026-11-17 09:00-17:00']);
  const jordan = await parseFixture('list_by_person.pdf', { name: 'Jordan Mehta' });
  assert.deepEqual(brief(jordan.shifts), ['2026-11-16 12:00-20:00', '2026-11-17 09:00-17:00']);
});

test('one line per shift with separate start and end columns', async () => {
  const r = await parseFixture('rows_per_shift.pdf');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 13:00-21:00',
    '2026-11-21 10:00-16:00',
  ]);
  assert.equal(r.shifts[0].label, 'Teller');
});

test('names across the top, one row per day', async () => {
  const r = await parseFixture('names_across_top.pdf');
  assert.equal(r.layout, 'columns');
  assert.deepEqual(brief(r.shifts), [
    '2026-11-16 09:00-17:00',
    '2026-11-18 13:00-21:00',
    '2026-11-20 09:00-15:00',
  ]);
  const sam = await parseFixture('names_across_top.pdf', { name: 'Sam Okafor' });
  assert.deepEqual(brief(sam.shifts), [
    '2026-11-16 12:00-20:00',
    '2026-11-17 09:00-17:00',
    '2026-11-19 09:00-17:00',
  ]);
});

test('a scanned PDF with no text is reported as empty', async () => {
  const r = await parseFixture('scanned_no_text.pdf');
  assert.equal(r.status, 'empty');
});

test('a name that is not in the PDF lists the names that are', async () => {
  const r = await parseFixture('grid_basic.pdf', { name: 'Chris Nobody' });
  assert.equal(r.status, 'name-not-found');
  assert.ok(r.names.includes('Avery Collins'));
});

test('the sample schedule works for the sample name', async () => {
  const { readPdf } = await import('./helpers.js');
  const { parseSchedule } = await import('../js/parser.js');
  const items = await readPdf(new URL('../sample/sample-schedule.pdf', import.meta.url).pathname);
  const r = parseSchedule(items, { name: 'Alex Sample', today: '2026-11-13', weekStart: '2026-11-15' });
  assert.equal(r.status, 'ok');
  assert.equal(r.shifts.length, 5);
});
