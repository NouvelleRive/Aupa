// Mise à jour catégorie Croger du menu ETE26.
// Final : 9 crogers (Bourguignon, Pulled pork, Poulet, Caprese, Ratatouille été,
// Poivre, Thon, Eggs, Jambon). Retire Boulette, Tartare, Dinde.
// Ajoute Poivre croger. Met Eggs à 14,90 €.
// NE TOUCHE QU'À LA CATÉGORIE CROGER DU MENU ETE26.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_ETE26: Record<string, number> = {
  'Bourguignon croger': 13.90,
  'Pulled pork croger': 13.90,
  'Poulet croger': 13.90,
  'Caprese croger': 12.90,
  'Ratatouille croger été': 11.90,
  'Poivre croger': 14.90,
  'Thon croger': 12.90,
  'Eggs croger': 14.90,
  'Jambon croger': 8.90,
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  // Vérifier que toutes les recettes existent
  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const nom of Object.keys(PRIX_ETE26)) {
    const id = byNom.get(nom);
    if (!id) missing.push(nom);
    else idByNom[nom] = id;
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  if (menusSnap.empty) throw new Error(`Menu "${TARGET_MENU}" introuvable`);
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories = menu.categories || [];

  const crogerCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('croger'));
  if (!crogerCat) throw new Error('Catégorie Croger introuvable');

  console.log(`── ETE26 / ${crogerCat.nom} — AVANT ──`);
  for (const r of crogerCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌'} — ${r.prixVente} €`);
  }

  // Reconstruire la liste : uniquement les 9 crogers voulus, dans l'ordre
  const newRecettes = Object.entries(PRIX_ETE26).map(([nom, prix]) => ({
    id: idByNom[nom],
    prixVente: prix,
  }));

  crogerCat.recettes = newRecettes;

  console.log(`\n── ETE26 / ${crogerCat.nom} — APRÈS ──`);
  for (const r of newRecettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Croger uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
