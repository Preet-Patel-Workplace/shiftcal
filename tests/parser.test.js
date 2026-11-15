// Unit tests for the text-reading rules: times, dates, names.
import test from 'node:test';
import assert from 'node:assert/strict';

import { findDate, nameScore, parseSchedule, parseShiftText, addDays, dowOf } from '../js/parser.js';
import { brief, grid, TODAY } from './helpers.js';

const range = (text, opts) => {
  const r = parseShiftText(text, opts);
  return r.shifts.map((s) => `${s.start}-${s.end}${s.endsNextDay ? '+1' : ''}`).join(' & ');
};

test('times with am/pm', () => {
  assert.equal(range('9:00 AM - 5:00 PM'), '09:00-17:00');
  assert.equal(range('9:00am-5:30pm'), '09:00-17:30');
  assert.equal(range('9a-5p'), '09:00-17:00');
  assert.equal(range('12:00 PM – 8:00 PM'), '12:00-20:00'); // en dash
  assert.equal(range('12 AM - 8 AM'), '00:00-08:00');
  assert.equal(range('9 a.m. to 5 p.m.'), '09:00-17:00');
  assert.equal(range('noon - 8pm'), '12:00-20:00');
});

test('24-hour times', () => {
  assert.equal(range('09:00-17:30'), '09:00-17:30');
  assert.equal(range('0900-1730'), '09:00-17:30');
  assert.equal(range('13:00 - 21:00'), '13:00-21:00');
  assert.equal(range('8.00-16.30'), '08:00-16:30');
  assert.equal(range('22:00-06:00'), '22:00-06:00+1');
});

test('times with no am/pm are worked out sensibly', () => {
  assert.equal(range('9-5'), '09:00-17:00');
  assert.equal(range('9:00-5:30'), '09:00-17:30');
  assert.equal(range('12-8'), '12:00-20:00');
  assert.equal(range('1-9'), '13:00-21:00');
  assert.equal(range('7-3'), '07:00-15:00');
  assert.equal(range('5-10'), '17:00-22:00');
  assert.equal(range('11-7'), '11:00-19:00');
  assert.equal(range('8-12'), '08:00-12:00');
  assert.equal(parseShiftText('9-5').shifts[0].guessed, true);
  assert.equal(parseShiftText('9am-5pm').shifts[0].guessed, false);
});

test('the earliest-start setting changes how early hours are read', () => {
  assert.equal(range('5-1'), '17:00-01:00+1');
  assert.equal(range('5-1', { earliestHour: 5 }), '05:00-13:00');
});

test('am/pm on only one side', () => {
  assert.equal(range('9-5pm'), '09:00-17:00');
  assert.equal(range('1-9pm'), '13:00-21:00');
  assert.equal(range('11-7pm'), '11:00-19:00');
  assert.equal(range('9am-5'), '09:00-17:00');
  assert.equal(range('10pm-6'), '22:00-06:00+1');
});

test('overnight and split shifts', () => {
  assert.equal(range('10:00 PM - 6:00 AM'), '22:00-06:00+1');
  assert.equal(range('11pm-7am'), '23:00-07:00+1');
  assert.equal(range('9-1 / 2-6'), '09:00-13:00 & 14:00-18:00');
  assert.equal(range('9:00am-1:00pm 2:00pm-6:00pm'), '09:00-13:00 & 14:00-18:00');
});

test('start and end in separate pieces', () => {
  assert.equal(range('9:00 AM 5:00 PM'), '09:00-17:00');
  assert.equal(range('9:00 AM - 5:00 PM'), '09:00-17:00');
});

test('days off and empty cells give no shift', () => {
  for (const t of ['OFF', 'off', '', '-', '—', 'X', 'RDO', 'Vacation', 'N/A', 'Stat', 'Sick', 'Req Off']) {
    const r = parseShiftText(t);
    assert.equal(r.shifts.length, 0, t);
    assert.equal(r.off, true, t);
  }
});

