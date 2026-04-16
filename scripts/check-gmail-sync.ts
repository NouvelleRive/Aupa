import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function check() {
  // 1. Config Gmail : token OAuth présent ?
  const gmailConf = await db.doc('config/gmail').get();
  if (gmailConf.exists) {
    const d = gmailConf.data()!;
    console.log('=== CONFIG GMAIL ===');
    console.log(`  refresh_token: ${d.refresh_token ? 'OUI (' + d.refresh_token.slice(0, 10) + '...)' : 'NON'}`);
    console.log(`  updatedAt: ${d.updatedAt || '?'}`);
  } else {
    console.log('=== CONFIG GMAIL === ABSENT — OAuth jamais complété');
  }

  // 2. produitsFournisseurs créés par la sync (ont un champ fournisseur)
  console.log('\n=== PRODUITS FOURNISSEURS ===');
  const pfSnap = await db.collection('produitsFournisseurs').get();
  console.log(`  Total: ${pfSnap.size}`);
  const byFournisseur: Record<string, number> = {};
  let withUpdatedAt = 0;
  for (const doc of pfSnap.docs) {
    const d = doc.data();
    const f = d.fournisseur || '(aucun)';
    byFournisseur[f] = (byFournisseur[f] || 0) + 1;
    if (d.updatedAt) withUpdatedAt++;
  }
  for (const [f, n] of Object.entries(byFournisseur).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f}: ${n}`);
  }

  // 3. Achats
  console.log('\n=== ACHATS ===');
  const achatsSnap = await db.collection('achats').get();
  console.log(`  Total: ${achatsSnap.size}`);
  if (achatsSnap.size > 0) {
    const byFourn: Record<string, number> = {};
    const dates = new Set<string>();
    for (const doc of achatsSnap.docs) {
      const d = doc.data();
      byFourn[d.fournisseur || '?'] = (byFourn[d.fournisseur || '?'] || 0) + 1;
      if (d.date) dates.add(d.date);
    }
    for (const [f, n] of Object.entries(byFourn).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${f}: ${n}`);
    }
    const sortedDates = [...dates].sort();
    console.log(`  Dates: ${sortedDates[0]} → ${sortedDates[sortedDates.length - 1]} (${dates.size} dates)`);
  }

  // 4. Rapports journaliers (Popina)
  console.log('\n=== RAPPORTS JOURNALIERS ===');
  const rjSnap = await db.collection('rapportsJournaliers').get();
  console.log(`  Total: ${rjSnap.size}`);
  if (rjSnap.size > 0) {
    const dates = rjSnap.docs.map(d => d.id).sort();
    console.log(`  Du ${dates[0]} au ${dates[dates.length - 1]}`);
  }

  // 5. Ventes
  console.log('\n=== VENTES ===');
  const ventesSnap = await db.collection('ventes').get();
  console.log(`  Total: ${ventesSnap.size}`);
  if (ventesSnap.size > 0) {
    const jours = new Set<string>();
    for (const doc of ventesSnap.docs) {
      const d = doc.data();
      if (d.jour) jours.add(d.jour);
    }
    const sorted = [...jours].sort();
    console.log(`  Jours: ${sorted[0]} → ${sorted[sorted.length - 1]} (${jours.size} jours)`);
  }
}

check().catch(console.error);
