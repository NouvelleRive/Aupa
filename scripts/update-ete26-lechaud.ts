// Catégorie Le Chaud pour ETE26.
// - Crée : Chicorée crème, Golden latte
// - Renomme : Crème → Café crème
// - Ajoute la catégorie Le Chaud au menu ETE26 avec les 11 items

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

// Ordre + prix des 11 items de la catégorie Le Chaud
const ITEMS: [string, number][] = [
  ['Chicorée', 1.50],
  ['Expresso', 2],
  ['Chicorée crème', 3],
  ['Café crème', 4],
  ['Cappuccino', 5],
  ['Déca', 2.50],
  ['Chocolat chaud', 6],
  ['Golden latte', 7],
  ['Chai latte', 6.50],
  ['Matcha latte', 7],
  ['Thé', 4],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, { id: string; ref: FirebaseFirestore.DocumentReference }>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, { id: d.id, ref: d.ref });

  // 1) Rename "Crème" → "Café crème" (si pas déjà fait)
  if (!byNom.has('Café crème') && byNom.has('Crème')) {
    const old = byNom.get('Crème')!;
    await old.ref.update({ nom: 'Café crème', updatedAt: new Date().toISOString() });
    byNom.set('Café crème', old);
    byNom.delete('Crème');
    console.log(`✏️  Crème → Café crème (${old.id.slice(0, 8)})`);
  } else if (byNom.has('Café crème')) {
    console.log(`ℹ️  Café crème existe déjà`);
  }

  // 2) Créer Chicorée crème si absente
  if (!byNom.has('Chicorée crème')) {
    const ref = await db.collection('recettes').add({
      nom: 'Chicorée crème',
      categorie: 'Le Chaud',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: 3,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set('Chicorée crème', { id: ref.id, ref });
    console.log(`✅ Recette créée : Chicorée crème (${ref.id.slice(0, 8)})`);
  }

  // 3) Créer Golden latte si absente
  if (!byNom.has('Golden latte')) {
    const ref = await db.collection('recettes').add({
      nom: 'Golden latte',
      categorie: 'Le Chaud',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: 7,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set('Golden latte', { id: ref.id, ref });
    console.log(`✅ Recette créée : Golden latte (${ref.id.slice(0, 8)})`);
  }

  // 4) Vérifier toutes les recettes
  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const [nom] of ITEMS) {
    const entry = byNom.get(nom);
    if (!entry) missing.push(nom);
    else idByNom[nom] = entry.id;
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  // 5) Charger ETE26 et ajouter (ou remplacer) la catégorie Le Chaud
  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  if (menusSnap.empty) throw new Error(`Menu "${TARGET_MENU}" introuvable`);
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: 'Le Chaud',
    recettes: ITEMS.map(([nom, prix]) => ({ id: idByNom[nom], prixVente: prix })),
  };

  const existingIdx = categories.findIndex(
    (c: any) => c.nom && c.nom.toLowerCase() === 'le chaud'
  );
  if (existingIdx >= 0) {
    categories[existingIdx] = newCat;
    console.log(`\nℹ️  Catégorie Le Chaud remplacée`);
  } else {
    categories.push(newCat);
    console.log(`\n➕ Catégorie Le Chaud ajoutée`);
  }

  console.log(`\n── ETE26 / Le Chaud ──`);
  for (const r of newCat.recettes) {
    const nom = ITEMS.find(([_, __]) => idByNom[_] === r.id)?.[0];
    console.log(`  ${nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Le Chaud ajoutée).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