test('labels are kept and breaks are not treated as shifts', () => {
  assert.equal(parseShiftText('9:00am-5:00pm Front desk').shifts[0].label, 'Front desk');
  assert.equal(parseShiftText('Teller 9-5').shifts[0].label, 'Teller');
  assert.equal(range('9:00am-5:00pm Lunch 12:00pm-12:30pm'), '09:00-17:00');
  assert.equal(parseShiftText('9-5 (8.0)').shifts[0].label, '');
});

test('numbers that are not times are ignored', () => {
  assert.equal(range('37.5'), '');
  assert.equal(range('Total 40'), '');
  assert.equal(range('306-555-0142'), '');
  assert.equal(range('25:00-26:00'), '');
});

test('a lone time is reported as unfinished', () => {
  const r = parseShiftText('9:00 AM -');
  assert.equal(r.shifts.length, 0);
  assert.equal(r.dangling, true);
});

test('findDate reads the common date styles', () => {
  assert.deepEqual(pick(findDate('Mon Nov 16')), { dow: 1, month: 11, day: 16, year: null });
  assert.deepEqual(pick(findDate('Monday, November 16, 2026')), { dow: 1, month: 11, day: 16, year: 2026 });
  assert.deepEqual(pick(findDate('16-Nov-26')), { dow: null, month: 11, day: 16, year: 2026 });
  assert.deepEqual(pick(findDate('2026-11-16')), { dow: null, month: 11, day: 16, year: 2026 });
  assert.deepEqual(pick(findDate('Mon 16')), { dow: 1, month: null, day: 16, year: null });
  assert.deepEqual(pick(findDate('Thursday')), { dow: 4, month: null, day: null, year: null });
  const n = findDate('11/16/2026');
  assert.equal(n.numeric, true);
  assert.deepEqual([n.a, n.b, n.year], [11, 16, 2026]);
  assert.equal(findDate('9-5'), null);
  assert.equal(findDate('Sunil Monroe'), null);
  assert.equal(findDate('May Wong'), null);
  function pick(d) {
    return { dow: d.dow, month: d.month, day: d.day, year: d.year };
  }
});

test('date helpers', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(dowOf('2026-11-16'), 1);
});

test('name matching', () => {
  assert.equal(nameScore('Avery Collins', 'Avery Collins'), 100);
  assert.equal(nameScore('avery collins', 'COLLINS, AVERY'), 90);
  assert.ok(nameScore('Avery Collins', 'Avery C.') > 0);
  assert.ok(nameScore('Avery Collins', 'A. Collins') > 0);
  assert.ok(nameScore('Avery Collins', 'Avery') > 0);
  assert.ok(nameScore('Avery', 'Avery Collins') > 0);
  assert.ok(nameScore('Avery Collins', 'Avery Collins (CSR)') > 0);
  assert.ok(nameScore('Zoë Brontë', 'Zoe Bronte') > 0);
  assert.equal(nameScore('Avery Collins', 'Dana Collins'), 0);
  assert.equal(nameScore('Avery Collins', 'Avery Singh'), 0);
  assert.equal(nameScore('Avery Collins', 'Avery S.'), 0);
  assert.equal(nameScore('Avery Collins', 'Jordan Mehta'), 0);
  assert.equal(nameScore('Avery Collins', ''), 0);
  assert.ok(nameScore('Avery Collins', 'Avery Collins') > nameScore('Avery Collins', 'Avery'));
});

const header = [[40, 'Name'], [160, 'Mon Nov 16'], [260, 'Tue Nov 17'], [360, 'Wed Nov 18'], [460, 'Thu Nov 19']];

