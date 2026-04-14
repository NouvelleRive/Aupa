// Mise à jour Grignotage ETE26 + retrait Camembert des Entrées.
// - Entrées : retire Camembert entrée
// - Grignotage : garde Guaca entrée (8,90), retire les INTROUVABLES,
//   ajoute Planche mixte (13,90), Planche fromage (13,90),
//   Planche charcuterie (13,90), Camembert entrée (6,90),
//   Planche 3 effilochés (14,90)

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_GRIGNOTAGE: Record<string, number> = {
  'Guaca entrée': 8.90,
  'Planche mixte': 13.90,
  'Planche fromage': 13.90,
  'Planche charcuterie': 13.90,
  'Camembert entrée': 6.90,
  'Planche 3 effilochés': 14.90,
};

async function main() {
  const recSnap = await db.collection('recettes').get();
  const allIds = new Set(recSnap.docs.map((d) => d.id));
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  // Vérifier toutes les recettes
  const missing: string[] = [];
  const idByNom: Record<string, string> = {};
  for (const nom of Object.keys(PRIX_GRIGNOTAGE)) {
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

  // --- Entrées : retirer Camembert ---
  const entreesCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('entr'));
  if (!entreesCat) throw new Error('Entrées introuvable');
  const camembertId = idByNom['Camembert entrée'];
  const beforeEntrees = (entreesCat.recettes || []).length;
  entreesCat.recettes = (entreesCat.recettes || []).filter((r: any) => r.id !== camembertId);
  console.log(`── Entrées : ${beforeEntrees} → ${entreesCat.recettes.length} (Camembert retiré)`);

  // --- Grignotage : reconstruire ---
  const grigCat = categories.find((c: any) => c.nom && c.nom.toLowerCase().startsWith('grign'));
  if (!grigCat) throw new Error('Grignotage introuvable');

  console.log(`\n── Grignotage — AVANT ──`);
  for (const r of grigCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || '❌ ' + r.id} — ${r.prixVente} €`);
  }

  grigCat.recettes = Object.entries(PRIX_GRIGNOTAGE).map(([nom, prix]) => ({
    id: idByNom[nom],
    prixVente: prix,
  }));

  console.log(`\n── Grignotage — APRÈS ──`);
  for (const r of grigCat.recettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom} — ${r.prixVente} €`);
  }

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Entrées + Grignotage).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
