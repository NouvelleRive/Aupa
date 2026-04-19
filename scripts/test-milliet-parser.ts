import { parseMillietPDF } from '../lib/parsers/fournisseurs';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dir = path.join(__dirname, '../tmp-milliet-pdfs');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
  for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const buf = fs.readFileSync(path.join(dir, file));
    const lignes = await parseMillietPDF(buf);
    console.log(`Lignes trouvées: ${lignes.length}`);
    for (const l of lignes) {
      console.log(`  ${l.code} | ${l.nom} | qté=${l.qte} | prix=${l.prix.toFixed(4)} | contenance=${l.unite || '-'} | date=${l.date}`);
    }
  }
}
main().catch(console.error);
