// Tests for the calendar file.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCalendar, escapeText, foldLine, googleCalendarUrl, shiftUid } from '../js/ics.js';

const NOW = new Date(Date.UTC(2026, 10, 13, 18, 0, 0));
const settings = { name: 'Avery Collins', eventTitle: 'Work shift', location: 'Maple Street Branch', reminders: [60, 1440] };
const day = { date: '2026-11-16', start: '09:00', end: '17:00', endsNextDay: false, label: '', slot: 0, seq: 0 };
const night = { date: '2026-11-20', start: '22:00', end: '06:00', endsNextDay: true, label: 'Night audit', slot: 0, seq: 2 };

const unfold = (ics) => ics.replace(/\r\n /g, '');

test('calendar file has the required structure', () => {
  const ics = buildCalendar([day], settings, NOW);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 1);
  assert.match(ics, /PRODID:/);
  assert.match(ics, /DTSTAMP:20261113T180000Z/);
});

test('times are local wall-clock times', () => {
  const ics = buildCalendar([day], settings, NOW);
  assert.match(ics, /DTSTART:20261116T090000\r\n/);
  assert.match(ics, /DTEND:20261116T170000\r\n/);
});

test('an overnight shift ends on the next day', () => {
  const ics = buildCalendar([night], settings, NOW);
  assert.match(ics, /DTSTART:20261120T220000\r\n/);
  assert.match(ics, /DTEND:20261121T060000\r\n/);
  assert.match(ics, /SUMMARY:Work shift \(Night audit\)/);
  assert.match(ics, /SEQUENCE:2/);
});

test('an overnight shift on the last day of the year rolls into January', () => {
  const ics = buildCalendar([{ ...night, date: '2026-12-31' }], settings, NOW);
  assert.match(ics, /DTEND:20270101T060000/);
});

test('one reminder block per reminder setting', () => {
  const ics = buildCalendar([day], settings, NOW);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.match(ics, /TRIGGER:-PT1440M/);
  assert.match(ics, /TRIGGER:-PT60M/);
  const none = buildCalendar([day], { ...settings, reminders: [] }, NOW);
  assert.ok(!none.includes('VALARM'));
  const dupes = buildCalendar([day], { ...settings, reminders: [60, 60, '60'] }, NOW);
  assert.equal((dupes.match(/BEGIN:VALARM/g) || []).length, 1);
});

test('special characters are escaped', () => {
  assert.equal(escapeText('Front; desk, 2nd floor\\back\nline two'), 'Front\\; desk\\, 2nd floor\\\\back\\nline two');
  const ics = buildCalendar([{ ...day, note: 'Bring keys, badge; park out back' }], { ...settings, location: 'Unit 4, Main St' }, NOW);
  assert.match(ics, /LOCATION:Unit 4\\, Main St/);
  assert.match(ics, /DESCRIPTION:Bring keys\\, badge\\; park out back/);
});

test('long lines are folded to 75 bytes and unfold back', () => {
  const long = `SUMMARY:${'Shift at the very long named location '.repeat(5)}`;
  const folded = foldLine(long);
  const enc = new TextEncoder();
  for (const line of folded.split('\r\n')) assert.ok(enc.encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  const accents = `SUMMARY:${'Café Montréal équipe '.repeat(8)}`;
  for (const line of foldLine(accents).split('\r\n')) assert.ok(enc.encode(line).length <= 75);
  assert.equal(foldLine(accents).replace(/\r\n /g, ''), accents);
  assert.equal(foldLine('SHORT:line'), 'SHORT:line');
});

test('the same shift always gets the same id, different shifts differ', () => {
  assert.equal(shiftUid(day, 'Avery Collins'), shiftUid({ ...day, start: '10:00' }, 'avery collins'));
  assert.notEqual(shiftUid(day, 'Avery Collins'), shiftUid({ ...day, slot: 1 }, 'Avery Collins'));
  assert.notEqual(shiftUid(day, 'Avery Collins'), shiftUid({ ...day, date: '2026-11-17' }, 'Avery Collins'));
  assert.notEqual(shiftUid(day, 'Avery Collins'), shiftUid(day, 'Jordan Mehta'));
  const ics = unfold(buildCalendar([day, night], settings, NOW));
  const uids = ics.match(/UID:.*/g);
  assert.equal(new Set(uids).size, 2);
});

test('an empty list still makes a valid calendar', () => {
  const ics = buildCalendar([], settings, NOW);
  assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'));
  assert.ok(!ics.includes('VEVENT'));
});

test('default title is used when the setting is blank', () => {
  const ics = buildCalendar([day], { ...settings, eventTitle: '   ' }, NOW);
  assert.match(ics, /SUMMARY:Work shift\r\n/);
});

test('Google Calendar link carries the shift', () => {
  const url = new URL(googleCalendarUrl(night, settings));
  assert.equal(url.hostname, 'calendar.google.com');
  assert.equal(url.searchParams.get('dates'), '20261120T220000/20261121T060000');
  assert.equal(url.searchParams.get('text'), 'Work shift (Night audit)');
  assert.equal(url.searchParams.get('location'), 'Maple Street Branch');
});
