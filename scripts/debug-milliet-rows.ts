// Debug : affiche les rows brutes extraites du PDF Milliet pour voir les positions
import * as fs from 'fs';
import * as path from 'path';

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

async function main() {
  const file = path.join(__dirname, '../tmp-milliet-pdfs/milliet-1-26014991.pdf');
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    console.log(`\n=== PAGE ${i} ===`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .map((it: any) => ({
        str: (it.str || '').trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
      }))
      .filter((it) => it.str);

    // Grouper par Y (±3px)
    const rowMap = new Map<number, typeof items>();
    for (const it of items) {
      let attached = false;
      for (const [ky, arr] of rowMap) {
        if (Math.abs(it.y - ky) <= 3) { arr.push(it); attached = true; break; }
      }
      if (!attached) rowMap.set(it.y, [it]);
    }

    const rows = Array.from(rowMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([y, arr]) => ({ y, items: arr.sort((a, b) => a.x - b.x) }));

    for (const row of rows) {
      const detail = row.items.map(it => `[x=${it.x} "${it.str}"]`).join('  ');
      console.log(`Y=${row.y}: ${detail}`);
    }
  }
}
main().catch(console.error);