test('grid built by hand: finds the right row', () => {
  const items = grid([
    header,
    [[40, 'Jordan Mehta'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']],
    [[40, 'Avery Collins'], [160, 'OFF'], [260, '12-8'], [360, 'OFF'], [460, '1-9']],
  ]);
  const r = parseSchedule(items, { name: 'Avery Collins', today: TODAY });
  assert.equal(r.status, 'ok');
  assert.deepEqual(brief(r.shifts), ['2026-11-17 12:00-20:00', '2026-11-19 13:00-21:00']);
  assert.deepEqual(r.names, ['Avery Collins', 'Jordan Mehta']);
  assert.equal(r.coveredDates.length, 4);
});

test('a name that is not on the schedule returns the list of names', () => {
  const items = grid([header, [[40, 'Jordan Mehta'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']]]);
  const r = parseSchedule(items, { name: 'Chris Nobody', today: TODAY });
  assert.equal(r.status, 'name-not-found');
  assert.deepEqual(r.names, ['Jordan Mehta']);
  assert.equal(r.shifts.length, 0);
});

test('two people matching a short name are offered as a choice', () => {
  const items = grid([
    header,
    [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']],
    [[40, 'Dana Collins'], [160, 'OFF'], [260, '12-8'], [360, 'OFF'], [460, '1-9']],
  ]);
  const r = parseSchedule(items, { name: 'Collins', today: TODAY });
  assert.equal(r.status, 'ambiguous-name');
  assert.deepEqual(r.candidates, ['Avery Collins', 'Dana Collins']);
  const picked = parseSchedule(items, { name: 'Dana Collins', today: TODAY });
  assert.deepEqual(brief(picked.shifts), ['2026-11-17 12:00-20:00', '2026-11-19 13:00-21:00']);
});

test('a person with the whole week off is found, with no shifts', () => {
  const items = grid([header, [[40, 'Avery Collins'], [160, 'OFF'], [260, 'OFF'], [360, 'VAC'], [460, 'OFF']]]);
  const r = parseSchedule(items, { name: 'Avery Collins', today: TODAY });
  assert.equal(r.status, 'no-shifts');
  assert.equal(r.coveredDates.length, 4);
});

test('day/month order: 16/11 is read as 16 November', () => {
  const items = grid([
    [[40, 'Name'], [160, '16/11'], [260, '17/11'], [360, '18/11']],
    [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5']],
  ]);
  const r = parseSchedule(items, { name: 'Avery Collins', today: TODAY });
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 09:00-17:00']);
});

test('ambiguous numeric dates follow the column pattern, or the setting', () => {
  const rows = [
    [[40, 'Name'], [160, '11/2'], [260, '11/3'], [360, '11/4']],
    [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5']],
  ];
  const auto = parseSchedule(grid(rows), { name: 'Avery Collins', today: '2026-11-01' });
  assert.deepEqual(brief(auto.shifts), ['2026-11-02 09:00-17:00', '2026-11-04 09:00-17:00']);
  const rows2 = [
    [[40, 'Name'], [160, '5/6'], [260, '6/6'], [360, '7/6']],
    [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5']],
  ];
  const dmy = parseSchedule(grid(rows2), { name: 'Avery Collins', today: '2026-06-01' });
  assert.deepEqual(brief(dmy.shifts), ['2026-06-05 09:00-17:00', '2026-06-07 09:00-17:00']);
});

test('a schedule that crosses New Year gets the right years', () => {
  const items = grid([
    [[40, 'Name'], [160, 'Dec 30'], [260, 'Dec 31'], [360, 'Jan 1'], [460, 'Jan 2']],
    [[40, 'Avery Collins'], [160, '9-5'], [260, '9-5'], [360, 'OFF'], [460, '9-5']],
  ]);
  const r = parseSchedule(items, { name: 'Avery Collins', today: '2026-12-28' });
  assert.deepEqual(brief(r.shifts), ['2026-12-30 09:00-17:00', '2026-12-31 09:00-17:00', '2027-01-02 09:00-17:00']);
});

test('day names only: asks for the week, then uses it', () => {
  const rows = [
    [[40, 'Name'], [160, 'Mon'], [260, 'Tue'], [360, 'Wed'], [460, 'Thu']],
    [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']],
  ];
  const first = parseSchedule(grid(rows), { name: 'Avery Collins', today: TODAY });
  assert.equal(first.status, 'needs-week-start');
  const second = parseSchedule(grid(rows), { name: 'Avery Collins', today: TODAY, weekStart: '2026-11-15' });
  assert.deepEqual(brief(second.shifts), ['2026-11-16 09:00-17:00', '2026-11-18 09:00-17:00']);
});

test('"Week ending" titles count back from the end date', () => {
  const items = grid([
    [[40, 'Week Ending 11/21/2026']],
    [[40, 'Name'], [160, 'Sun'], [260, 'Mon'], [360, 'Tue'], [460, 'Sat']],
    [[40, 'Avery Collins'], [160, 'OFF'], [260, '9-5'], [360, 'OFF'], [460, '10-4']],
  ]);
  const r = parseSchedule(items, { name: 'Avery Collins', today: TODAY });
  assert.deepEqual(brief(r.shifts), ['2026-11-16 09:00-17:00', '2026-11-21 10:00-16:00']);
});

test('empty input and missing name are handled', () => {
  assert.equal(parseSchedule([], { name: 'A' }).status, 'empty');
  assert.equal(parseSchedule(null, { name: 'A' }).status, 'empty');
  const items = grid([header, [[40, 'Avery Collins'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']]]);
  assert.equal(parseSchedule(items, { name: '   ', today: TODAY }).status, 'name-not-found');
});

test('junk input does not crash the parser', () => {
  const junk = [{ str: 'Hello' }, { str: null, x: 1 }, undefined, { str: '9-5', x: NaN, y: NaN }];
  const r = parseSchedule(junk, { name: 'Avery Collins', today: TODAY });
  assert.ok(['name-not-found', 'empty'].includes(r.status));
});

test('names a letter or two off match only when asked (photos)', () => {
  assert.equal(nameScore('Avery Collins', 'Avery Colins'), 0, 'exact matching by default');
  assert.ok(nameScore('Avery Collins', 'Avery Colins', { fuzzy: true }) > 0);
  assert.ok(nameScore('Avery Collins', 'Avey Collins', { fuzzy: true }) > 0);
  assert.ok(nameScore('Jordan Mehta', 'Jordan Menta', { fuzzy: true }) > 0);
  assert.ok(nameScore('Christopher Lee', 'Chrlstopner Lee', { fuzzy: true }) > 0, 'two slips in a long name');
  assert.equal(nameScore('Avery Collins', 'Dana Collins', { fuzzy: true }), 0, 'a different first name is still a different person');
  assert.equal(nameScore('Jon Smith', 'Jan Smith', { fuzzy: true }), 0, 'short names must match exactly');
  assert.equal(nameScore('Avery Collins', 'Jordan Mehta', { fuzzy: true }), 0);
  assert.ok(
    nameScore('Avery Collins', 'Avery Collins', { fuzzy: true }) > nameScore('Avery Collins', 'Avery Colins', { fuzzy: true }),
    'an exact match always beats a near one'
  );
});

test('two near matches for one name are offered as a choice, not guessed', () => {
  const items = grid([
    header,
    [[40, 'Marla Lopez'], [160, '9-5'], [260, 'OFF'], [360, '9-5'], [460, 'OFF']],
    [[40, 'Mario Lopez'], [160, 'OFF'], [260, '12-8'], [360, 'OFF'], [460, '1-9']],
  ]);
  const r = parseSchedule(items, { name: 'Maria Lopez', today: TODAY, fuzzyNames: true });
  assert.equal(r.status, 'ambiguous-name');
  assert.deepEqual(r.candidates, ['Mario Lopez', 'Marla Lopez']);
});
