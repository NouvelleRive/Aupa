// Mise à jour Salades ETE26 : 5 salades, nouveaux prix.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_SALADES: Record<string, number> = {
  'Salade parisienne': 13.90,
  'Salade chèvre chaud': 14.90,
  'Salade grecque': 13.90,
  'Salade tunisienne': 13.90,
  'Salade new-yorkaise': 15.90,
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const nom of Object.keys(PRIX_SALADES)) {
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

  const salCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('salade'));
  if (!salCat) throw new Error('Salades introuvable');

  console.log(`── ETE26 / ${salCat.nom} — AVANT ──`);
  for (const r of salCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌'} — ${r.prixVente} €`);
  }

  salCat.recettes = Object.entries(PRIX_SALADES).map(([nom, prix]) => ({
    id: idByNom[nom],
    prixVente: prix,
  }));

  console.log(`\n── ETE26 / ${salCat.nom} — APRÈS ──`);
  for (const r of salCat.recettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Salades uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
