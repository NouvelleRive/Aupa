// Supprime TOUTES les ventes de Firestore pour repartir de zéro
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  console.log('Chargement des ventes...');
  const snap = await getDocs(collection(db, 'ventes'));
  console.log(`${snap.size} ventes à supprimer\n`);

  if (snap.size === 0) {
    console.log('Rien à supprimer.');
    return;
  }

  let deleted = 0;
  const batch = 500;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batch) {
    const chunk = docs.slice(i, i + batch);
    await Promise.all(chunk.map(d => deleteDoc(doc(db, 'ventes', d.id))));
    deleted += chunk.length;
    console.log(`  ${deleted} / ${docs.length} supprimées`);
  }

  console.log(`\n✓ ${deleted} ventes supprimées`);
}

main().catch(console.error);
