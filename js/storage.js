// storage.js
// Saves everything in this browser (localStorage). Nothing is sent anywhere.

const KEY = 'shiftcal:v1';

export const DEFAULT_SETTINGS = {
  name: '',
  eventTitle: 'Work shift',
  location: '',
  reminders: [1440, 60], // minutes before the shift
  breakMinutes: 0,
  breakAfterHours: 5,
  dateOrder: 'auto', // 'auto' | 'MDY' | 'DMY'
  earliestHour: 6,
  theme: 'auto', // 'auto' | 'light' | 'dark'
  highlighter: 'yellow',
  use24: false,
  weekStartsOn: 0, // 0 = Sunday, 1 = Monday
};

export function emptyState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    shifts: [],
    lastImport: null, // { at, fileName, added: [ids], changed: [{id, before}], removed: [shift], seen }
  };
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function cleanShift(s) {
  if (!s || !isDate(s.date) || !isTime(s.start) || !isTime(s.end)) return null;
  const out = {
    id: typeof s.id === 'string' && s.id ? s.id : `s${Math.random().toString(36).slice(2)}`,
    date: s.date,
    start: s.start,
    end: s.end,
    endsNextDay: !!s.endsNextDay,
    label: typeof s.label === 'string' ? s.label.slice(0, 60) : '',
    note: typeof s.note === 'string' ? s.note.slice(0, 500) : '',
    source: ['pdf', 'manual', 'sample'].includes(s.source) ? s.source : 'manual',
    seq: Number.isInteger(s.seq) && s.seq >= 0 ? s.seq : 0,
    slot: Number.isInteger(s.slot) && s.slot >= 0 ? s.slot : null,
    guessed: !!s.guessed,
    exportedSeq: Number.isInteger(s.exportedSeq) ? s.exportedSeq : null,
  };
  if (s.orig && isDate(s.orig.date) && isTime(s.orig.start) && isTime(s.orig.end)) {
    out.orig = { date: s.orig.date, start: s.orig.start, end: s.orig.end, endsNextDay: !!s.orig.endsNextDay };
  }
  return out;
}

// Accepts anything (old data, a backup file, damaged data) and returns a
// state the app can safely use.
export function sanitize(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const set = state.settings;
  if (typeof s.name === 'string') set.name = s.name.slice(0, 80);
  if (typeof s.eventTitle === 'string') set.eventTitle = s.eventTitle.slice(0, 80);
  if (typeof s.location === 'string') set.location = s.location.slice(0, 120);
  if (Array.isArray(s.reminders)) {
    set.reminders = [...new Set(s.reminders.map(Number).filter((m) => Number.isFinite(m) && m >= 0 && m <= 20160))].slice(0, 5);
  }
  if (Number(s.breakMinutes) >= 0 && Number(s.breakMinutes) <= 180) set.breakMinutes = Number(s.breakMinutes);
  if (Number(s.breakAfterHours) >= 0 && Number(s.breakAfterHours) <= 24) set.breakAfterHours = Number(s.breakAfterHours);
  if (['auto', 'MDY', 'DMY'].includes(s.dateOrder)) set.dateOrder = s.dateOrder;
  if (Number(s.earliestHour) >= 3 && Number(s.earliestHour) <= 11) set.earliestHour = Number(s.earliestHour);
  if (['auto', 'light', 'dark'].includes(s.theme)) set.theme = s.theme;
  if (['yellow', 'green', 'pink', 'orange', 'blue'].includes(s.highlighter)) set.highlighter = s.highlighter;
  if (typeof s.use24 === 'boolean') set.use24 = s.use24;
  if (s.weekStartsOn === 0 || s.weekStartsOn === 1) set.weekStartsOn = s.weekStartsOn;

  if (Array.isArray(raw.shifts)) {
    const seen = new Set();
    for (const item of raw.shifts.slice(0, 5000)) {
      const shift = cleanShift(item);
      if (!shift || seen.has(shift.id)) continue;
      seen.add(shift.id);
      state.shifts.push(shift);
    }
  }
  const li = raw.lastImport;
  if (li && typeof li === 'object') {
    state.lastImport = {
      at: typeof li.at === 'string' ? li.at : '',
      fileName: typeof li.fileName === 'string' ? li.fileName.slice(0, 200) : '',
      added: Array.isArray(li.added) ? li.added.filter((x) => typeof x === 'string') : [],
      changed: Array.isArray(li.changed)
        ? li.changed.filter((c) => c && typeof c.id === 'string' && cleanShift({ ...c.before, id: 'x' }))
            .map((c) => ({ id: c.id, before: { date: c.before.date, start: c.before.start, end: c.before.end, endsNextDay: !!c.before.endsNextDay } }))
        : [],
      removed: Array.isArray(li.removed) ? li.removed.map(cleanShift).filter(Boolean) : [],
      seen: !!li.seen,
      firstUpload: !!li.firstUpload,
    };
  }
  return state;
}

export function load(storage = globalThis.localStorage) {
  try {
    const text = storage.getItem(KEY);
    if (!text) return emptyState();
    return sanitize(JSON.parse(text));
  } catch {
    return emptyState();
  }
}

// Returns false when the browser refuses to save (private mode, full storage).
export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear(storage = globalThis.localStorage) {
  try {
    storage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
