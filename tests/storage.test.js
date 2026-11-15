// Tests for saving and loading, including damaged or hostile data.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS, clear, emptyState, load, sanitize, save } from '../js/storage.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    data,
  };
}

test('nothing saved yet gives a clean start', () => {
  const state = load(fakeStorage());
  assert.deepEqual(state, emptyState());
  assert.deepEqual(state.settings, DEFAULT_SETTINGS);
});

test('save then load returns the same thing', () => {
  const storage = fakeStorage();
  const state = emptyState();
  state.settings.name = 'Avery Collins';
  state.shifts.push({ id: 'a1', date: '2026-11-16', start: '09:00', end: '17:00', endsNextDay: false, label: 'Teller', note: '', source: 'pdf', seq: 1, slot: 0, guessed: false, exportedSeq: 1 });
  assert.equal(save(state, storage), true);
  assert.deepEqual(load(storage), state);
});

test('damaged saved data does not break the app', () => {
  assert.deepEqual(load(fakeStorage({ 'shiftcal:v1': '{not json' })), emptyState());
  assert.deepEqual(load(fakeStorage({ 'shiftcal:v1': '"a string"' })), emptyState());
  assert.deepEqual(load(fakeStorage({ 'shiftcal:v1': 'null' })), emptyState());
});

test('a browser that refuses to save is reported, not crashed on', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(save(emptyState(), blocked), false);
  assert.deepEqual(load(blocked), emptyState());
  assert.doesNotThrow(() => clear(blocked));
});

test('bad shifts and bad settings in a backup are dropped', () => {
  const state = sanitize({
    settings: { name: 'x'.repeat(500), theme: 'neon', highlighter: 'red', reminders: [60, -5, 'abc', 60, 999999], earliestHour: 99, weekStartsOn: 3, use24: 'yes', breakMinutes: -10 },
    shifts: [
      { id: 'ok', date: '2026-11-16', start: '09:00', end: '17:00' },
      { id: 'ok', date: '2026-11-17', start: '09:00', end: '17:00' }, // same id twice
      { id: 'bad-date', date: '16/11/2026', start: '09:00', end: '17:00' },
      { id: 'bad-time', date: '2026-11-16', start: '25:00', end: '17:00' },
      { id: 'label', date: '2026-11-18', start: '09:00', end: '17:00', label: 123, source: 'hacker', seq: -4 },
      null, 'text', 42,
    ],
    lastImport: { added: ['ok', 7], changed: [{ id: 'ok', before: { date: 'nope' } }], removed: [{ date: 'x' }], seen: 0 },
  });
  assert.equal(state.settings.name.length, 80);
  assert.equal(state.settings.theme, 'auto');
  assert.equal(state.settings.highlighter, 'yellow');
  assert.deepEqual(state.settings.reminders, [60]);
  assert.equal(state.settings.earliestHour, 6);
  assert.equal(state.settings.weekStartsOn, 0);
  assert.equal(state.settings.use24, false);
  assert.equal(state.settings.breakMinutes, 0);
  assert.deepEqual(state.shifts.map((s) => s.id), ['ok', 'label']);
  assert.equal(state.shifts[1].label, '');
  assert.equal(state.shifts[1].source, 'manual');
  assert.equal(state.shifts[1].seq, 0);
  assert.deepEqual(state.lastImport.added, ['ok']);
  assert.deepEqual(state.lastImport.changed, []);
  assert.deepEqual(state.lastImport.removed, []);
});

test('clear removes the saved data', () => {
  const storage = fakeStorage();
  save(emptyState(), storage);
  clear(storage);
  assert.equal(storage.getItem('shiftcal:v1'), null);
});
