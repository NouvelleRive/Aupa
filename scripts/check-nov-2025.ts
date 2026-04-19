import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function check() {
  // 1. Rapports journaliers pour novembre 2025
  const rapSnap = await db.collection('rapportsJournaliers')
    .where('mois', '==', '2025-11')
    .get();

  console.log(`=== RAPPORTS JOURNALIERS NOV 2025 === (${rapSnap.size} docs)`);
  let sumCaTTC = 0;
  let sumCaHT = 0;
  for (const d of rapSnap.docs) {
    const data = d.data();
    sumCaTTC += data.caTTC || 0;
    sumCaHT += data.caHT || 0;
    console.log(`  ${data.date} | caTTC=${(data.caTTC||0).toFixed(2)} | caHT=${(data.caHT||0).toFixed(2)}`);
  }
  console.log(`  TOTAL caTTC = ${sumCaTTC.toFixed(2)} (attendu: 67291.63)`);
  console.log(`  TOTAL caHT  = ${sumCaHT.toFixed(2)}`);

  // 2. Ventes pour novembre 2025 — vérifier si "Total" existe
  const ventesSnap = await db.collection('ventes')
    .where('mois', '==', '2025-11')
    .get();

  let sumVentesTTC = 0;
  let totalRows = 0;
  for (const d of ventesSnap.docs) {
    const data = d.data();
    sumVentesTTC += data.ttc || 0;
    if (/^total$/i.test((data.nom || '').trim())) {
      totalRows++;
      console.log(`\n  ⚠️  Vente "Total" trouvée: jour=${data.jour} ttc=${data.ttc}`);
    }
  }
  console.log(`\n=== VENTES NOV 2025 === (${ventesSnap.size} docs)`);
  console.log(`  Somme TTC ventes = ${sumVentesTTC.toFixed(2)}`);
  console.log(`  Lignes "Total" trouvées: ${totalRows}`);
}

check().catch(console.error);
