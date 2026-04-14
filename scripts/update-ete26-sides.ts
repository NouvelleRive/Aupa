// Mise à jour catégorie Sides du menu ETE26.
// - Retire les INTROUVABLES (ids qui ne correspondent plus à aucune recette)
// - Ajoute Ratatouille side été à 5,90 €
// - Laisse Potatoes (5,90), Salade pdt (5,90), Fraicheur (4,90) inchangés
// NE TOUCHE QU'À LA CATÉGORIE SIDES DU MENU ETE26.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';
const RATATOUILLE_SIDE_PRIX = 5.90;

async function main() {
  const recSnap = await db.collection('recettes').get();
  const allIds = new Set(recSnap.docs.map((d) => d.id));
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const ratatouilleId = byNom.get('Ratatouille side été');
  if (!ratatouilleId) throw new Error('Ratatouille side été introuvable');

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  if (menusSnap.empty) throw new Error(`Menu "${TARGET_MENU}" introuvable`);
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories = menu.categories || [];

  const sidesCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('side'));
  if (!sidesCat) throw new Error('Catégorie Sides introuvable');

  console.log(`── ETE26 / ${sidesCat.nom} — AVANT ──`);
  for (const r of sidesCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌ ' + r.id} — ${r.prixVente} €`);
  }

  // Retirer les INTROUVABLES (ids qui n'existent plus dans recettes)
  let recettes: { id: string; prixVente: number }[] = (sidesCat.recettes || [])
    .filter((r: any) => allIds.has(r.id));

  // Ajouter Ratatouille si pas déjà là
  if (!recettes.find((r) => r.id === ratatouilleId)) {
    recettes.push({ id: ratatouilleId, prixVente: RATATOUILLE_SIDE_PRIX });
  }

  sidesCat.recettes = recettes;

  console.log(`\n── ETE26 / ${sidesCat.nom} — APRÈS ──`);
  for (const r of recettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Sides uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
