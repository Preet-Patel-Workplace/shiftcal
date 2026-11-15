// Tests for telling Android, iPhone and other devices apart.
import test from 'node:test';
import assert from 'node:assert/strict';

import { platformOf } from '../js/platform.js';

test('Android phones and tablets', () => {
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), 'android');
  assert.equal(platformOf('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'), 'android');
  assert.equal(platformOf('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'), 'android');
});

test('iPhones and iPads', () => {
  assert.equal(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'), 'ios');
  assert.equal(platformOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'), 'ios');
  // an iPad pretending to be a Mac still has a touch screen
  assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5), 'ios');
});

test('computers', () => {
  assert.equal(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 0), 'other');
  assert.equal(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'), 'other');
  assert.equal(platformOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'), 'other');
});

test('missing or odd input', () => {
  assert.equal(platformOf(), 'other');
  assert.equal(platformOf(null), 'other');
  assert.equal(platformOf(''), 'other');
  assert.equal(platformOf(42), 'other');
});
