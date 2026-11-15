// parser.js
// Turns the text of a staff schedule PDF into one person's shifts.
// Pure functions only (no browser APIs), so the same file runs in the
// browser and in the Node test suite.
//
// Input:  items = [{ str, x, y, w, h, page }]  (y grows downward)
// Output: see parseSchedule() at the bottom of this file.

// ---------------------------------------------------------------- dates

const DOW_WORDS = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6,
};
const DOW_SHORT = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6 };
const MONTH_WORDS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_ALT = Object.keys(MONTH_WORDS).sort((a, b) => b.length - a.length).join('|');
const DOW_ALT = Object.keys(DOW_WORDS).sort((a, b) => b.length - a.length).join('|');

const pad2 = (n) => String(n).padStart(2, '0');

export function ymd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
export function isValidDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export function toDayNumber(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function fromDayNumber(n) {
  const t = new Date(n * 86400000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
export function addDays(s, n) {
  return fromDayNumber(toDayNumber(s) + n);
}
export function dowOf(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function fullYear(y) {
  if (y == null) return null;
  return y < 100 ? 2000 + y : y;
}

// Finds the first date-like piece in a string.
// Returns null, or { dow, month, day, year, a, b, numeric, rest }.
// `rest` is the text with the date removed.
export function findDate(text, opts = {}) {
  let t = ` ${text} `;
  const out = { dow: null, month: null, day: null, year: null, a: null, b: null, numeric: false };
  let found = false;
  const cut = (m) => {
    t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  };

  // Day of week first, so "Mon 16" keeps its 16 for the day-only rule below.
  let m = new RegExp(`(?<![a-z])(${DOW_ALT})(?=(?:${MONTH_ALT})\\.?\\s*\\d|[^a-z]|$)\\.?,?`, 'i').exec(t);
  if (m) {
    out.dow = DOW_WORDS[m[1].toLowerCase()];
    found = true;
    cut(m);
  } else if (opts.allowShort) {
    m = /(?<![a-z])(su|mo|tu|we|th|fr|sa)(?![a-z])\.?/i.exec(t);
    if (m) {
      out.dow = DOW_SHORT[m[1].toLowerCase()];
      found = true;
      cut(m);
    }
  }

  // 2026-11-16
  m = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(t);
  if (m && isValidDate(+m[1], +m[2], +m[3])) {
    out.year = +m[1]; out.month = +m[2]; out.day = +m[3];
    cut(m);
    return finish();
  }
  // Nov 16 / November 16, 2026
  m = new RegExp(
    `(?<![a-z])(${MONTH_ALT})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?(?!\\d|\\s*:)(?:\\s*,?\\s*(\\d{4}))?`, 'i'
  ).exec(t);
  if (m && +m[2] >= 1 && +m[2] <= 31) {
    out.month = MONTH_WORDS[m[1].toLowerCase()]; out.day = +m[2];
    if (m[3]) out.year = +m[3];
    cut(m);
    return finish();
  }
  // 16 Nov / 16-Nov-26
  m = new RegExp(
    `(?<![\\d:])(\\d{1,2})(?:st|nd|rd|th)?[\\s-]*(${MONTH_ALT})(?![a-z])\\.?(?:[\\s,-]+(\\d{4}|\\d{2})(?!\\d|\\s*:))?`, 'i'
  ).exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    out.month = MONTH_WORDS[m[2].toLowerCase()]; out.day = +m[1];
    if (m[3]) out.year = fullYear(+m[3]);
    cut(m);
    return finish();
  }
  // 11/16 or 11/16/2026 (also 16.11.2026 and 16-11-2026, which need a year
  // so that a shift like "9-5" is never mistaken for a date)
  m = /(?<![\d:.])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d:])/.exec(t)
    || /(?<![\d:.])(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?![\d:])/.exec(t);
  if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 31 && (+m[1] <= 12 || +m[2] <= 12)) {
    out.a = +m[1]; out.b = +m[2]; out.numeric = true;
    if (m[3]) out.year = fullYear(+m[3]);
    cut(m);
    return finish();
  }
  // "Mon 16": a bare day number is only trusted next to a day name
  if (out.dow != null) {
    m = /^\s*(\d{1,2})(?:st|nd|rd|th)?\s*$/i.exec(t);
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      out.day = +m[1];
      t = ' ';
    }
  }
  return finish();

  function finish() {
    if (!found && out.month == null && !out.numeric && out.day == null) return null;
    out.rest = t.replace(/\s+/g, ' ').trim();
    return out;
  }
}

// Picks month/day order for numeric dates such as 11/16 or 16/11.
function numericOrder(parts, setting) {
  if (setting === 'MDY' || setting === 'DMY') return setting;
  const nums = parts.filter((p) => p && p.numeric);
  if (nums.some((p) => p.a > 12)) return 'DMY';
  if (nums.some((p) => p.b > 12)) return 'MDY';
  if (nums.length >= 2) {
    const aSame = nums.every((p) => p.a === nums[0].a);
    const bSame = nums.every((p) => p.b === nums[0].b);
    if (aSame && !bSame) return 'MDY';
    if (bSame && !aSame) return 'DMY';
  }
  return 'MDY';
}

