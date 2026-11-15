// Tests for saving, comparing and totalling shifts.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatCountdown, formatDuration, formatTime, mergeSchedule, nextShift,
  paidMinutes, shiftMinutes, upcoming, weekStartOf, weekTotals,
} from '../js/shifts.js';

const s = (date, start, end, extra = {}) => ({ date, start, end, endsNextDay: false, label: '', ...extra });
const week = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];

test('first schedule: everything is new', () => {
  const r = mergeSchedule([], [s('2026-11-16', '09:00', '17:00'), s('2026-11-18', '12:00', '20:00')], week);
  assert.equal(r.added.length, 2);
  assert.equal(r.changed.length, 0);
  assert.equal(r.removed.length, 0);
  assert.equal(r.shifts.length, 2);
  assert.ok(r.shifts.every((x) => x.id && x.source === 'pdf' && x.seq === 0));
});

test('same schedule again: nothing changes and nothing is duplicated', () => {
  const first = mergeSchedule([], [s('2026-11-16', '09:00', '17:00'), s('2026-11-18', '12:00', '20:00')], week);
  const again = mergeSchedule(first.shifts, [s('2026-11-16', '09:00', '17:00'), s('2026-11-18', '12:00', '20:00')], week);
  assert.equal(again.added.length + again.changed.length + again.removed.length, 0);
  assert.equal(again.unchanged, 2);
  assert.equal(again.shifts.length, 2);
  assert.deepEqual(again.shifts.map((x) => x.id), first.shifts.map((x) => x.id));
});

test('updated schedule: finds the new, changed and removed shifts', () => {
  const first = mergeSchedule([], [
    s('2026-11-16', '09:00', '17:00'),
    s('2026-11-18', '12:00', '20:00'),
    s('2026-11-20', '09:00', '17:00'),
  ], week);
  const second = mergeSchedule(first.shifts, [
    s('2026-11-16', '09:00', '17:00'), // same
    s('2026-11-18', '13:00', '21:00'), // time change
    s('2026-11-21', '10:00', '16:00'), // new
  ], week);
  assert.deepEqual(second.added.map((x) => x.date), ['2026-11-21']);
  assert.deepEqual(second.changed.map((c) => [c.before.start, c.after.start]), [['12:00', '13:00']]);
  assert.deepEqual(second.removed.map((x) => x.date), ['2026-11-20']);
  assert.equal(second.shifts.length, 3);
  const changed = second.shifts.find((x) => x.date === '2026-11-18');
  assert.equal(changed.seq, 1, 'a changed shift gets a higher revision number');
  assert.equal(changed.id, first.shifts.find((x) => x.date === '2026-11-18').id, 'and keeps its identity');
});

test('weeks outside the new schedule are left alone', () => {
  const first = mergeSchedule([], [s('2026-11-09', '09:00', '17:00')], ['2026-11-09']);
  const second = mergeSchedule(first.shifts, [s('2026-11-16', '09:00', '17:00')], week);
  assert.equal(second.removed.length, 0);
  assert.equal(second.shifts.length, 2);
});

test('shifts added by hand survive a new schedule', () => {
  const manual = { id: 'm1', ...s('2026-11-19', '18:00', '22:00'), source: 'manual', seq: 0 };
  const r = mergeSchedule([manual], [s('2026-11-16', '09:00', '17:00')], week);
  assert.equal(r.removed.length, 0);
  assert.ok(r.shifts.some((x) => x.id === 'm1'));
  const same = mergeSchedule([manual], [s('2026-11-19', '18:00', '22:00')], week);
  assert.equal(same.shifts.length, 1, 'a manual shift is not doubled when the PDF lists it too');
});

test('a schedule shift edited by hand is not doubled or undone by the same PDF', () => {
  const first = mergeSchedule([], [s('2026-11-16', '09:00', '17:00')], week);
  const edited = first.shifts.map((x) => ({
    ...x, start: '10:00', end: '18:00', seq: 1,
    orig: { date: x.date, start: x.start, end: x.end, endsNextDay: false },
  }));
  const again = mergeSchedule(edited, [s('2026-11-16', '09:00', '17:00')], week);
  assert.equal(again.shifts.length, 1);
  assert.equal(again.shifts[0].start, '10:00', 'the hand edit is kept');
  assert.equal(again.added.length + again.changed.length + again.removed.length, 0);
  // ...but when the printed schedule itself changes, the new PDF wins
  const updated = mergeSchedule(edited, [s('2026-11-16', '12:00', '20:00')], week);
  assert.equal(updated.shifts.length, 1);
  assert.equal(updated.shifts[0].start, '12:00');
  assert.equal(updated.shifts[0].orig, undefined);
  assert.equal(updated.changed.length, 1);
});

test('a shift moved to another day by hand is still matched to its printed day', () => {
  const first = mergeSchedule([], [s('2026-11-16', '09:00', '17:00')], week);
  const moved = first.shifts.map((x) => ({
    ...x, date: '2026-11-17', orig: { date: '2026-11-16', start: '09:00', end: '17:00', endsNextDay: false },
  }));
  const again = mergeSchedule(moved, [s('2026-11-16', '09:00', '17:00')], week);
  assert.equal(again.shifts.length, 1);
  assert.equal(again.shifts[0].date, '2026-11-17');
});

test('sample shifts are cleared by a real schedule', () => {
  const sample = [{ id: 'x', ...s('2026-11-16', '09:00', '17:00'), source: 'sample' }];
  const r = mergeSchedule(sample, [s('2026-11-18', '09:00', '17:00')], ['2026-11-18']);
  assert.deepEqual(r.shifts.map((x) => x.date), ['2026-11-18']);
});

