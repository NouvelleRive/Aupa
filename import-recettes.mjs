// Script à run avec Claude Code dans le projet Aupa
// node import-recettes.mjs

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const recettes = JSON.parse(readFileSync('./recettes_export.json', 'utf8'));

async function run() {
  // 1. Supprimer toutes les recettes existantes
  console.log('Suppression des recettes existantes...');
  const snap = await db.collection('recettes').get();
  const batch1 = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch1.delete(doc.ref);
    count++;
    if (count % 500 === 0) await batch1.commit();
  }
  await batch1.commit();
  console.log(`${snap.size} recettes supprimées.`);

  // 2. Importer les nouvelles
  console.log('Import des nouvelles recettes...');
  let created = 0;
  const batch2 = db.batch();
  for (const r of recettes) {
    const ref = db.collection('recettes').doc();
    batch2.set(ref, {
      nom: r.nom,
      categorie: r.categorie,
      type: r.type,
      actif: true,
      prixVente: r.prixVente || 0,
      ingredients: r.ingredients || [],
      options: [],
      coutCalcule: 0,
      ...(r.quantiteProduite ? { quantiteProduite: r.quantiteProduite, uniteProduction: 'kg' } : {}),
      updatedAt: new Date().toISOString(),
    });
    created++;
    if (created % 500 === 0) {
      await batch2.commit();
    }
  }
  await batch2.commit();
  console.log(`✅ ${created} recettes importées.`);
}

run().catch(console.error);
