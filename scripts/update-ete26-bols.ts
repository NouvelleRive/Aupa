// Mise à jour Bols ETE26 : ajoute Ratatouille bol été 10,90,
// garde les 4 autres bols été à 14,90.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_BOLS: Record<string, number> = {
  'Ratatouille bol été': 10.90,
  'Bourguignon bol été': 14.90,
  'Pulled pork bol été': 14.90,
  'Poulet bol été': 14.90,
  'Caprese bol été': 14.90,
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const nom of Object.keys(PRIX_BOLS)) {
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

  const bolsCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('bol'));
  if (!bolsCat) throw new Error('Bols introuvable');

  console.log(`── ETE26 / ${bolsCat.nom} — AVANT ──`);
  for (const r of bolsCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌'} — ${r.prixVente} €`);
  }

  bolsCat.recettes = Object.entries(PRIX_BOLS).map(([nom, prix]) => ({
    id: idByNom[nom],
    prixVente: prix,
  }));

  console.log(`\n── ETE26 / ${bolsCat.nom} — APRÈS ──`);
  for (const r of bolsCat.recettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Bols uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