// Chooses a year for a month/day that came without one: the year that puts
// the date closest to the reference day, preferring a matching weekday.
function nearestYear(month, day, dow, refDay) {
  const refYear = +fromDayNumber(refDay).slice(0, 4);
  let best = null;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    if (!isValidDate(y, month, day)) continue;
    const s = ymd(y, month, day);
    const dist = Math.abs(toDayNumber(s) - refDay);
    const dowOk = dow == null || dowOf(s) === dow;
    const score = dist + (dowOk ? 0 : 400);
    if (!best || score < best.score) best = { s, score };
  }
  return best ? best.s : null;
}

function resolvePart(part, order, refDay) {
  if (!part) return null;
  let { month, day } = part;
  if (part.numeric) {
    if (order === 'DMY') { day = part.a; month = part.b; } else { month = part.a; day = part.b; }
  }
  if (month == null || day == null) return null;
  if (part.year != null) return isValidDate(part.year, month, day) ? ymd(part.year, month, day) : null;
  return nearestYear(month, day, part.dow, refDay);
}

// "Mon 16" with no month: find the closest date with that day number.
function resolveDayOnly(day, dow, refDay) {
  let best = null;
  for (let off = -62; off <= 62; off++) {
    const s = fromDayNumber(refDay + off);
    if (+s.slice(8) !== day) continue;
    const dowOk = dow == null || dowOf(s) === dow;
    const score = Math.abs(off) + (dowOk ? 0 : 200);
    if (!best || score < best.score) best = { s, score };
  }
  return best ? best.s : null;
}

// ---------------------------------------------------------------- times

const OFF_RE = /^(off|day off|rdo|r\/?o|n\/?a|x|vac|vacation|holiday|stat|stat holiday|sick|leave|pto|loa|unavailable|not scheduled|closed|req off|request off|requested off|none)$/i;

function cleanText(s) {
  return String(s)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00a0\u2000-\u200b]/g, ' ')
    .replace(/(\d)\s+:(\d{2})(?!\d)/g, '$1:$2')
    .replace(/(\d):\s+(\d{2})(?!\d)/g, '$1:$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function meridiem(s) {
  if (!s) return null;
  return /^a/i.test(s) ? 'a' : 'p';
}

// Finds every clock time in a string.
function timeTokens(t) {
  const tokens = [];
  const re = /(?<![\w:.\/])(?:(noon|midnight)|([01]\d|2[0-3])([0-5]\d)\s*(?:h|hrs)?(?![\w:])|(\d{1,2})(?:[:.h]([0-5]\d))?\s*(a\.m\.|p\.m\.|am|pm|a|p)?(?![\w:]))/gi;
  let m;
  while ((m = re.exec(t))) {
    let tok;
    if (m[1]) {
      tok = { h: m[1].toLowerCase() === 'noon' ? 12 : 0, min: 0, mer: null, fixed: true, strong: true };
    } else if (m[2] != null) {
      tok = { h: +m[2], min: +m[3], mer: null, fixed: true, strong: true };
    } else {
      const h = +m[4];
      const min = m[5] != null ? +m[5] : 0;
      const mer = meridiem(m[6]);
      if (h > 24 || (mer && (h < 1 || h > 12))) continue;
      tok = { h, min, mer, fixed: false, strong: m[5] != null || !!mer };
    }
    tok.start = m.index;
    tok.end = m.index + m[0].length;
    tokens.push(tok);
  }
  return tokens;
}

// Works out start and end minutes for a pair of clock times.
// Returns { start, end, guessed } with end > start (end may pass 1440).
function resolveRange(t1, t2, opts) {
  const earliest = opts.earliestHour ?? 6;
  const fixed = (t) => (t.fixed ? t.h * 60 + t.min : null);
  const withMer = (t) => (t.mer ? ((t.h % 12) + (t.mer === 'p' ? 12 : 0)) * 60 + t.min : null);
  const both = (t) => [(t.h % 12) * 60 + t.min, ((t.h % 12) + 12) * 60 + t.min];
  const after = (start, end) => (end <= start ? end + 1440 : end);

  const is24 = !t1.mer && !t2.mer && (t1.fixed || t2.fixed || t1.h >= 13 || t2.h >= 13 || t1.h === 0 || t2.h === 0);
  if (is24) {
    const s = t1.fixed ? fixed(t1) : t1.h * 60 + t1.min;
    const e = t2.fixed ? fixed(t2) : t2.h * 60 + t2.min;
    return { start: s % 1440, end: after(s % 1440, e % 1440), guessed: false };
  }

  let s = fixed(t1) ?? withMer(t1);
  let e = fixed(t2) ?? withMer(t2);
  let guessed = false;

  if (s != null && e != null) return { start: s, end: after(s, e), guessed };

  if (s == null && e != null) {
    // "9-5pm": pick the start that gives the shorter shift
    guessed = true;
    const c = both(t1).map((x) => ({ x, len: after(x, e) - x }));
    c.sort((p, q) => p.len - q.len);
    s = c[0].x;
    return { start: s, end: after(s, e), guessed };
  }
  if (s == null) {
    // No am/pm anywhere: hours before the earliest start are read as pm
    guessed = true;
    const h = t1.h % 12;
    s = (t1.h === 12 ? 12 : h < earliest ? h + 12 : h) * 60 + t1.min;
  }
  if (e == null) {
    guessed = true;
    const c = both(t2).map((x) => after(s, x));
    e = Math.min(...c);
    return { start: s, end: e, guessed };
  }
  return { start: s, end: after(s, e), guessed };
}

const fmtMin = (m) => `${pad2(Math.floor((m % 1440) / 60))}:${pad2(m % 60)}`;

