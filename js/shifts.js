// shifts.js
// Everything about the saved list of shifts: comparing a new schedule with
// the old one, working out hours, and finding the next shift.
// Pure functions, shared by the app and the tests.

import { addDays, dowOf, toDayNumber } from './parser.js';

export function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function shiftMinutes(shift) {
  let end = minutesOf(shift.end);
  const start = minutesOf(shift.start);
  if (shift.endsNextDay || end <= start) end += 1440;
  return end - start;
}

// Paid minutes: take the unpaid break off shifts long enough to have one.
export function paidMinutes(shift, settings = {}) {
  const len = shiftMinutes(shift);
  const breakMin = Number(settings.breakMinutes) || 0;
  const after = (Number(settings.breakAfterHours) || 0) * 60;
  if (breakMin > 0 && len > after) return Math.max(0, len - breakMin);
  return len;
}

export function sortShifts(shifts) {
  return shifts.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

// Gives each shift a slot number within its day (0 for the first shift of
// the day, 1 for a second one). Calendar ids are built from date + slot, so
// a shift keeps the slot it was first given.
export function assignSlots(shifts) {
  const taken = new Map();
  for (const s of shifts) {
    if (s.slot == null) continue;
    if (!taken.has(s.date)) taken.set(s.date, new Set());
    const set = taken.get(s.date);
    if (set.has(s.slot)) s.slot = null; else set.add(s.slot);
  }
  for (const s of sortShifts(shifts)) {
    if (s.slot != null) continue;
    if (!taken.has(s.date)) taken.set(s.date, new Set());
    const set = taken.get(s.date);
    let n = 0;
    while (set.has(n)) n++;
    s.slot = n;
    set.add(n);
  }
  return shifts;
}

const sameTimes = (a, b) => a.start === b.start && a.end === b.end && !!a.endsNextDay === !!b.endsNextDay;

// mergeSchedule(existing, incoming, coveredDates)
//   existing      saved shifts
//   incoming      shifts just read from a PDF
//   coveredDates  every date the new PDF covers (including days off)
//
// Shifts the user added or edited by hand are never touched.
// Returns { shifts, added, changed, removed, unchanged }.
export function mergeSchedule(existing, incoming, coveredDates = []) {
  const covered = new Set(coveredDates.length ? coveredDates : incoming.map((s) => s.date));
  const keep = [];
  const oldByDate = new Map();
  // A schedule shift the user edited by hand remembers its printed times in
  // `orig`, so it can still be matched against the next PDF.
  const printed = (s) => s.orig || s;
  for (const s of existing) {
    const date = printed(s).date;
    if (s.source === 'pdf' && covered.has(date)) {
      if (!oldByDate.has(date)) oldByDate.set(date, []);
      oldByDate.get(date).push(s);
    } else if (s.source !== 'sample') keep.push(s);
  }
  const newByDate = new Map();
  for (const s of incoming) {
    if (!newByDate.has(s.date)) newByDate.set(s.date, []);
    newByDate.get(s.date).push(s);
  }

  const added = [];
  const changed = [];
  const removed = [];
  let unchanged = 0;
  const out = keep.slice();
  const manualKey = new Set(keep.map((s) => `${s.date}|${s.start}|${s.end}`));

  const dates = new Set([...oldByDate.keys(), ...newByDate.keys()]);
  for (const date of [...dates].sort()) {
    const olds = (oldByDate.get(date) || []).slice().sort((a, b) => printed(a).start.localeCompare(printed(b).start));
    const news = sortShifts(newByDate.get(date) || []);
    const usedOld = new Set();

    // Pass 1: the PDF still says what it said before.
    const leftover = [];
    for (const n of news) {
      const i = olds.findIndex((o, k) => !usedOld.has(k) && sameTimes(printed(o), n));
      if (i >= 0) {
        usedOld.add(i);
        const o = olds[i];
        out.push(o.orig ? { ...o } : { ...o, label: n.label || o.label || '', guessed: !!n.guessed });
        unchanged++;
      } else leftover.push(n);
    }
    // Pass 2: same day, different time = a change.
    for (const n of leftover) {
      if (manualKey.has(`${n.date}|${n.start}|${n.end}`)) continue; // already added by hand
      const i = olds.findIndex((o, k) => !usedOld.has(k));
      if (i >= 0) {
        usedOld.add(i);
        const o = olds[i];
        const next = { ...o, ...pick(n), seq: (o.seq || 0) + 1, source: 'pdf' };
        delete next.orig;
        out.push(next);
        changed.push({ before: { ...o }, after: next });
      } else {
        const next = { id: newId(), ...pick(n), seq: 0, source: 'pdf', note: '' };
        out.push(next);
        added.push(next);
      }
    }
    olds.forEach((o, k) => { if (!usedOld.has(k)) removed.push(o); });
  }
  assignSlots(out);
  return { shifts: sortShifts(out), added, changed, removed, unchanged };
}

function pick(n) {
  return {
    date: n.date, start: n.start, end: n.end,
    endsNextDay: !!n.endsNextDay, label: n.label || '', guessed: !!n.guessed,
  };
}

let idCounter = 0;
export function newId() {
  idCounter++;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// The first day of the week containing `date`.
export function weekStartOf(date, weekStartsOn = 1) {
  const diff = (dowOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

// Start of a shift as a real moment, for countdowns.
export function shiftStart(shift) {
  const [y, m, d] = shift.date.split('-').map(Number);
  const [h, min] = shift.start.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}
export function shiftEnd(shift) {
  return new Date(shiftStart(shift).getTime() + shiftMinutes(shift) * 60000);
}

// The shift happening now, or else the next one to start.
export function nextShift(shifts, now = new Date()) {
  let best = null;
  for (const s of shifts) {
    const end = shiftEnd(s);
    if (end <= now) continue;
    if (!best || shiftStart(s) < shiftStart(best)) best = s;
  }
  if (!best) return null;
  return { shift: best, onNow: shiftStart(best) <= now };
}

export function upcoming(shifts, now = new Date()) {
  return sortShifts(shifts.filter((s) => shiftEnd(s) > now));
}

export function weekTotals(shifts, weekStart, settings = {}) {
  const from = toDayNumber(weekStart);
  const inWeek = shifts.filter((s) => {
    const d = toDayNumber(s.date);
    return d >= from && d < from + 7;
  });
  return {
    count: inWeek.length,
    minutes: inWeek.reduce((sum, s) => sum + paidMinutes(s, settings), 0),
  };
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatTime(time, use24) {
  const [h, m] = time.split(':').map(Number);
  if (use24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

// "in 2 days 4 h", "in 35 min"
export function formatCountdown(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days >= 2) return `${days} days${hours ? ` ${hours} h` : ''}`;
  if (days === 1) return `1 day${hours ? ` ${hours} h` : ''}`;
  if (hours) return `${hours} h${mins ? ` ${mins} min` : ''}`;
  return `${mins} min`;
}
