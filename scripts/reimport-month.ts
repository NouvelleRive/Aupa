// Supprime les ventes d'un mois donné pour forcer le scraper à les ré-importer
import { collection, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { config } from 'dotenv';
config({ path: '.env.local' });

const mois = process.argv[2]; // ex: 2025-11
if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
  console.error('Usage: tsx scripts/reimport-month.ts 2025-11');
  process.exit(1);
}

async function main() {
  const snap = await getDocs(query(collection(db, 'ventes'), where('mois', '==', mois)));
  console.log(`${snap.size} ventes à supprimer pour ${mois}`);

  let deleted = 0;
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
    deleted++;
    if (deleted % 100 === 0) console.log(`  ${deleted}/${snap.size} supprimées...`);
  }
  console.log(`${deleted} ventes supprimées. Relancer scrape-popina-daily.ts pour ré-importer.`);
}

main().catch(console.error);
