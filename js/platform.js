// platform.js
// Works out what kind of device the app is running on, so the
// "Add to calendar" screen can lead with the way that works there.

// platformOf(userAgent, touchPoints) -> 'android' | 'ios' | 'other'
export function platformOf(userAgent = '', touchPoints = 0) {
  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPads report themselves as Macs, but Macs have no touch screen.
  if (/macintosh/i.test(ua) && touchPoints > 1) return 'ios';
  return 'other';
}
