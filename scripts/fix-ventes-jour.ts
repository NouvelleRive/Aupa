// Fix : supprime les ventes sans jour et relance le backfill Gmail
// pour recréer les ventes avec le champ jour
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

async function main() {
  // 1. Compter les ventes sans jour
  const snap = await getDocs(collection(db, 'ventes'));
  const sansJour = snap.docs.filter(d => !d.data().jour);
  const avecJour = snap.docs.filter(d => d.data().jour);

  console.log(`Total ventes: ${snap.docs.length}`);
  console.log(`Avec jour: ${avecJour.length}`);
  console.log(`Sans jour: ${sansJour.length}`);

  if (sansJour.length === 0) {
    console.log('Rien à corriger.');
    return;
  }

  // 2. Supprimer les ventes sans jour
  console.log(`\nSuppression de ${sansJour.length} ventes sans jour...`);
  let deleted = 0;
  for (const d of sansJour) {
    await deleteDoc(d.ref);
    deleted++;
    if (deleted % 100 === 0) console.log(`  ${deleted}/${sansJour.length}`);
  }
  console.log(`  ${deleted} ventes supprimées.`);

  // 3. Lancer le backfill via l'API
  console.log('\nLance le backfill Gmail sur aupa.vercel.app...');
  const res = await fetch('https://aupa.vercel.app/api/gmail/backfill');
  const data = await res.json();
  console.log('Résultat backfill:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
