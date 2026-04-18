// Import toutes les factures Milliet PDF depuis tmp-milliet-pdfs/ dans Firestore
import { parseMillietPDF } from '../lib/parsers/fournisseurs';
import { upsertLignesFournisseur } from '../lib/parsers/upsertFournisseur';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const dir = path.join(__dirname, '../tmp-milliet-pdfs');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
  console.log(`${files.length} factures Milliet à traiter\n`);

  let totalCreated = 0, totalUpdated = 0, totalAchats = 0;

  for (const file of files) {
    console.log(`--- ${file} ---`);
    const buf = fs.readFileSync(path.join(dir, file));
    const lignes = await parseMillietPDF(buf);
    console.log(`  ${lignes.length} lignes parsées`);

    if (lignes.length === 0) {
      console.log('  (vide, skip)');
      continue;
    }

    // Afficher un aperçu
    for (const l of lignes) {
      console.log(`  ${l.code} | ${l.nom} | qté=${l.qte} | prix=${l.prix.toFixed(2)}€ | ${l.unite || '-'}`);
    }

    const r = await upsertLignesFournisseur('Milliet', lignes);
    console.log(`  → créés: ${r.created}, mis à jour: ${r.updated}, achats: ${r.achatsCreated}`);
    totalCreated += r.created;
    totalUpdated += r.updated;
    totalAchats += r.achatsCreated;
  }

  console.log(`\n========================================`);
  console.log(`Total: ${totalCreated} produits créés, ${totalUpdated} mis à jour, ${totalAchats} achats`);
}

main().catch(console.error);