test('calendar slots stay the same when a day gains an earlier shift', () => {
  const first = mergeSchedule([], [s('2026-11-18', '14:00', '18:00')], week);
  assert.equal(first.shifts[0].slot, 0);
  const second = mergeSchedule(first.shifts, [s('2026-11-18', '09:00', '13:00'), s('2026-11-18', '14:00', '18:00')], week);
  const afternoon = second.shifts.find((x) => x.start === '14:00');
  const morning = second.shifts.find((x) => x.start === '09:00');
  assert.equal(afternoon.slot, 0, 'the existing shift keeps its slot');
  assert.equal(morning.slot, 1);
});

test('two shifts on one day get separate slots', () => {
  const r = mergeSchedule([], [s('2026-11-18', '09:00', '13:00'), s('2026-11-18', '14:00', '18:00')], week);
  assert.deepEqual(r.shifts.map((x) => x.slot), [0, 1]);
});

test('with no covered dates, only the incoming days are compared', () => {
  const first = mergeSchedule([], [s('2026-11-16', '09:00', '17:00'), s('2026-11-18', '12:00', '20:00')], []);
  const second = mergeSchedule(first.shifts, [s('2026-11-16', '10:00', '18:00')], []);
  assert.equal(second.changed.length, 1);
  assert.equal(second.removed.length, 0);
  assert.equal(second.shifts.length, 2);
});

test('shift length, including overnight', () => {
  assert.equal(shiftMinutes(s('2026-11-16', '09:00', '17:00')), 480);
  assert.equal(shiftMinutes(s('2026-11-20', '22:00', '06:00', { endsNextDay: true })), 480);
  assert.equal(shiftMinutes(s('2026-11-20', '22:00', '06:00')), 480);
  assert.equal(shiftMinutes(s('2026-11-20', '00:00', '00:00', { endsNextDay: true })), 1440);
});

test('unpaid breaks come off long shifts only', () => {
  const rules = { breakMinutes: 30, breakAfterHours: 5 };
  assert.equal(paidMinutes(s('2026-11-16', '09:00', '17:00'), rules), 450);
  assert.equal(paidMinutes(s('2026-11-16', '09:00', '13:00'), rules), 240);
  assert.equal(paidMinutes(s('2026-11-16', '09:00', '14:00'), rules), 300, 'exactly 5 h has no break');
  assert.equal(paidMinutes(s('2026-11-16', '09:00', '17:00'), {}), 480);
});

test('week start and weekly totals', () => {
  assert.equal(weekStartOf('2026-11-18', 1), '2026-11-16');
  assert.equal(weekStartOf('2026-11-18', 0), '2026-11-15');
  assert.equal(weekStartOf('2026-11-15', 0), '2026-11-15');
  assert.equal(weekStartOf('2026-11-15', 1), '2026-11-09');
  const list = [s('2026-11-15', '10:00', '16:00'), s('2026-11-16', '09:00', '17:00'), s('2026-11-23', '09:00', '17:00')];
  assert.deepEqual(weekTotals(list, '2026-11-16'), { count: 1, minutes: 480 });
  assert.deepEqual(weekTotals(list, '2026-11-15'), { count: 2, minutes: 840 });
  assert.deepEqual(weekTotals([], '2026-11-16'), { count: 0, minutes: 0 });
});

test('next shift and upcoming list', () => {
  const list = [s('2026-11-16', '09:00', '17:00'), s('2026-11-18', '12:00', '20:00')];
  const before = nextShift(list, new Date(2026, 10, 13, 12, 0));
  assert.equal(before.shift.date, '2026-11-16');
  assert.equal(before.onNow, false);
  const during = nextShift(list, new Date(2026, 10, 16, 10, 0));
  assert.equal(during.shift.date, '2026-11-16');
  assert.equal(during.onNow, true);
  const after = nextShift(list, new Date(2026, 10, 16, 17, 0));
  assert.equal(after.shift.date, '2026-11-18');
  assert.equal(nextShift(list, new Date(2026, 10, 19, 0, 0)), null);
  assert.equal(nextShift([], new Date()), null);
  assert.equal(upcoming(list, new Date(2026, 10, 17, 0, 0)).length, 1);
});

test('an overnight shift is still "on now" after midnight', () => {
  const list = [s('2026-11-20', '22:00', '06:00', { endsNextDay: true })];
  const r = nextShift(list, new Date(2026, 10, 21, 2, 0));
  assert.equal(r.onNow, true);
});

test('formatting', () => {
  assert.equal(formatDuration(480), '8 h');
  assert.equal(formatDuration(450), '7 h 30 min');
  assert.equal(formatDuration(45), '45 min');
  assert.equal(formatTime('09:00', false), '9 am');
  assert.equal(formatTime('17:30', false), '5:30 pm');
  assert.equal(formatTime('00:00', false), '12 am');
  assert.equal(formatTime('12:00', false), '12 pm');
  assert.equal(formatTime('17:30', true), '17:30');
  assert.equal(formatCountdown(35 * 60000), '35 min');
  assert.equal(formatCountdown(125 * 60000), '2 h 5 min');
  assert.equal(formatCountdown((1440 + 180) * 60000), '1 day 3 h');
  assert.equal(formatCountdown(3 * 1440 * 60000), '3 days');
  assert.equal(formatCountdown(-5), '0 min');
});
