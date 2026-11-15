// pdf-items.js
// Converts the text that pdf.js reads from a page into the simple
// { str, x, y, w, h, page } items the parser works with.
// Shared by the browser reader and the Node tests.

export function toItems(textContent, pageHeight, pageNumber) {
  const items = [];
  for (const it of textContent.items || []) {
    if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
    const t = it.transform || [1, 0, 0, 1, 0, 0];
    const size = Math.hypot(t[2], t[3]) || it.height || 10;
    items.push({
      str: it.str,
      x: t[4],
      y: pageHeight - t[5], // flip so y grows downward
      w: it.width || 0,
      h: it.height || size,
      page: pageNumber,
    });
  }
  return items;
}

// Reads every page of an open pdf.js document.
export async function readDocumentItems(doc) {
  const all = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    all.push(...toItems(content, viewport.height, n));
  }
  return all;
}
