// Plats ETE26 : uniquement Assiette steak poivre 15,90.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  const assietteId = byNom.get('Assiette steak poivre');
  if (!assietteId) throw new Error('Assiette steak poivre introuvable');

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories = menu.categories || [];

  const platsCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('plat'));
  if (!platsCat) throw new Error('Plats introuvable');

  console.log(`── ETE26 / ${platsCat.nom} — AVANT ──`);
  for (const r of platsCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌'} — ${r.prixVente} €`);
  }

  platsCat.recettes = [{ id: assietteId, prixVente: 15.90 }];

  console.log(`\n── ETE26 / ${platsCat.nom} — APRÈS ──`);
  for (const r of platsCat.recettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Plats uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
