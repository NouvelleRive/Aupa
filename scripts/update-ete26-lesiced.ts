// Catégorie Les Iced pour ETE26.
// - Crée : Iced golden latte
// - Déplace Café frappé de Le Chaud à Les Iced (change le champ categorie)
// - Ajoute la catégorie Les Iced au menu ETE26 avec 8 items

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const ITEMS: [string, number][] = [
  ['Iced coffee', 4],
  ['Iced café latte', 6],
  ['Iced chocolate', 7],
  ['Iced matcha', 7],
  ['Iced golden latte', 7.50],
  ['Iced chai latte', 8],
  ['Thé glacé maison', 5.50],
  ['Café frappé', 5],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, { id: string; ref: FirebaseFirestore.DocumentReference; data: any }>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, { id: d.id, ref: d.ref, data: d.data() });

  // 1) Déplacer Café frappé vers Les Iced
  const cafeFrappe = byNom.get('Café frappé');
  if (cafeFrappe && cafeFrappe.data.categorie !== 'Les Iced') {
    await cafeFrappe.ref.update({ categorie: 'Les Iced', updatedAt: new Date().toISOString() });
    console.log(`🔀 Café frappé : Le Chaud → Les Iced`);
  }

  // 2) Créer Iced golden latte
  if (!byNom.has('Iced golden latte')) {
    const ref = await db.collection('recettes').add({
      nom: 'Iced golden latte',
      categorie: 'Les Iced',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: 7.50,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set('Iced golden latte', { id: ref.id, ref, data: {} });
    console.log(`✅ Recette créée : Iced golden latte (${ref.id.slice(0, 8)})`);
  }

  // 3) Vérifier toutes les recettes
  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const [nom] of ITEMS) {
    const entry = byNom.get(nom);
    if (!entry) missing.push(nom);
    else idByNom[nom] = entry.id;
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  // 4) Charger ETE26 et ajouter (ou remplacer) la catégorie Les Iced
  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: 'Les Iced',
    recettes: ITEMS.map(([nom, prix]) => ({ id: idByNom[nom], prixVente: prix })),
  };

  const existingIdx = categories.findIndex(
    (c: any) => c.nom && c.nom.toLowerCase() === 'les iced'
  );
  if (existingIdx >= 0) {
    categories[existingIdx] = newCat;
    console.log(`\nℹ️  Catégorie Les Iced remplacée`);
  } else {
    categories.push(newCat);
    console.log(`\n➕ Catégorie Les Iced ajoutée`);
  }

  console.log(`\n── ETE26 / Les Iced ──`);
  for (const [nom, prix] of ITEMS) {
    console.log(`  ${nom} — ${prix} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Les Iced).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
