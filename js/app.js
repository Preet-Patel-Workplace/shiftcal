// app.js
// The screen: dashboard, upload and review, calendar export, settings.
// All page content is built with DOM nodes (never innerHTML), so text read
// from a PDF can never run as code.

import { parseSchedule, addDays, dowOf, toDayNumber } from './parser.js';
import { buildCalendar, googleCalendarUrl } from './ics.js';
import {
  assignSlots, formatCountdown, formatDuration, formatTime, mergeSchedule, newId,
  nextShift, paidMinutes, shiftEnd, shiftMinutes, shiftStart, sortShifts,
  upcoming, weekStartOf, weekTotals,
} from './shifts.js';
import { platformOf } from './platform.js';
import * as store from './storage.js';

const SAMPLE_NAME = 'Alex Sample';
const ROTA_WEEKS = 4;

let state = store.load();
let saveFailed = false;
let rotaOffset = 0; // weeks from the current week
let diagnostics = null; // text of the last schedule read, kept in memory only
let pending = null; // the upload being reviewed
let editingId = null;
let lastDay = todayStr();

// ------------------------------------------------------------ helpers

const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function todayStr(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function asDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const fmtLong = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtMonthDay = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat('en', { month: 'short' });
const fmtDow = new Intl.DateTimeFormat('en', { weekday: 'short' });
const fmtDowLong = new Intl.DateTimeFormat('en', { weekday: 'long' });

function timeRange(shift) {
  const use24 = state.settings.use24;
  return `${formatTime(shift.start, use24)} – ${formatTime(shift.end, use24)}`;
}

function compactTime(time) {
  const [h, m] = time.split(':').map(Number);
  if (state.settings.use24) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'p' : 'a'}`;
}

function persist() {
  saveFailed = !store.save(state);
}

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-on'), 3600);
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
  const title = dialog.querySelector('h2');
  if (title) title.focus();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function confirmDialog(title, text, yesLabel) {
  const dialog = $('dlg-confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-yes').textContent = yesLabel;
  dialog.returnValue = 'no';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    openDialog(dialog);
  });
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

const realShifts = () => state.shifts.filter((s) => s.source !== 'sample');
const hasSample = () => state.shifts.some((s) => s.source === 'sample');
const needsExport = (s) => s.exportedSeq == null || s.exportedSeq !== (s.seq || 0);

// ------------------------------------------------------------ look

function applyLook() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.hl = state.settings.highlighter;
  const dark = state.settings.theme === 'dark'
    || (state.settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1528' : '#f2f4f8');
}

// ------------------------------------------------------------ render

function render() {
  applyLook();
  const welcome = !state.settings.name && state.shifts.length === 0;
  $('view-welcome').hidden = !welcome;
  $('view-dashboard').hidden = welcome;
  $('open-upload').hidden = welcome;
  if (welcome) return;
  renderBanner();
  renderNext();
  renderChanges();
  renderRota();
  renderList();
}

function renderBanner() {
  const box = clearNode($('banner'));
  if (hasSample()) {
    box.append(
      el('p', { text: 'These are sample shifts with made-up names, placed in this week so you can look around.' }),
      el('button', { type: 'button', class: 'btn', onclick: clearSample, text: 'Clear the sample' })
    );
    box.hidden = false;
  } else if (saveFailed) {
    box.append(el('p', { text: 'This browser is not saving your shifts, so they will be gone when you close the page. Private browsing often blocks saving; try a normal window.' }));
    box.hidden = false;
  } else box.hidden = true;
}

function renderNext() {
  const body = clearNode($('next-body'));
  const actions = clearNode($('next-actions'));
  const now = new Date();
  const next = nextShift(state.shifts, now);
  const coming = upcoming(state.shifts, now);
  const today = todayStr(now);

  if (!next) {
    body.append(el('p', {
      class: 'next__empty',
      text: state.shifts.length
        ? 'Nothing coming up. Upload the next schedule when it arrives.'
        : 'No shifts yet. Upload your schedule, as a PDF or a photo, to fill this in.',
    }));
  } else {
    const s = next.shift;
    let day = fmtLong.format(asDate(s.date));
    if (s.date === today) day = `Today, ${fmtMonthDay.format(asDate(s.date))}`;
    else if (s.date === addDays(today, 1)) day = `Tomorrow, ${fmtMonthDay.format(asDate(s.date))}`;
    const meta = el('div', { class: 'next__meta' });
    if (next.onNow) {
      meta.append(el('span', { text: `On shift now. Ends in ${formatCountdown(shiftEnd(s) - now)}.` }));
    } else {
      meta.append(el('span', { text: `Starts in ${formatCountdown(shiftStart(s) - now)}.` }));
    }
    const facts = [formatDuration(shiftMinutes(s))];
    if (s.endsNextDay) facts.push('ends the next day');
    if (s.label) facts.push(s.label);
    if (state.settings.location) facts.push(state.settings.location);
    meta.append(el('span', { class: 'soft', text: facts.join(', ') }));
    body.append(
      el('p', { class: 'next__day', text: day }),
      el('p', { class: 'next__time' }, el('span', { class: 'mark', text: timeRange(s) })),
      meta
    );
  }

  const waiting = coming.filter(needsExport).length;
  if (coming.length) {
    const label = waiting && waiting < coming.length ? `Add to calendar (${waiting} new)` : 'Add to calendar';
    actions.append(el('button', { type: 'button', class: 'btn btn--primary', onclick: openExport, text: label }));
  }
  actions.append(el('button', {
    type: 'button',
    class: coming.length ? 'btn' : 'btn btn--primary',
    onclick: chooseFile,
    text: realShifts().length ? 'Upload a new schedule' : 'Upload schedule',
  }));
  if (!state.shifts.length) {
    actions.append(el('button', { type: 'button', class: 'btn btn--quiet', onclick: loadSample, text: 'Try a sample schedule' }));
  }
}

function describeShift(s) {
  return `${fmtShort.format(asDate(s.date))}, ${timeRange(s)}`;
}

function renderChanges() {
  const box = clearNode($('changes'));
  const li = state.lastImport;
  if (!li || li.seen || !(li.added.length + li.changed.length + li.removed.length) || li.firstUpload) {
    box.hidden = true;
    return;
  }
  const byId = new Map(state.shifts.map((s) => [s.id, s]));
  const list = el('ul');
  for (const id of li.added) {
    const s = byId.get(id);
    if (s) list.append(el('li', {}, el('span', { class: 'tag tag--new', text: 'New' }), el('span', { text: describeShift(s) })));
  }
  for (const c of li.changed) {
    const s = byId.get(c.id);
    if (!s) continue;
    list.append(el('li', {},
      el('span', { class: 'tag tag--changed', text: 'Changed' }),
      el('span', { text: describeShift(s) }),
      el('span', { class: 'was', text: describeShift(c.before) })
    ));
  }
  for (const r of li.removed) {
    list.append(el('li', {},
      el('span', { class: 'tag tag--removed', text: 'Removed' }),
      el('span', { class: 'was', text: describeShift(r) }),
      r.exportedSeq != null ? el('span', { text: 'Delete this one from your calendar yourself.' }) : null
    ));
  }
  if (!list.children.length) { box.hidden = true; return; }
  const buttons = el('div', { class: 'btn-row' });
  if (li.added.length + li.changed.length) {
    buttons.append(el('button', { type: 'button', class: 'btn btn--primary', onclick: openExport, text: 'Add changes to calendar' }));
  }
  buttons.append(el('button', {
    type: 'button', class: 'btn', text: 'Got it',
    onclick: () => { state.lastImport.seen = true; persist(); render(); },
  }));
  box.append(el('h2', { id: 'changes-title', text: 'What changed in the schedule you uploaded' }), list, buttons);
  box.hidden = false;
}

function renderRota() {
  const table = clearNode($('rota-table'));
  const now = new Date();
  const today = todayStr(now);
  const startsOn = state.settings.weekStartsOn;
  const first = addDays(weekStartOf(today, startsOn), rotaOffset * 7);

  const byDate = new Map();
  for (const s of sortShifts(state.shifts)) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  const head = el('tr');
  for (let i = 0; i < 7; i++) {
    const d = asDate(addDays(first, i));
    head.append(el('th', { scope: 'col' }, el('abbr', { title: fmtDowLong.format(d), text: fmtDow.format(d) })));
  }
  table.append(el('thead', {}, head));

  const body = el('tbody');
  for (let w = 0; w < ROTA_WEEKS; w++) {
    const row = el('tr');
    for (let i = 0; i < 7; i++) {
      const date = addDays(first, w * 7 + i);
      const shifts = byDate.get(date) || [];
      const dayNum = Number(date.slice(8));
      const showMonth = dayNum === 1 || (w === 0 && i === 0);
      const classes = ['cell'];
      if (date === today) classes.push('cell--today');
      else if (date < today) classes.push('cell--past');
      const spoken = shifts.length
        ? `${fmtLong.format(asDate(date))}: ${shifts.map(timeRange).join(' and ')}. Edit.`
        : `${fmtLong.format(asDate(date))}: no shift. Add one.`;
      const button = el('button', {
        type: 'button',
        class: classes.join(' '),
        'aria-label': spoken,
        onclick: () => (shifts.length ? openShift(shifts[0]) : openShift(null, date)),
      }, el('span', { class: 'cell__num', text: showMonth ? `${fmtMonthShort.format(asDate(date))} ${dayNum}` : String(dayNum) }));
      if (shifts.length) {
        const from = compactTime(shifts[0].start);
        const to = compactTime(shifts[0].end);
        const long = Math.max(from.length, to.length) > 5;
        button.append(el('span', { class: long ? 'cell__shift cell__shift--long' : 'cell__shift' },
          el('span', { text: from }),
          el('span', { text: to })
        ));
        if (shifts.length > 1) button.append(el('span', { class: 'cell__more', text: `+${shifts.length - 1} more` }));
      }
      row.append(el('td', {}, button));
    }
    body.append(row);
  }
  table.append(body);
  $('rota-today').hidden = rotaOffset === 0;

  // Totals for this week and next.
  const totals = clearNode($('totals'));
  const thisWeek = weekStartOf(today, startsOn);
  const a = weekTotals(state.shifts, thisWeek, state.settings);
  const b = weekTotals(state.shifts, addDays(thisWeek, 7), state.settings);
  const say = (t) => (t.count ? `${t.count} ${t.count === 1 ? 'shift' : 'shifts'}, ${formatDuration(t.minutes)}` : 'no shifts');
  totals.append('This week: ', el('strong', { text: say(a) }), '. Next week: ', el('strong', { text: say(b) }), '.');
  if (state.settings.breakMinutes > 0 && (a.count || b.count)) totals.append(' Unpaid breaks are taken off.');
}

function shiftRow(s, tags) {
  const d = asDate(s.date);
  const sub = el('div', { class: 'shift__sub' });
  sub.append(el('span', { text: formatDuration(paidMinutes(s, state.settings)) }));
  if (s.endsNextDay) sub.append(el('span', { text: 'ends the next day' }));
  if (s.label) sub.append(el('span', { text: s.label }));
  if (tags.get(s.id) === 'new') sub.append(el('span', { class: 'tag tag--new', text: 'New' }));
  if (tags.get(s.id) === 'changed') sub.append(el('span', { class: 'tag tag--changed', text: 'Changed' }));
  return el('div', { class: 'shift' },
    el('div', { class: 'shift__day' },
      el('span', { class: 'shift__dow', text: fmtDow.format(d) }),
      el('span', { class: 'shift__num', text: String(d.getDate()) })
    ),
    el('div', {}, el('div', { class: 'shift__time', text: timeRange(s) }), sub),
    el('button', {
      type: 'button', class: 'btn btn--quiet', text: 'Edit',
      'aria-label': `Edit the shift on ${fmtLong.format(d)}`,
      onclick: () => openShift(s),
    })
  );
}

function renderList() {
  const body = clearNode($('list-body'));
  const now = new Date();
  const today = todayStr(now);
  const startsOn = state.settings.weekStartsOn;
  const thisWeek = weekStartOf(today, startsOn);
  const coming = upcoming(state.shifts, now);

  const tags = new Map();
  const li = state.lastImport;
  if (li && !li.seen && !li.firstUpload) {
    li.added.forEach((id) => tags.set(id, 'new'));
    li.changed.forEach((c) => tags.set(c.id, 'changed'));
  }

  if (!coming.length) {
    body.append(el('p', { class: 'list__empty', text: 'No upcoming shifts. Upload a schedule, or add a shift by hand.' }));
  }
  let group = null;
  for (const s of coming) {
    const wk = weekStartOf(s.date, startsOn);
    if (wk !== group) {
      group = wk;
      let title = `Week of ${fmtMonthDay.format(asDate(wk))}`;
      if (wk === thisWeek) title = 'This week';
      else if (wk === addDays(thisWeek, 7)) title = 'Next week';
      else if (wk < thisWeek) title = 'In progress';
      body.append(el('h3', { text: title }));
    }
    body.append(shiftRow(s, tags));
  }

  const past = sortShifts(state.shifts.filter((s) => shiftEnd(s) <= now)).reverse().slice(0, 30);
  const pastBox = $('past');
  const pastBody = clearNode($('past-body'));
  pastBox.hidden = past.length === 0;
  for (const s of past) pastBody.append(shiftRow(s, new Map()));
}

// ------------------------------------------------------------ upload

function chooseFile() {
  const input = $('file-input');
  input.value = '';
  input.click();
}

function importView(title, bodyNodes, actionNodes) {
  $('import-title').textContent = title;
  clearNode($('import-body')).append(...[bodyNodes].flat().filter(Boolean));
  clearNode($('import-actions')).append(...[actionNodes].flat().filter(Boolean));
  openDialog($('dlg-import'));
}

let importToken = 0; // changes whenever an upload is started or abandoned

function dropPending() {
  if (pending && pending.preview) URL.revokeObjectURL(pending.preview);
  pending = null;
}
const closeImport = () => { importToken++; closeDialog($('dlg-import')); dropPending(); };
const cancelButton = (text = 'Cancel') => el('button', { type: 'button', class: 'btn btn--quiet', onclick: closeImport, text });

// 'pdf', 'image', or null for anything else.
async function fileKind(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/.test(name)) return 'image';
  try {
    const head = new TextDecoder('latin1').decode(new Uint8Array(await file.slice(0, 1024).arrayBuffer()));
    if (head.includes('%PDF-')) return 'pdf';
  } catch { /* unreadable: treated as unknown */ }
  return null;
}

async function startImport(file, options = {}) {
  if (!file) return;
  dropPending();
  const token = ++importToken;
  const busy = el('p', { class: 'busy', text: 'Looking for your shifts\u2026' });
  importView('Reading the schedule', busy, [el('span', { class: 'spacer' }), cancelButton()]);
  const say = (text) => { busy.textContent = text; };
  const percent = (p) => `${Math.max(0, Math.min(100, Math.round(p * 100)))}%`;
  let preview = null;
  try {
    const kind = await fileKind(file);
    if (!kind) {
      throw Object.assign(new Error('That file is not a PDF or a picture. Choose the schedule PDF, or a photo or screenshot of the schedule.'), { code: 'bad-type' });
    }
    let items;
    let source = 'pdf';
    if (kind === 'pdf') {
      const { readPdf } = await import('./pdf-reader.js');
      const out = await readPdf(await file.arrayBuffer(), {
        onScanned: () => say('This PDF is a scan. Reading it as a picture, which takes longer\u2026'),
        onProgress: (p) => say(`Reading the scanned pages\u2026 ${percent(p)}`),
      });
      items = out.items;
      if (out.scanned) source = 'photo';
    } else {
      say('Reading the photo. The first time can take up to a minute\u2026');
      const { readPhoto } = await import('./photo-reader.js');
      const out = await readPhoto(file, (p) => say(`Reading the photo\u2026 ${percent(p)}`));
      items = out.items;
      source = 'photo';
      preview = URL.createObjectURL(file);
    }
    if (token !== importToken) { if (preview) URL.revokeObjectURL(preview); return; } // cancelled meanwhile
    pending = {
      items,
      source,
      preview,
      fileName: file.name || (kind === 'image' ? 'photo' : 'schedule.pdf'),
      name: options.name || state.settings.name,
      weekStart: options.weekStart || null,
      sample: !!options.sample,
    };
    runParse();
  } catch (err) {
    if (preview) URL.revokeObjectURL(preview);
    if (token !== importToken) return;
    pending = null;
    const message = err && err.code ? err.message : 'This file could not be read. Check that it is the schedule PDF or a clear photo of it, and try again.';
    importView('That file did not open', el('p', { text: message }), [
      el('span', { class: 'spacer' }),
      cancelButton('Close'),
      el('button', { type: 'button', class: 'btn btn--primary', onclick: chooseFile, text: 'Choose another file' }),
    ]);
  }
}

const PHOTO_TIPS = 'For a photo: hold the phone straight above the page, in good light, with the whole table sharp and filling the picture. A screenshot or the original PDF reads best.';

function runParse() {
  if (!pending) return;
  if (!pending.name) return askName();
  const photo = pending.source === 'photo';
  const result = parseSchedule(pending.items, {
    name: pending.name,
    today: todayStr(),
    weekStart: pending.weekStart,
    dateOrder: state.settings.dateOrder,
    earliestHour: state.settings.earliestHour,
    // Text read from a picture has slips in it: allow a name that is a
    // letter off, and words spaced a little wider apart.
    fuzzyNames: photo,
    cellGap: photo ? 0.85 : undefined,
  });
  diagnostics = { fileName: pending.fileName, lines: result.lines };
  pending.result = result;

  if (result.status === 'empty') {
    return importView(photo ? 'No text could be read' : 'No text in this PDF', [
      el('p', { text: photo ? 'ShiftCal could not make out any text in this picture.' : 'This PDF has no text in it that ShiftCal can read.' }),
      el('p', { text: PHOTO_TIPS }),
    ], [
      el('button', { type: 'button', class: 'btn btn--quiet', text: 'Add a shift by hand', onclick: () => { closeImport(); openShift(null); } }),
      el('span', { class: 'spacer' }),
      cancelButton('Close'),
      el('button', { type: 'button', class: 'btn btn--primary', onclick: chooseFile, text: 'Choose another file' }),
    ]);
  }
  if (result.status === 'ambiguous-name') {
    return pickName(`More than one person matches “${pending.name}”`, 'Which one is you?', result.candidates);
  }
  if (result.status === 'name-not-found') {
    if (result.names.length) {
      return pickName(`“${pending.name}” is not on this schedule`, 'Pick your name from the people listed:', result.names);
    }
    return importView('Could not find your shifts', [
      el('p', { text: `ShiftCal read the ${photo ? 'picture' : 'PDF'} but could not find \u201c${pending.name}\u201d or a layout it recognises.` }),
      el('p', { text: photo ? PHOTO_TIPS : 'Check the spelling of your name in Settings. If it is right, this schedule is laid out in a way ShiftCal cannot read yet, and you can add shifts by hand.' }),
      photo ? el('p', { text: 'Also check the spelling of your name in Settings.' }) : null,
    ], [
      el('span', { class: 'spacer' }),
      cancelButton('Close'),
      el('button', { type: 'button', class: 'btn btn--primary', text: 'Open Settings', onclick: () => { closeImport(); openSettings(); } }),
    ]);
  }
  if (result.status === 'needs-week-start') return askWeek();
  return review();
}

function askName() {
  const input = el('input', { type: 'text', id: 'import-name', maxlength: '80', autocomplete: 'name' });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true, text: 'Type your name so ShiftCal knows which row is yours.' });
  const go = () => {
    const name = input.value.trim();
    if (!name) { error.hidden = false; input.focus(); return; }
    if (!pending.sample) { state.settings.name = name; persist(); }
    pending.name = name;
    runParse();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  importView('Whose shifts?', [
    el('div', { class: 'field' }, el('label', { for: 'import-name', text: 'Your name, as it appears on the schedule' }), input),
    error,
  ], [
    el('span', { class: 'spacer' }),
    cancelButton(),
    el('button', { type: 'button', class: 'btn btn--primary', onclick: go, text: 'Find my shifts' }),
  ]);
  input.focus();
}

function pickName(title, lead, names) {
  const list = el('ul', { class: 'pick' });
  for (const name of names) {
    list.append(el('li', {}, el('button', {
      type: 'button', text: name,
      onclick: () => {
        pending.name = name;
        // a name read from a photo may be misspelt, so it is not kept
        if (!pending.sample && pending.source !== 'photo') { state.settings.name = name; persist(); }
        runParse();
      },
    })));
  }
  const note = pending.source === 'photo'
    ? el('p', { class: 'hint', text: 'Names read from a photo can come out misspelt. Pick the one that is yours.' })
    : null;
  importView(title, [el('p', { text: lead }), note, list], [el('span', { class: 'spacer' }), cancelButton()]);
}

function askWeek() {
  const startsOn = state.settings.weekStartsOn;
  const thisWeek = weekStartOf(todayStr(), startsOn);
  const input = el('input', { type: 'date', id: 'import-week', value: thisWeek });
  const error = el('p', { class: 'field-error', role: 'alert', hidden: true, text: 'Choose the first day of the week this schedule covers.' });
  const go = (value) => {
    const v = value || input.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { error.hidden = false; return; }
    pending.weekStart = v;
    runParse();
  };
  importView('Which week is this schedule for?', [
    el('p', { text: 'This schedule shows day names but no dates, so ShiftCal needs to know the week.' }),
    el('div', { class: 'btn-row' },
      el('button', { type: 'button', class: 'btn', onclick: () => go(thisWeek), text: `This week (from ${fmtShort.format(asDate(thisWeek))})` }),
      el('button', { type: 'button', class: 'btn', onclick: () => go(addDays(thisWeek, 7)), text: `Next week (from ${fmtShort.format(asDate(addDays(thisWeek, 7)))})` })
    ),
    el('div', { class: 'field' }, el('label', { for: 'import-week', text: 'Or pick the first day of that week' }), input),
    error,
  ], [
    el('span', { class: 'spacer' }),
    cancelButton(),
    el('button', { type: 'button', class: 'btn btn--primary', onclick: () => go(), text: 'Use this date' }),
  ]);
}

function review() {
  const result = pending.result;
  const today = todayStr();
  const base = pending.sample ? [] : realShifts();
  const merge = mergeSchedule(base, result.shifts, result.coveredDates);
  pending.merge = merge;
  const firstUpload = base.filter((s) => s.source === 'pdf').length === 0;
  pending.firstUpload = firstUpload;

  const changedById = new Map(merge.changed.map((c) => [c.after.id, c.before]));
  const addedIds = new Set(merge.added.map((s) => s.id));
  const incomingKeys = new Set(result.shifts.map((s) => `${s.date}|${s.start}|${s.end}`));
  const shown = merge.shifts.filter((s) => incomingKeys.has(`${(s.orig || s).date}|${(s.orig || s).start}|${(s.orig || s).end}`) && s.source === 'pdf');

  const nodes = [];
  if (pending.source === 'photo') {
    nodes.push(el('p', { class: 'notice notice--check', text: 'Read from a picture, so a time or a day can be wrong or missing. Check every shift against it before saving.' }));
    if (pending.preview) {
      nodes.push(el('details', { class: 'photo', open: true },
        el('summary', { text: 'Your photo' }),
        el('div', { class: 'photo__frame', tabindex: '0' }, el('img', { src: pending.preview, alt: 'The schedule photo you uploaded' }))
      ));
    }
  }
  const who = (pending.source === 'photo' ? pending.name : result.matchedName) || result.matchedName || pending.name;
  const dates = result.coveredDates;
  const span = dates.length ? `${fmtShort.format(asDate(dates[0]))} to ${fmtShort.format(asDate(dates[dates.length - 1]))}` : '';
  const count = result.shifts.length;
  nodes.push(el('p', {
    text: count
      ? `${count} ${count === 1 ? 'shift' : 'shifts'} for ${who}${span ? `, ${span}` : ''}.`
      : `${who} is on this schedule${span ? ` (${span})` : ''} with no shifts.`,
  }));

  const list = el('ul', { class: 'review' });
  for (const s of shown) {
    const item = el('li', {}, el('span', { class: 'when', text: fmtShort.format(asDate(s.date)) }), el('span', { text: timeRange(s) }));
    if (s.endsNextDay) item.append(el('span', { class: 'hint', text: 'ends the next day' }));
    if (s.label) item.append(el('span', { class: 'hint', text: s.label }));
    if (!firstUpload && addedIds.has(s.id)) item.append(el('span', { class: 'tag tag--new', text: 'New' }));
    if (changedById.has(s.id)) {
      item.append(el('span', { class: 'tag tag--changed', text: 'Changed' }), el('span', { class: 'was', text: timeRange(changedById.get(s.id)) }));
    }
    if (s.guessed) item.append(el('span', { class: 'tag tag--check', text: 'Check time' }));
    list.append(item);
  }
  for (const r of merge.removed) {
    list.append(el('li', {},
      el('span', { class: 'when gone', text: fmtShort.format(asDate(r.date)) }),
      el('span', { class: 'gone', text: timeRange(r) }),
      el('span', { class: 'tag tag--removed', text: 'Removed' })
    ));
  }
  if (list.children.length) nodes.push(list);

  if (shown.some((s) => s.guessed)) {
    nodes.push(el('p', { class: 'hint', text: 'This schedule leaves out am and pm, so ShiftCal worked them out. If a time is wrong, change "Earliest a shift starts" in Settings, or edit the shift after saving.' }));
  }
  if (count && result.shifts.every((s) => s.date < addDays(today, -1))) {
    nodes.push(el('p', { class: 'field-error', text: 'All of these dates are in the past. If that is not right, this may be an old schedule.' }));
  }

  const nothingNew = merge.added.length + merge.changed.length + merge.removed.length === 0;
  const actions = [];
  if (pending.weekStart) {
    actions.push(el('button', { type: 'button', class: 'btn btn--quiet', text: 'Change the week', onclick: () => { pending.weekStart = null; askWeek(); } }));
  }
  actions.push(el('span', { class: 'spacer' }));
  if (nothingNew && !pending.sample) {
    nodes.push(el('p', { text: 'Nothing has changed since your last upload.' }));
    actions.push(el('button', { type: 'button', class: 'btn btn--primary', onclick: closeImport, text: 'Done' }));
  } else {
    actions.push(cancelButton());
    actions.push(el('button', { type: 'button', class: 'btn btn--primary', onclick: commitImport, text: count ? 'Save shifts' : 'Save changes' }));
  }
  importView(pending.sample ? 'Sample schedule' : 'Check your shifts', nodes, actions);
}

function commitImport() {
  if (!pending || !pending.merge) return;
  const { merge, sample, fileName, firstUpload } = pending;
  if (sample) {
    state.shifts = merge.shifts.map((s) => ({ ...s, source: 'sample' }));
    state.lastImport = null;
  } else {
    state.shifts = merge.shifts;
    state.lastImport = {
      at: new Date().toISOString(),
      fileName,
      added: merge.added.map((s) => s.id),
      changed: merge.changed.map((c) => ({
        id: c.after.id,
        before: { date: c.before.date, start: c.before.start, end: c.before.end, endsNextDay: !!c.before.endsNextDay },
      })),
      removed: merge.removed,
      seen: false,
      firstUpload,
    };
  }
  persist();
  closeImport();
  rotaOffset = 0;
  render();
  const n = merge.added.length + merge.changed.length;
  if (sample) toast('Sample shifts loaded');
  else if (n) {
    toast(`Saved ${n} ${n === 1 ? 'shift' : 'shifts'}`);
    if (upcoming(state.shifts).some(needsExport)) openExport();
  } else toast('Schedule saved');
}

async function loadSample() {
  importView('Reading the schedule', el('p', { class: 'busy', text: 'Opening the sample…' }), []);
  try {
    const response = await fetch('sample/sample-schedule.pdf');
    if (!response.ok) throw new Error('missing');
    const blob = await response.blob();
    const file = new File([blob], 'sample-schedule.pdf', { type: 'application/pdf' });
    await startImport(file, { name: SAMPLE_NAME, weekStart: weekStartOf(todayStr(), 0), sample: true });
  } catch {
    importView('The sample did not load', el('p', { text: 'The sample schedule could not be opened. Check your connection and try again.' }), [el('span', { class: 'spacer' }), cancelButton('Close')]);
  }
}

function clearSample() {
  state.shifts = realShifts();
  persist();
  render();
  toast('Sample cleared');
}

// ------------------------------------------------------------ calendar export

function openExport() {
  const now = new Date();
  const coming = upcoming(realShifts().length ? realShifts() : state.shifts, now);
  const fresh = coming.filter(needsExport);
  const body = clearNode($('export-body'));
  const actions = clearNode($('export-actions'));
  const dialog = $('dlg-export');
  const close = () => closeDialog(dialog);

  if (!coming.length) {
    body.append(el('p', { text: 'There are no upcoming shifts to add.' }));
    actions.append(el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'btn btn--primary', onclick: close, text: 'Close' }));
    return openDialog(dialog);
  }

  // Google Calendar on Android only takes the first shift from a calendar
  // file, so Android leads with one button per shift.
  const android = platformOf(navigator.userAgent, navigator.maxTouchPoints) === 'android';

  // ---- one shift at a time (a Google Calendar link per shift)
  const oneByOne = () => {
    const list = el('ul', { class: 'addlist' });
    for (const s of coming) {
      const status = el('span', { class: 'addlist__state' });
      const link = el('a', { target: '_blank', rel: 'noopener noreferrer', href: googleCalendarUrl(s, state.settings) });
      const item = el('li', {},
        el('span', { class: 'addlist__when' },
          el('strong', { text: fmtShort.format(asDate(s.date)) }),
          el('span', { text: timeRange(s) })
        ),
        status,
        link
      );
      const paint = () => {
        const added = !needsExport(s);
        link.textContent = added ? 'Add again' : 'Add';
        link.className = added ? 'btn btn--quiet' : 'btn btn--primary';
        link.setAttribute('aria-label', `${added ? 'Add again' : 'Add'}: ${describeShift(s)}`);
        status.textContent = added ? 'Added' : '';
        item.classList.toggle('is-added', added);
      };
      link.addEventListener('click', () => {
        s.exportedSeq = s.seq || 0;
        persist();
        paint();
      });
      paint();
      list.append(item);
    }
    return [
      el('p', { text: 'Tap Add, then press Save in Google Calendar. Repeat for each shift.' }),
      list,
      el('p', { class: 'hint', text: 'Shifts added this way get your Google Calendar default notification, not the reminders set in ShiftCal.' }),
    ];
  };

  // ---- all at once (one calendar file)
  let mode = fresh.length && fresh.length < coming.length ? 'fresh' : 'all';
  const build = () => {
    const chosen = mode === 'fresh' ? fresh : coming;
    const ics = buildCalendar(chosen, state.settings, new Date());
    return { chosen, ics, fileName: `shifts-${chosen[0].date}.ics` };
  };
  const done = (chosen, message) => {
    const ids = new Set(chosen.map((s) => s.id));
    for (const s of state.shifts) if (ids.has(s.id)) s.exportedSeq = s.seq || 0;
    persist();
    close();
    toast(message);
  };
  const downloadButton = (cls) => el('button', {
    type: 'button', class: cls, text: 'Download calendar file',
    onclick: () => {
      const { chosen, ics, fileName } = build();
      downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), fileName);
      done(chosen, 'Calendar file downloaded');
    },
  });
  const allAtOnce = () => {
    const nodes = [];
    if (fresh.length && fresh.length < coming.length) {
      const option = (value, title, note) => el('label', { class: 'choice' },
        el('input', { type: 'radio', name: 'export-mode', value, checked: mode === value, onchange: () => { mode = value; } }),
        el('span', {}, el('strong', { text: title }), el('small', { text: note }))
      );
      nodes.push(
        option('fresh', `New and changed shifts (${fresh.length})`, 'The ones your calendar does not have yet.'),
        option('all', `All upcoming shifts (${coming.length})`, 'Use this for a calendar that has none of them.')
      );
    } else if (!fresh.length) {
      nodes.push(el('p', { text: `All ${coming.length} upcoming ${coming.length === 1 ? 'shift is' : 'shifts are'} marked as added. Download the file again if you need them on another calendar.` }));
    } else if (!android) {
      nodes.push(el('p', { text: `${coming.length} upcoming ${coming.length === 1 ? 'shift' : 'shifts'}, ready for your calendar.` }));
    }
    if (android) {
      nodes.push(
        el('p', { text: 'Opening the file on this phone adds only the first shift. Import it on the Google Calendar website to get them all:' }),
        el('ol', { class: 'steps' },
          el('li', { text: 'Download the calendar file.' }),
          el('li', { text: 'Open calendar.google.com in Chrome, and turn on "Desktop site" in the Chrome menu.' }),
          el('li', { text: 'Tap the gear, then Settings, then Import & export.' }),
          el('li', { text: 'Choose the downloaded file and tap Import.' })
        )
      );
    } else {
      nodes.push(el('ol', { class: 'steps' },
        el('li', { text: 'Download the calendar file.' }),
        el('li', { text: 'Open it. Your calendar app offers to add the shifts.' }),
        el('li', { text: 'Confirm, and the shifts and reminders are in.' })
      ));
    }
    return nodes;
  };

  if (android) {
    body.append(
      ...oneByOne(),
      el('details', { class: 'more' },
        el('summary', { text: 'Add them all at once instead' }),
        ...allAtOnce(),
        el('div', { class: 'btn-row' }, downloadButton('btn'))
      )
    );
  } else {
    body.append(
      ...allAtOnce(),
      el('details', { class: 'more' },
        el('summary', { text: 'Using Google Calendar on an Android phone?' }),
        el('p', { text: 'Google Calendar on Android adds only the first shift from a calendar file. Add the shifts one at a time instead.' }),
        ...oneByOne()
      )
    );
  }

  const removed = state.lastImport && !state.lastImport.seen
    ? state.lastImport.removed.filter((r) => r.exportedSeq != null)
    : [];
  if (removed.length) {
    body.append(el('p', { class: 'hint', text: `Adding shifts cannot delete old ones. Remove these from your calendar yourself: ${removed.map(describeShift).join('; ')}.` }));
  }

  actions.append(el('span', { class: 'spacer' }));
  if (android) {
    actions.append(el('button', { type: 'button', class: 'btn btn--primary', onclick: close, text: 'Done' }));
  } else {
    actions.append(el('button', { type: 'button', class: 'btn btn--quiet', onclick: close, text: 'Not now' }));
    const probe = typeof File === 'function' ? new File(['x'], 'shifts.ics', { type: 'text/calendar' }) : null;
    if (probe && navigator.canShare && navigator.canShare({ files: [probe] })) {
      actions.append(el('button', {
        type: 'button', class: 'btn', text: 'Share to an app',
        onclick: async () => {
          const { chosen, ics, fileName } = build();
          try {
            await navigator.share({ files: [new File([ics], fileName, { type: 'text/calendar' })], title: 'Work shifts' });
            done(chosen, 'Shifts shared');
          } catch (err) {
            if (!err || err.name !== 'AbortError') toast('Sharing did not work. Use Download instead.');
          }
        },
      }));
    }
    actions.append(downloadButton('btn btn--primary'));
  }
  // Whatever was added, the dashboard is brought up to date on closing.
  dialog.addEventListener('close', render, { once: true });
  openDialog(dialog);
}

// ------------------------------------------------------------ one shift

function openShift(shift, presetDate) {
  editingId = shift ? shift.id : null;
  $('shift-title').textContent = shift ? 'Edit shift' : 'Add a shift';
  $('shift-date').value = shift ? shift.date : presetDate || todayStr();
  $('shift-start').value = shift ? shift.start : '09:00';
  $('shift-end').value = shift ? shift.end : '17:00';
  $('shift-label').value = shift ? shift.label || '' : '';
  $('shift-note').value = shift ? shift.note || '' : '';
  $('shift-delete').hidden = !shift;
  $('shift-error').hidden = true;
  updateOvernightHint();

  $('shift-google-wrap').hidden = !shift;
  if (shift) $('shift-google').href = googleCalendarUrl(shift, state.settings);
  openDialog($('dlg-shift'));
}

function updateOvernightHint() {
  const start = $('shift-start').value;
  const end = $('shift-end').value;
  $('shift-overnight').hidden = !(start && end && end < start);
}

function saveShift(event) {
  event.preventDefault();
  const date = $('shift-date').value;
  const start = $('shift-start').value.slice(0, 5);
  const end = $('shift-end').value.slice(0, 5);
  const error = $('shift-error');
  const fail = (message) => { error.textContent = message; error.hidden = false; };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Choose the date of the shift.');
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return fail('Fill in both the start and the end time.');
  if (start === end) return fail('The start and end times are the same. Change one of them.');
  const fields = {
    date, start, end,
    endsNextDay: end < start,
    label: $('shift-label').value.trim().slice(0, 60),
    note: $('shift-note').value.trim().slice(0, 500),
  };
  const existing = editingId ? state.shifts.find((s) => s.id === editingId) : null;
  if (existing) {
    const moved = existing.date !== date || existing.start !== start || existing.end !== end;
    if (moved && existing.source === 'pdf' && !existing.orig) {
      existing.orig = { date: existing.date, start: existing.start, end: existing.end, endsNextDay: !!existing.endsNextDay };
    }
    if (existing.date !== date) existing.slot = null;
    Object.assign(existing, fields, { seq: (existing.seq || 0) + 1, guessed: false });
  } else {
    state.shifts.push({ id: newId(), ...fields, source: 'manual', seq: 0, slot: null, guessed: false, exportedSeq: null });
  }
  assignSlots(state.shifts);
  state.shifts = sortShifts(state.shifts);
  persist();
  closeDialog($('dlg-shift'));
  render();
  toast(existing ? 'Shift saved' : 'Shift added');
}

async function deleteShift() {
  const shift = state.shifts.find((s) => s.id === editingId);
  if (!shift) return closeDialog($('dlg-shift'));
  const ok = await confirmDialog('Delete this shift?', `${describeShift(shift)} will be removed from ShiftCal.`, 'Delete shift');
  if (!ok) return;
  state.shifts = state.shifts.filter((s) => s.id !== shift.id);
  persist();
  closeDialog($('dlg-shift'));
  render();
  toast(shift.exportedSeq != null ? 'Shift deleted. Remove it from your calendar too.' : 'Shift deleted');
}

// ------------------------------------------------------------ settings

function openSettings() {
  const s = state.settings;
  $('set-name').value = s.name;
  $('set-title').value = s.eventTitle;
  $('set-location').value = s.location;
  for (const box of $('set-reminders').querySelectorAll('input')) box.checked = s.reminders.includes(Number(box.value));
  $('set-break').value = s.breakMinutes;
  $('set-break-after').value = s.breakAfterHours;
  $('set-date-order').value = s.dateOrder;
  $('set-earliest').value = String(s.earliestHour);
  for (const radio of $('set-highlighter').querySelectorAll('input')) radio.checked = radio.value === s.highlighter;
  $('set-theme').value = s.theme;
  $('set-clock').value = s.use24 ? '24' : '12';
  $('set-week').value = String(s.weekStartsOn);
  $('data-msg').hidden = true;
  $('diag-group').hidden = !diagnostics;
  if (diagnostics) {
    $('diag-text').textContent = `${diagnostics.fileName}\n\n${diagnostics.lines.map((l) => `p${l.page}: ${l.text}`).join('\n')}`;
  }
  openDialog($('dlg-settings'));
}

function readSettings() {
  const raw = {
    ...state.settings,
    name: $('set-name').value.trim(),
    eventTitle: $('set-title').value.trim() || 'Work shift',
    location: $('set-location').value.trim(),
    reminders: [...$('set-reminders').querySelectorAll('input:checked')].map((b) => Number(b.value)),
    breakMinutes: Number($('set-break').value) || 0,
    breakAfterHours: Number($('set-break-after').value) || 0,
    dateOrder: $('set-date-order').value,
    earliestHour: Number($('set-earliest').value),
    highlighter: ($('set-highlighter').querySelector('input:checked') || {}).value || 'yellow',
    theme: $('set-theme').value,
    use24: $('set-clock').value === '24',
    weekStartsOn: Number($('set-week').value),
  };
  const before = state.settings;
  state.settings = store.sanitize({ settings: raw }).settings;
  // The calendar file carries the title, place and reminders, so shifts
  // already downloaded need to go out again when those change.
  const eventChanged = before.eventTitle !== state.settings.eventTitle
    || before.location !== state.settings.location
    || before.reminders.join() !== state.settings.reminders.join();
  if (eventChanged) for (const s of state.shifts) if (s.exportedSeq != null) s.seq = (s.seq || 0) + 1;
  persist();
  render();
}

function dataMessage(text) {
  const node = $('data-msg');
  node.textContent = text;
  node.hidden = false;
}

function backup() {
  const copy = { app: 'ShiftCal', savedAt: new Date().toISOString(), ...state };
  downloadBlob(new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' }), `shiftcal-backup-${todayStr()}.json`);
  toast('Backup downloaded');
}

async function restore(file) {
  if (!file) return;
  let data;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('big');
    data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !Array.isArray(data.shifts) || typeof data.settings !== 'object') throw new Error('shape');
  } catch {
    return dataMessage('That file is not a ShiftCal backup.');
  }
  const next = store.sanitize(data);
  const ok = await confirmDialog('Replace what is here?', `The backup has ${next.shifts.length} ${next.shifts.length === 1 ? 'shift' : 'shifts'}. Everything in ShiftCal now is replaced by it.`, 'Restore backup');
  if (!ok) return;
  state = next;
  persist();
  closeDialog($('dlg-settings'));
  render();
  toast('Backup restored');
}

async function clearShifts() {
  const ok = await confirmDialog('Delete all shifts?', 'Every shift saved in ShiftCal is removed. Your calendar is not touched. Settings stay.', 'Delete all shifts');
  if (!ok) return;
  state.shifts = [];
  state.lastImport = null;
  persist();
  render();
  dataMessage('All shifts deleted.');
}

async function resetAll() {
  const ok = await confirmDialog('Reset ShiftCal?', 'Your name, settings and every shift are removed from this browser. Your calendar is not touched.', 'Reset ShiftCal');
  if (!ok) return;
  store.clear();
  state = store.emptyState();
  diagnostics = null;
  closeDialog($('dlg-settings'));
  render();
  toast('ShiftCal reset');
}

// ------------------------------------------------------------ wiring

function wire() {
  $('welcome-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('welcome-name').value.trim();
    $('welcome-error').hidden = !!name;
    if (!name) return $('welcome-name').focus();
    state.settings.name = name;
    persist();
    render();
    chooseFile();
  });
  $('welcome-sample').addEventListener('click', loadSample);

  $('open-upload').addEventListener('click', chooseFile);
  $('open-settings').addEventListener('click', openSettings);
  $('file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = ''; // so choosing the same file again still works
    startImport(file);
  });
  $('add-shift').addEventListener('click', () => openShift(null));

  $('rota-prev').addEventListener('click', () => { rotaOffset -= ROTA_WEEKS; renderRota(); });
  $('rota-next').addEventListener('click', () => { rotaOffset += ROTA_WEEKS; renderRota(); });
  $('rota-today').addEventListener('click', () => { rotaOffset = 0; renderRota(); });

  $('shift-form').addEventListener('submit', saveShift);
  $('shift-cancel').addEventListener('click', () => closeDialog($('dlg-shift')));
  $('shift-delete').addEventListener('click', deleteShift);
  $('shift-start').addEventListener('input', updateOvernightHint);
  $('shift-end').addEventListener('input', updateOvernightHint);

  const settingsForm = $('settings-form');
  settingsForm.addEventListener('submit', (event) => { event.preventDefault(); readSettings(); closeDialog($('dlg-settings')); });
  settingsForm.addEventListener('change', (event) => {
    if (event.target.id === 'restore-input') return;
    readSettings();
  });
  $('restore-input').addEventListener('click', (event) => event.stopPropagation());
  $('data-backup').addEventListener('click', backup);
  $('data-restore').addEventListener('click', () => { $('restore-input').value = ''; $('restore-input').click(); });
  $('restore-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    restore(file);
  });
  $('data-clear-shifts').addEventListener('click', clearShifts);
  $('data-reset').addEventListener('click', resetAll);

  $('dlg-import').addEventListener('close', (event) => {
    // The close event arrives a moment late. If a new upload has already
    // reopened the dialog, this close belongs to the old one: leave it be.
    if (event.target.open) return;
    importToken++;
    dropPending();
  });
  $('import-form').addEventListener('submit', (event) => event.preventDefault());

  // Tapping the dark area around a dialog closes it.
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && dialog.id !== 'dlg-confirm') dialog.close();
    });
  }

  // Drag a PDF or a photo onto the page (desktop).
  let dragDepth = 0;
  const hasFiles = (event) => event.dataTransfer && [...event.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (event) => { if (hasFiles(event)) { dragDepth++; $('drop').hidden = false; } });
  window.addEventListener('dragleave', (event) => { if (hasFiles(event)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop').hidden = true; } });
  window.addEventListener('dragover', (event) => { if (hasFiles(event)) event.preventDefault(); });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    $('drop').hidden = true;
    startImport(event.dataTransfer.files[0]);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLook);

  // Keep the countdown fresh, and redraw everything when the day changes.
  setInterval(() => {
    if ($('view-dashboard').hidden) return;
    const today = todayStr();
    if (today !== lastDay) { lastDay = today; render(); } else renderNext();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  // Another tab changed the saved shifts: show the newer version.
  window.addEventListener('storage', (event) => {
    if (event.key && !event.key.startsWith('shiftcal')) return;
    if (document.querySelector('dialog[open]')) return;
    state = store.load();
    render();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline use is optional */ });
  }
}

// The storage probe: find out early if this browser refuses to save.
saveFailed = !store.save(state);
wire();
render();
