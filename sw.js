// sw.js
// Lets ShiftCal open with no connection. It always tries the network first,
// so an update you publish shows up straight away; the saved copy is only
// used when the network is not there.

const CACHE = 'shiftcal-v3';
// The photo reader (about 7 MB) is left out of this list on purpose: it is
// saved for offline use the first time someone actually reads a photo.
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/parser.js',
  'js/ics.js',
  'js/shifts.js',
  'js/storage.js',
  'js/pdf-items.js',
  'js/pdf-reader.js',
  'js/platform.js',
  'js/ocr-items.js',
  'js/image-prep.js',
  'js/photo-reader.js',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
  'fonts/bricolage-grotesque-latin.woff2',
  'fonts/bricolage-grotesque-latin-ext.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'manifest.webmanifest',
  'sample/sample-schedule.pdf',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const page = await caches.match('index.html');
          if (page) return page;
        }
        return Response.error();
      })
  );
});