// Reads the text of one schedule cell (or one line).
// Returns { shifts: [{start,end,endsNextDay,guessed,label}], off, dangling, label }.
export function parseShiftText(raw, opts = {}) {
  const t = cleanText(raw);
  const res = { shifts: [], off: false, dangling: false, label: '' };
  if (!t || /^[-\s.]*$/.test(t)) { res.off = true; return res; }
  if (OFF_RE.test(t.replace(/[.()]/g, '').trim())) { res.off = true; return res; }

  const tokens = timeTokens(t);
  const used = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const between = t.slice(a.end, b.start);
    const sep = /^\s*(-+|to|until|till|til|thru|through|>|~)\s*$/i.test(between);
    const blank = /^\s*$/.test(between);
    if (!(sep || (blank && a.strong && b.strong))) continue;
    const before = t.slice(Math.max(0, a.start - 14), a.start);
    used.push([a.start, b.end]);
    i++;
    if (/(lunch|break|meal)\s*[:\-]?\s*\(?\s*$/i.test(before)) continue;
    const r = resolveRange(a, b, opts);
    const len = r.end - r.start;
    if (len <= 0 || len > 18 * 60) continue;
    res.shifts.push({
      start: fmtMin(r.start),
      end: fmtMin(r.end),
      endsNextDay: r.end >= 1440,
      guessed: r.guessed,
    });
  }

  // Whatever is left over becomes a short label ("Teller", "On call").
  let rest = t;
  for (const [s, e] of used.slice().reverse()) rest = rest.slice(0, s) + ' ' + rest.slice(e);
  rest = rest
    .replace(/\b(lunch|break|meal)\b\s*:?/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(h|hr|hrs|hours)?\b/gi, ' ')
    .replace(/^[\s,;:|/\-()]+|[\s,;:|/\-()]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (rest.length > 40) rest = rest.slice(0, 40).trim();
  if (OFF_RE.test(rest)) rest = '';
  res.label = rest;
  for (const s of res.shifts) s.label = rest;
  if (!res.shifts.length) {
    res.dangling = tokens.some((k) => k.strong);
    res.off = !res.dangling && !rest;
  }
  return res;
}

// ---------------------------------------------------------------- names

export function normalizeName(s) {
  return cleanText(String(s).replace(/\([^)]*\)/g, ' '))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .replace(/[-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

// 2 = same word, 1.5 = a letter or two off (photos only), 1 = an initial
function tokenMatch(q, c, fuzzy) {
  if (q === c) return 2;
  if (c.length === 1 && q[0] === c) return 1;
  if (q.length === 1 && c[0] === q) return 1;
  if (fuzzy && q.length >= 4 && c.length >= 4) {
    const limit = Math.min(q.length, c.length) >= 8 ? 2 : 1;
    if (editDistance(q, c, limit) <= limit) return 1.5;
  }
  return 0;
}

// How well a piece of text from the schedule matches the name the user
// typed. 0 means "a different person". With options.fuzzy, a name that is
// a letter or two off still matches, which is needed for photos.
export function nameScore(query, candidate, options = {}) {
  const fuzzy = !!options.fuzzy;
  const q = normalizeName(query).split(' ').filter(Boolean);
  const c = normalizeName(candidate).split(' ').filter(Boolean);
  if (!q.length || !c.length || c.length > 6) return 0;
  if (q.join(' ') === c.join(' ')) return 100;
  const cUsed = new Array(c.length).fill(false);
  let full = 0;
  let near = 0;
  let initials = 0;
  let qLeft = 0;
  for (const qt of q) {
    let bestIdx = -1;
    let best = 0;
    c.forEach((ct, i) => {
      if (cUsed[i]) return;
      const sc = tokenMatch(qt, ct, fuzzy);
      if (sc > best) { best = sc; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      cUsed[bestIdx] = true;
      if (best === 2) full++; else if (best === 1.5) near++; else initials++;
    } else qLeft++;
  }
  const cLeft = cUsed.filter((u) => !u).length;
  const solid = full + near;
  if (!solid) return 0;
  if (qLeft && cLeft) return 0;
  const penalty = initials * 5 + near * 8;
  if (!qLeft && !cLeft) return 90 - penalty;
  if (!qLeft) return 60 + solid * 2 - cLeft - penalty;
  return 50 + solid * 2 - qLeft * 3 - penalty;
}

function looksLikeName(text) {
  const t = cleanText(text);
  if (!t || t.length > 40 || /\d/.test(t)) return false;
  const n = normalizeName(t);
  if (!n || n.length < 2) return false;
  if (/^(total|totals|hours|name|names|employee|employees|staff|staffing|position|role|notes?|dept|department|week|weekly|daily|schedule|rota|roster|date|day|shift|shifts|time|start|end|team|manager|location|store|branch|page)\b/.test(n)) return false;
  if (/\b(schedule|staffing|rota|roster|branch|department)\b/.test(n)) return false;
  if (findDate(t)) return false;
  return n.split(' ').length <= 5;
}

// ---------------------------------------------------------------- layout

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Groups text items into lines, and each line into cells.
export function buildLines(items, options = {}) {
  const cellGap = options.cellGap || 0.6;
  const clean = items
    .filter((it) => it && typeof it.str === 'string' && it.str.trim() !== '')
    .map((it) => ({
      str: it.str,
      x: +it.x || 0,
      y: +it.y || 0,
      w: Math.max(+it.w || 0, 0.01),
      h: Math.max(+it.h || 0, 1),
      page: it.page || 1,
    }));
  const hMed = median(clean.map((it) => it.h)) || 10;
  clean.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const lines = [];
  let cur = null;
  for (const it of clean) {
    const tol = Math.max(2, 0.45 * Math.min(it.h, hMed));
    if (cur && cur.page === it.page && Math.abs(it.y - cur.y) <= tol) {
      cur.items.push(it);
      cur.y = (cur.y * (cur.items.length - 1) + it.y) / cur.items.length;
    } else {
      cur = { page: it.page, y: it.y, items: [it] };
      lines.push(cur);
    }
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.h = median(line.items.map((it) => it.h));
    line.cells = [];
    let cell = null;
    for (const it of line.items) {
      const gap = cell ? it.x - cell.x1 : Infinity;
      const limit = cellGap * Math.max(it.h, cell ? cell.h : it.h);
      if (cell && gap < limit) {
        const needSpace = gap > 0.12 * it.h && !/\s$/.test(cell.text) && !/^\s/.test(it.str);
        cell.text += (needSpace ? ' ' : '') + it.str;
        cell.x1 = Math.max(cell.x1, it.x + it.w);
        cell.items.push(it);
      } else {
        cell = { text: it.str, x0: it.x, x1: it.x + it.w, h: it.h, y: line.y, items: [it] };
        line.cells.push(cell);
      }
    }
    for (const c of line.cells) {
      c.text = cleanText(c.text);
      c.cx = (c.x0 + c.x1) / 2;
    }
    line.text = line.cells.map((c) => c.text).join('  ');
  }
  return { lines, hMed };
}

function headerCell(cell) {
  const d = findDate(cell.text, { allowShort: true });
  if (!d) return null;
  if (d.rest.replace(/[^a-z0-9]/gi, '').length > 3) return null;
  if (timeTokens(cell.text).some((k) => k.strong && (k.mer || /:/.test(cell.text)))) return null;
  return d;
}

function bareDay(cell) {
  const m = /^(\d{1,2})$/.exec(cell.text.trim());
  return m && +m[1] >= 1 && +m[1] <= 31 ? +m[1] : null;
}

// Finds the header rows of schedule grids (the rows listing the days).
function findHeaders(lines, hMed) {
  const headers = [];
  const taken = new Set();
  lines.forEach((line, idx) => {
    if (taken.has(idx)) return;
    const cols = [];
    for (const cell of line.cells) {
      const d = headerCell(cell);
      if (d) cols.push({ cx: cell.cx, x0: cell.x0, x1: cell.x1, part: d, text: cell.text });
    }
    if (cols.length < 3) return;
    const pitch = median(cols.slice(1).map((c, i) => c.cx - cols[i].cx));
    if (!(pitch > 0)) return;
    if (cols.length >= 4) {
      for (let i = cols.length - 1; i >= 1; i--) {
        const gap = cols[i].cx - cols[i - 1].cx;
        const steps = Math.round(gap / pitch);
        if (steps < 2 || steps > 3 || Math.abs(gap - steps * pitch) > 0.45 * pitch) continue;
        for (let k = steps - 1; k >= 1; k--) {
          const cx = cols[i - 1].cx + (gap * k) / steps;
          cols.splice(i, 0, {
            cx, x0: cx, x1: cx, text: '',
            part: { dow: null, month: null, day: null, year: null, a: null, b: null, numeric: false },
          });
        }
      }
    }
    const header = { page: line.page, lineIdx: [idx], y0: line.y, y1: line.y, cols, pitch };
    taken.add(idx);

    // A second header line just above or below may carry the dates.
    for (const dir of [1, -1]) {
      const j = idx + dir;
      const other = lines[j];
      if (!other || other.page !== line.page || taken.has(j)) continue;
      if (Math.abs(other.y - line.y) > 2.6 * Math.max(line.h, hMed)) continue;
      let hits = 0;
      const merged = cols.map((col) => {
        let near = null;
        for (const cell of other.cells) {
          const dist = Math.abs(cell.cx - col.cx);
          if (dist <= pitch / 2 && (!near || dist < near.dist)) near = { cell, dist };
        }
        if (!near) return null;
        const day = bareDay(near.cell);
        const d = day != null ? { day } : headerCell(near.cell);
        if (d) hits++;
        return d;
      });
      if (hits >= Math.max(3, Math.ceil(cols.length / 2))) {
        merged.forEach((d, k) => {
          if (!d) return;
          const p = cols[k].part;
          for (const key of ['dow', 'month', 'day', 'year', 'a', 'b']) {
            if (p[key] == null && d[key] != null) p[key] = d[key];
          }
          if (d.numeric) p.numeric = true;
        });
        header.lineIdx.push(j);
        header.y0 = Math.min(header.y0, other.y);
        header.y1 = Math.max(header.y1, other.y);
        taken.add(j);
      }
    }
    headers.push(header);
  });
  return headers;
}

// Looks for a "Week of ..." style date near the top of the page.
function findAnchors(lines, headerLineSet, refDay, dateOrder) {
  const anchors = [];
  lines.forEach((line, idx) => {
    if (headerLineSet.has(idx)) return;
    const d = findDate(line.text);
    if (!d || (d.month == null && !d.numeric)) return;
    const order = numericOrder([d], dateOrder);
    const date = resolvePart(d, order, refDay);
    if (!date) return;
    const lower = line.text.toLowerCase();
    // A "printed on" date says when the page was made, not which week it covers.
    if (/\b(print(ed)?|generated|created|updated|posted|published|as of|revised|page)\b/.test(lower)) return;
    const isEnd = /\b(week\s*)?end(ing|s)?\b/.test(lower) && !/\b(start|begin|from|of)\b/.test(lower);
    const weight = /\b(week|schedule|period|from|starting|commencing|ending)\b/.test(lower) ? 2 : 1;
    anchors.push({ idx, page: line.page, y: line.y, date, isEnd, weight });
  });
  return anchors;
}

function resolveHeaderDates(header, anchors, opts, refDay, weekIndex) {
  const parts = header.cols.map((c) => c.part);
  const order = numericOrder(parts, opts.dateOrder);
  const hasMonth = parts.some((p) => p.month != null || p.numeric);
  const hasDay = parts.some((p) => p.day != null);

  // The closest date printed above this header, on the same page if possible.
  const above = anchors
    .filter((a) => a.page < header.page || (a.page === header.page && a.y < header.y0))
    .sort((a, b) => (b.page - a.page) || (b.y - a.y));
  const samePage = above.filter((a) => a.page === header.page);
  const pool = samePage.length ? samePage : above;
  // Failing that, a clearly labelled "Week of ..." line lower on the page.
  const below = anchors.filter((a) => a.page === header.page && a.y > header.y1 && a.weight === 2);
  const anchor = pool.find((a) => a.weight === 2) || pool[0] || below[0] || null;

  let ref = refDay;
  if (anchor) ref = toDayNumber(anchor.date);

  if (hasMonth) {
    header.cols.forEach((c) => { c.date = resolvePart(c.part, order, ref); });
  } else if (hasDay) {
    header.cols.forEach((c) => {
      c.date = c.part.day != null ? resolveDayOnly(c.part.day, c.part.dow, ref) : null;
    });
  } else {
    let start = null;
    if (anchor) {
      const usesSamePage = anchor.page === header.page;
      const shift = usesSamePage ? 0 : 7 * weekIndex;
      start = anchor.isEnd ? addDays(anchor.date, -6 + shift) : addDays(anchor.date, shift);
    } else if (opts.weekStart) {
      start = addDays(opts.weekStart, 7 * weekIndex);
    }
    if (!start) {
      header.needsWeekStart = true;
      return;
    }
    const startDay = toDayNumber(start);
    header.cols.forEach((c) => {
      for (let k = 0; k < 7; k++) {
        const s = fromDayNumber(startDay + k);
        if (dowOf(s) === c.part.dow) { c.date = s; break; }
      }
    });
  }

  // Columns of a schedule are days in a row. When most of them agree on
  // that and one or two do not (a date that was misread or missing), the
  // odd ones are set from the rest.
  const dated = header.cols.map((c, i) => (c.date ? toDayNumber(c.date) - i : null));
  const tally = new Map();
  for (const v of dated) if (v != null) tally.set(v, (tally.get(v) || 0) + 1);
  let base = null;
  let votes = 0;
  for (const [v, n] of tally) if (n > votes) { base = v; votes = n; }
  if (header.cols.length >= 4 && votes >= Math.ceil(header.cols.length * 0.6)) {
    header.cols.forEach((c, i) => {
      const inLine = fromDayNumber(base + i);
      if (!c.date) { c.date = inLine; return; }
      if (c.date === inLine) return;
      // Only overrule a date the column itself contradicts: its day name
      // fits the in-line date, or its date is wildly out of range.
      const dow = c.part.dow;
      const far = Math.abs(toDayNumber(c.date) - (base + i)) > 7;
      if ((dow != null && dowOf(inLine) === dow) || (dow == null && far)) c.date = inLine;
    });
  } else {
    // Otherwise fill a gap from the column beside it.
    for (let i = 0; i < header.cols.length; i++) {
      const c = header.cols[i];
      if (c.date) continue;
      const prev = header.cols[i - 1];
      if (prev && prev.date) c.date = addDays(prev.date, 1);
    }
    for (let i = header.cols.length - 1; i >= 0; i--) {
      const c = header.cols[i];
      if (c.date) continue;
      const next = header.cols[i + 1];
      if (next && next.date) c.date = addDays(next.date, -1);
    }
  }
}

function columnIndex(header, cx) {
  const first = header.cols[0].cx - header.pitch / 2;
  const last = header.cols[header.cols.length - 1].cx + header.pitch / 2;
  if (cx < first || cx > last) return -1;
  let best = 0;
  header.cols.forEach((c, i) => {
    if (Math.abs(c.cx - cx) < Math.abs(header.cols[best].cx - cx)) best = i;
  });
  return best;
}

// Splits one line into the name area and the day columns.
function splitLine(header, line) {
  const leftEdge = header.cols[0].cx - header.pitch / 2;
  const nameCells = [];
  const dayParts = []; // { col, x, y, text }
  for (const cell of line.cells) {
    const multi = cell.items.length > 1
      && (cell.x1 - cell.x0 > header.pitch * 1.15 || parseShiftText(cell.text).shifts.length > 1);
    const pieces = multi
      ? cell.items.map((it) => ({ text: cleanText(it.str), x0: it.x, x1: it.x + it.w }))
      : [cell];
    for (const p of pieces) {
      const cx = (p.x0 + p.x1) / 2;
      if (cx < leftEdge) { nameCells.push(p); continue; }
      const col = columnIndex(header, cx);
      if (col >= 0) dayParts.push({ col, x: p.x0, y: line.y, text: p.text });
    }
  }
  return { nameCells, dayParts };
}

function readGrid(header, bodyLines, hMed, query, opts) {
  const nameOpts = { fuzzy: !!opts.fuzzyNames };
  const rows = bodyLines.map((line) => ({ line, ...splitLine(header, line) }));
  const starters = [];
  rows.forEach((row, i) => {
    const text = row.nameCells.map((c) => c.text).join(' ').trim();
    if (text && /[a-z]/i.test(text)) starters.push(i);
  });

  const names = [];
  const matches = [];
  for (const i of starters) {
    const row = rows[i];
    const first = row.nameCells[0].text;
    const joined = row.nameCells.map((c) => c.text).join(' ');
    const two = row.nameCells.slice(0, 2).map((c) => c.text).join(' ');
    let display = first;
    let score = nameScore(query, first, nameOpts);
    for (const cand of [two, joined]) {
      const s = nameScore(query, cand, nameOpts);
      if (s > score) { score = s; display = looksLikeName(two) ? two : first; }
    }
    if (looksLikeName(first)) names.push(looksLikeName(two) && row.nameCells.length > 1 && row.nameCells[1].text.length > 1 && !/\b(csr|teller|manager|cashier|supervisor|lead|clerk|associate|agent|advisor|rep)\b/i.test(row.nameCells[1].text) && row.nameCells[1].x0 - row.nameCells[0].x1 < header.pitch ? two : first);
    if (score > 0) matches.push({ i, score, display });
  }

  // Which lines belong to which person. A cell can hold several lines, and
  // the name may sit beside the first line or be centred against them, so a
  // line with no name goes to the name above it unless it is clearly closer
  // to the name below.
  const owner = new Array(rows.length).fill(-1);
  for (const i of starters) owner[i] = i;
  rows.forEach((row, k) => {
    if (owner[k] !== -1) return;
    let above = -1;
    let below = -1;
    for (const i of starters) {
      if (i < k) above = i;
      else if (i > k && below === -1) below = i;
    }
    const dist = (i) => (i === -1 || rows[i].line.page !== row.line.page ? Infinity : Math.abs(rows[i].line.y - row.line.y));
    const dA = dist(above);
    const dB = dist(below);
    if (dA === Infinity && dB === Infinity) owner[k] = above !== -1 ? above : below;
    else if (dB < 0.6 * dA) owner[k] = below;
    else owner[k] = above !== -1 && dA !== Infinity ? above : below;
  });

  // The text of each day column for one person. If a column holds two
  // separate groups of lines, one above the other with a gap between, the
  // lower group is someone else's cell (their name was not read), so only
  // the group nearest this person's name is kept.
  const collect = (indices, nameY, lineHeight) => {
    const perCol = header.cols.map(() => []);
    for (const k of indices) for (const p of rows[k].dayParts) perCol[p.col].push(p);
    return perCol.map((parts) => {
      parts.sort((x, y) => x.y - y.y || x.x - y.x);
      const groups = [];
      for (const p of parts) {
        const g = groups[groups.length - 1];
        if (g && p.y - g[g.length - 1].y <= 1.75 * lineHeight) g.push(p);
        else groups.push([p]);
      }
      let keep = groups[0] || [];
      let bestDist = Infinity;
      for (const g of groups) {
        const d = Math.min(...g.map((p) => Math.abs(p.y - nameY)));
        if (d < bestDist) { bestDist = d; keep = g; }
      }
      return keep.map((p) => p.text).join(' ');
    });
  };

  const read = (i) => {
    const mine = [];
    owner.forEach((o, k) => { if (o === i) mine.push(k); });
    const nameY = rows[i].line.y;
    const lineHeight = Math.max(rows[i].line.h || 0, hMed);
    let texts = collect(mine, nameY, lineHeight);
    let parsed = texts.map((t) => parseShiftText(t, opts));
    // A time split over two lines ("9:00 AM -" above "5:00 PM") where the
    // second line also carries text in the name column: take that line too.
    const last = mine[mine.length - 1];
    if (!parsed.some((p) => p.shifts.length) && parsed.some((p) => p.dangling) && last + 1 < rows.length) {
      const texts2 = collect([...mine, last + 1], nameY, lineHeight);
      const parsed2 = texts2.map((t) => parseShiftText(t, opts));
      if (parsed2.some((p) => p.shifts.length)) { texts = texts2; parsed = parsed2; }
    }
    const shifts = [];
    parsed.forEach((p, col) => {
      const date = header.cols[col].date;
      if (!date) return;
      for (const sh of p.shifts) shifts.push({ date, ...sh, raw: texts[col] });
    });
    return shifts;
  };

  return { names, matches, read };
}

// Schedules written as a list instead of a grid:
//   - a day heading followed by "Name  9:00 AM - 5:00 PM" lines
//   - a name heading followed by "Mon Nov 16  9:00 - 5:00" lines
//   - one line per shift: "Name  11/16/2026  9:00 AM  5:00 PM"
function readList(lines, query, opts, refDay) {
  const nameOpts = { fuzzy: !!opts.fuzzyNames };
  const names = [];
  const found = [];
  let ctxDate = null; // { part }
  let ctxMine = false;
  let needsWeekStart = false;
  let tableLike = false;
  const partsSeen = [];

  const pending = [];
  for (const line of lines) {
    const text = line.text;
    const d = findDate(text);
    const hasDate = d && (d.month != null || d.numeric || d.dow != null);
    const body = hasDate ? d.rest : text;
    const parsed = parseShiftText(body, opts);

    let mine = false;
    let other = false;
    let mineText = '';
    line.cells.forEach((cell, ci) => {
      const c = hasDate ? (findDate(cell.text) || { rest: cell.text }).rest : cell.text;
      const nameText = cleanText(c.replace(/\d{1,2}([:.]\d{2})?\s*(am|pm|a|p)?\b/gi, ' ').replace(/[-–|,;:]+\s*$/g, ' ').replace(/\b(to|until)\b/gi, ' '));
      if (!nameText) return;
      const lead = nameText.split(/\s{2,}|\s[-|]\s/)[0];
      for (const cand of [nameText, lead]) {
        if (!mine && nameScore(query, cand, nameOpts) > 0) { mine = true; mineText = cand; }
      }
      if (ci === 0 && looksLikeName(lead)) {
        names.push(lead);
        if (nameScore(query, lead, nameOpts) === 0) other = true;
      }
    });
    if (mineText) {
      for (const s of parsed.shifts) {
        s.label = cleanText(s.label.replace(mineText, ' ')).replace(/^[\s,;:|/\-]+|[\s,;:|/\-]+$/g, '');
      }
    }

    // A line carrying several dates is the heading of a table, not the
    // heading of one day. Nothing below it may borrow a date from it.
    const severalDates = hasDate && !!findDate(d.rest);
    if (severalDates) { ctxDate = null; if (!parsed.shifts.length) continue; }
    if (!parsed.shifts.length) {
      if (mine) ctxMine = true;
      else if (other && !hasDate) ctxMine = false;
      if (hasDate && !mine && !other) ctxDate = d;
      else if (hasDate && cleanText(d.rest).length < 3) ctxDate = d;
      continue;
    }
    const part = hasDate ? d : ctxDate;
    const isMine = mine || (ctxMine && !other);
    if (!isMine || !part) continue;
    // One line of a list holds one shift (two for a split shift). More
    // than that means this is a row of a table whose heading was not
    // understood, and its dates cannot be trusted.
    if (parsed.shifts.length > 2) { tableLike = true; continue; }
    partsSeen.push(part);
    pending.push({ part, parsed, raw: text });
  }

  const order = numericOrder(partsSeen, opts.dateOrder);
  for (const p of pending) {
    let date = null;
    if (p.part.month != null || p.part.numeric) date = resolvePart(p.part, order, refDay);
    else if (p.part.day != null) date = resolveDayOnly(p.part.day, p.part.dow, refDay);
    else if (p.part.dow != null) {
      if (!opts.weekStart) { needsWeekStart = true; continue; }
      const start = toDayNumber(opts.weekStart);
      for (let k = 0; k < 7; k++) {
        const s = fromDayNumber(start + k);
        if (dowOf(s) === p.part.dow) { date = s; break; }
      }
    }
    if (!date) continue;
    for (const s of p.parsed.shifts) found.push({ date, ...s, raw: p.raw });
  }
  if (tableLike) return { names, shifts: [], needsWeekStart: false, tableLike: true };
  return { names, shifts: found, needsWeekStart };
}

// Schedules turned on their side: names across the top, one row per day.
function readColumns(lines, query, opts, refDay) {
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i];
    if (head.cells.length < 2) continue;
    const scored = head.cells.map((c) => nameScore(query, c.text, { fuzzy: !!opts.fuzzyNames }));
    const best = Math.max(...scored);
    if (best <= 0) continue;
    if (head.cells.filter((c) => looksLikeName(c.text)).length < 2) continue;
    const mine = head.cells[scored.indexOf(best)];
    const centres = head.cells.map((c) => c.cx);
    const shifts = [];
    const parts = [];
    const rows = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.cells.length) continue;
      const d = findDate(line.cells[0].text, { allowShort: true });
      if (!d || d.rest.replace(/[^a-z0-9]/gi, '').length > 3) {
        if (rows.length) break;
        continue;
      }
      let text = '';
      for (const cell of line.cells.slice(1)) {
        let near = 0;
        centres.forEach((cx, k) => { if (Math.abs(cx - cell.cx) < Math.abs(centres[near] - cell.cx)) near = k; });
        if (head.cells[near] === mine) text += ' ' + cell.text;
      }
      parts.push(d);
      rows.push({ d, text });
    }
    if (rows.length < 2) continue;
    const order = numericOrder(parts, opts.dateOrder);
    let needsWeekStart = false;
    for (const row of rows) {
      let date = null;
      if (row.d.month != null || row.d.numeric) date = resolvePart(row.d, order, refDay);
      else if (row.d.day != null) date = resolveDayOnly(row.d.day, row.d.dow, refDay);
      else if (opts.weekStart) {
        const start = toDayNumber(opts.weekStart);
        for (let k = 0; k < 7; k++) {
          const s = fromDayNumber(start + k);
          if (dowOf(s) === row.d.dow) { date = s; break; }
        }
      } else needsWeekStart = true;
      if (!date) continue;
      row.date = date;
      for (const s of parseShiftText(row.text, opts).shifts) shifts.push({ date, ...s, raw: cleanText(row.text) });
    }
    return {
      shifts,
      needsWeekStart,
      matched: mine.text,
      names: head.cells.map((c) => c.text).filter(looksLikeName),
      covered: rows.map((r) => r.date).filter(Boolean),
    };
  }
  return null;
}

function uniqueNames(list) {
  const seen = new Map();
  for (const n of list) {
    const key = normalizeName(n);
    if (key && !seen.has(key)) seen.set(key, cleanText(n));
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function tidyShifts(shifts) {
  const seen = new Set();
  const out = [];
  for (const s of shifts) {
    const key = `${s.date}|${s.start}|${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return out;
}

// ---------------------------------------------------------------- main

// parseSchedule(items, options)
//   options.name          the name to look for (required)
//   options.today         'YYYY-MM-DD', used to guess a missing year
//   options.weekStart     'YYYY-MM-DD', used when the PDF shows day names only
//   options.dateOrder     'auto' | 'MDY' | 'DMY'
//   options.earliestHour  hours before this are read as pm when am/pm is missing
//   options.fuzzyNames    accept a name that is a letter or two off (for photos)
//   options.cellGap       how far apart words may be and still be one cell (photos use more)
//
// Returns {
//   status: 'ok' | 'empty' | 'name-not-found' | 'ambiguous-name' | 'needs-week-start' | 'no-shifts',
//   layout, shifts, matchedName, candidates, names, coveredDates, lines
// }
export function parseSchedule(items, options = {}) {
  const opts = { dateOrder: 'auto', earliestHour: 6, ...options };
  const query = (opts.name || '').trim();
  const refDay = toDayNumber(opts.today || new Date().toISOString().slice(0, 10));
  const { lines, hMed } = buildLines(items || [], { cellGap: opts.cellGap });
  const result = {
    status: 'empty', layout: null, shifts: [], matchedName: null,
    candidates: [], names: [], coveredDates: [],
    lines: lines.map((l) => ({ page: l.page, text: l.text })),
  };
  if (!lines.length) return result;
  if (!query) { result.status = 'name-not-found'; return result; }

  let allNames = [];

  // 1. Grid: days across the top, one row per person.
  const headers = findHeaders(lines, hMed);
  if (headers.length) {
    const headerLines = new Set(headers.flatMap((h) => h.lineIdx));
    const anchors = findAnchors(lines, headerLines, refDay, opts.dateOrder);
    const grids = headers.map((header, k) => {
      resolveHeaderDates(header, anchors, opts, refDay, k);
      const from = Math.max(...header.lineIdx) + 1;
      const to = k + 1 < headers.length ? Math.min(...headers[k + 1].lineIdx) : lines.length;
      const body = [];
      for (let i = from; i < to; i++) if (!headerLines.has(i)) body.push(lines[i]);
      return { header, ...readGrid(header, body, hMed, query, opts) };
    });
    allNames = grids.flatMap((g) => g.names);
    const all = grids.flatMap((g) => g.matches);
    if (all.length) {
      const top = Math.max(...all.map((m) => m.score));
      const winners = uniqueNames(all.filter((m) => m.score === top).map((m) => m.display));
      if (winners.length > 1) {
        result.status = 'ambiguous-name';
        result.candidates = winners;
        result.names = uniqueNames(allNames);
        result.layout = 'grid';
        return result;
      }
      const need = grids.some((g) => g.header.needsWeekStart && g.matches.some((m) => m.score === top));
      if (need) {
        result.status = 'needs-week-start';
        result.matchedName = winners[0];
        result.layout = 'grid';
        result.names = uniqueNames(allNames);
        return result;
      }
      const shifts = [];
      const covered = new Set();
      for (const g of grids) {
        const mine = g.matches.filter((m) => m.score === top);
        if (!mine.length) continue;
        g.header.cols.forEach((c) => c.date && covered.add(c.date));
        for (const m of mine) shifts.push(...g.read(m.i));
      }
      result.layout = 'grid';
      result.matchedName = winners[0];
      result.names = uniqueNames(allNames);
      result.coveredDates = [...covered].sort();
      result.shifts = tidyShifts(shifts);
      result.status = result.shifts.length ? 'ok' : 'no-shifts';
      return result;
    }
  }

  // 2. Sideways grid: names across the top.
  const cols = readColumns(lines, query, opts, refDay);
  if (cols && (cols.shifts.length || cols.needsWeekStart)) {
    result.layout = 'columns';
    result.matchedName = cols.matched;
    result.names = uniqueNames(cols.names);
    if (cols.needsWeekStart && !cols.shifts.length) { result.status = 'needs-week-start'; return result; }
    result.coveredDates = [...new Set(cols.covered)].sort();
    result.shifts = tidyShifts(cols.shifts);
    result.status = 'ok';
    return result;
  }

  // 3. List.
  const list = readList(lines, query, opts, refDay);
  allNames = allNames.concat(list.names);
  result.names = uniqueNames(allNames);
  if (list.shifts.length) {
    result.layout = 'list';
    result.matchedName = query;
    result.shifts = tidyShifts(list.shifts);
    result.coveredDates = [...new Set(result.shifts.map((s) => s.date))].sort();
    result.status = 'ok';
    return result;
  }
  if (list.needsWeekStart) {
    result.layout = 'list';
    result.matchedName = query;
    result.status = 'needs-week-start';
    return result;
  }
  result.status = 'name-not-found';
  return result;
}
