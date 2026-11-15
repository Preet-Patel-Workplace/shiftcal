// ics.js
// Builds a calendar file (.ics) from a list of shifts.
// Times are written as "floating" local times, so 9:00 stays 9:00 on the
// phone no matter which time zone it is set to.

import { addDays } from './parser.js';

const pad2 = (n) => String(n).padStart(2, '0');

export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Calendar files limit lines to 75 bytes; longer lines continue on the next
// line after a single space.
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function localStamp(date, time) {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

// Small, stable hash so the same shift always gets the same calendar id.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function shiftUid(shift, owner) {
  return `shift-${shift.date}-${shift.slot ?? 0}-${hash(String(owner || '').toLowerCase())}@shiftcal`;
}

export function eventTitle(shift, settings) {
  const base = (settings.eventTitle || 'Work shift').trim() || 'Work shift';
  return shift.label ? `${base} (${shift.label})` : base;
}

// buildCalendar(shifts, settings, now)
//   shift: { date, start, end, endsNextDay, label, note, slot, seq }
//   settings: { name, eventTitle, location, reminders: [minutes], calendarName }
export function buildCalendar(shifts, settings = {}, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ShiftCal//Shift schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(settings.calendarName || 'Work shifts')}`,
  ];
  const stamp = utcStamp(now);
  const reminders = [...new Set((settings.reminders || []).map(Number).filter((m) => m >= 0))].sort((a, b) => b - a);

  for (const shift of shifts) {
    const endDate = shift.endsNextDay ? addDays(shift.date, 1) : shift.date;
    const title = eventTitle(shift, settings);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${shiftUid(shift, settings.name)}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${stamp}`,
      `SEQUENCE:${shift.seq || 0}`,
      `DTSTART:${localStamp(shift.date, shift.start)}`,
      `DTEND:${localStamp(endDate, shift.end)}`,
      `SUMMARY:${escapeText(title)}`
    );
    if (settings.location) lines.push(`LOCATION:${escapeText(settings.location)}`);
    if (shift.note) lines.push(`DESCRIPTION:${escapeText(shift.note)}`);
    lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE');
    for (const minutes of reminders) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(title)}`,
        `TRIGGER:-PT${minutes}M`,
        'END:VALARM'
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// A link that opens Google Calendar with one shift filled in.
export function googleCalendarUrl(shift, settings = {}) {
  const endDate = shift.endsNextDay ? addDays(shift.date, 1) : shift.date;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventTitle(shift, settings),
    dates: `${localStamp(shift.date, shift.start)}/${localStamp(endDate, shift.end)}`,
  });
  if (settings.location) params.set('location', settings.location);
  if (shift.note) params.set('details', shift.note);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
