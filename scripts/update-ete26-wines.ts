// Catégorie Les Wines pour ETE26 (17 items).
// - Crée la recette "La bonne bouteille de rouge" (vraie bouteille 33€)
// - Les 3 "Vin X bouteille" existantes = pression 75cl à 25€

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';
const NEW_BOUTEILLE = 'La bonne bouteille de rouge';

const ITEMS: [string, number][] = [
  ['Vin blanc (verre)', 5],
  ['Vin blanc 1/4', 9],
  ['Vin blanc 1/2', 16],
  ['Vin blanc bouteille', 25],
  ['Vin rouge (verre)', 5],
  ['Vin rouge 1/4', 9],
  ['Vin rouge 1/2', 16],
  ['Vin rouge bouteille', 25],
  ['Vin rosé (verre)', 5],
  ['Vin rosé 1/4', 9],
  ['Vin rosé 1/2', 16],
  ['Vin rosé bouteille', 25],
  ['Pétillant (verre)', 7],
  ['Pétillant 1/4', 13],
  ['Pétillant 1/2', 25],
  ['Pétillant bouteille', 35],
  [NEW_BOUTEILLE, 33],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  // Créer la recette "La bonne bouteille de rouge" si absente
  if (!byNom.has(NEW_BOUTEILLE)) {
    const ref = await db.collection('recettes').add({
      nom: NEW_BOUTEILLE,
      categorie: 'Les Wines',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: 33,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set(NEW_BOUTEILLE, ref.id);
    console.log(`✅ Recette créée : ${NEW_BOUTEILLE} (${ref.id.slice(0, 8)})`);
  }

  const missing: string[] = [];
  for (const [nom] of ITEMS) if (!byNom.has(nom)) missing.push(nom);
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: 'Les Wines',
    recettes: ITEMS.map(([nom, prix]) => ({ id: byNom.get(nom)!, prixVente: prix })),
  };

  const idx = categories.findIndex((c: any) => c.nom === 'Les Wines');
  if (idx >= 0) categories[idx] = newCat;
  else categories.push(newCat);

  console.log(`\n── ETE26 / Les Wines ──`);
  for (const [nom, prix] of ITEMS) console.log(`  ${nom} — ${prix} €`);

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Les Wines).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
