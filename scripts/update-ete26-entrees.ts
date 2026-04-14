// Mise à jour ciblée catégorie Entrées du menu ETE26.
// - Retire Œuf mimosa entrée
// - Ajoute Salmon entrée à 5,90 €
// - Crée et ajoute Œuf croissantoast entrée à 7,90 €
// - Met à jour les prix ETE26 de : Avocado entrée (8,90), Croissant grilled cheese entrée (6,90), Œuf entrée (7,90)
// NE TOUCHE QU'À LA CATÉGORIE ENTRÉES DU MENU ETE26.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const PRIX_ETE26: Record<string, number> = {
  'Avocado entrée': 8.90,
  'Croissant grilled cheese entrée': 6.90,
  'Œuf entrée': 7.90,
  'Salmon entrée': 5.90, // à ajouter
};
const NEW_RECIPE_NOM = 'Œuf croissantoast entrée';
const NEW_RECIPE_PRIX = 7.90;
const REMOVE_NOM = 'Œuf mimosa entrée';

async function main() {
  // 1) Charger toutes les recettes pour avoir un mapping nom→id
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, { id: string; data: any }>();
  for (const d of recSnap.docs) {
    const data = d.data();
    if (data.nom) byNom.set(data.nom, { id: d.id, data });
  }

  // 2) Créer la nouvelle recette Œuf croissantoast entrée si elle n'existe pas
  let ouefCroissantoastId: string;
  const existing = byNom.get(NEW_RECIPE_NOM);
  if (existing) {
    ouefCroissantoastId = existing.id;
    console.log(`ℹ️  "${NEW_RECIPE_NOM}" existe déjà (${ouefCroissantoastId.slice(0, 8)}), on réutilise`);
  } else {
    const newDoc = await db.collection('recettes').add({
      nom: NEW_RECIPE_NOM,
      categorie: 'Entrées',
      saisons: [],
      carte: '',
      actif: true,
      type: 'food',
      prixVente: NEW_RECIPE_PRIX,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    ouefCroissantoastId = newDoc.id;
    console.log(`✅ Recette créée : "${NEW_RECIPE_NOM}" (${ouefCroissantoastId.slice(0, 8)})`);
  }

  // 3) Charger le menu ETE26
  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  if (menusSnap.empty) throw new Error(`Menu "${TARGET_MENU}" introuvable`);
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories = menu.categories || [];

  // 4) Trouver la catégorie Entrées
  const entreesCat = categories.find((c: any) =>
    c.nom && c.nom.toLowerCase().startsWith('entr')
  );
  if (!entreesCat) throw new Error(`Catégorie Entrées introuvable dans ${TARGET_MENU}`);

  console.log(`\n── ETE26 / ${entreesCat.nom} — AVANT ──`);
  for (const r of entreesCat.recettes || []) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    console.log(`  ${rec?.data().nom || r.id} — ${r.prixVente} €`);
  }

  // 5) Construire la nouvelle liste
  const removeId = byNom.get(REMOVE_NOM)?.id;
  const salmonId = byNom.get('Salmon entrée')?.id;
  if (!salmonId) throw new Error('Salmon entrée introuvable dans la collection recettes');

  const existingRecettes: { id: string; prixVente: number }[] = (entreesCat.recettes || [])
    .filter((r: any) => r.id !== removeId); // retire Œuf mimosa

  // Maj prix existants
  for (const r of existingRecettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    const nom = rec?.data().nom;
    if (nom && PRIX_ETE26[nom] !== undefined) {
      r.prixVente = PRIX_ETE26[nom];
    }
  }

  // Ajouter Salmon entrée (si pas déjà dedans)
  if (!existingRecettes.find((r) => r.id === salmonId)) {
    existingRecettes.push({ id: salmonId, prixVente: PRIX_ETE26['Salmon entrée'] });
  }
  // Ajouter Œuf croissantoast entrée (si pas déjà dedans)
  if (!existingRecettes.find((r) => r.id === ouefCroissantoastId)) {
    existingRecettes.push({ id: ouefCroissantoastId, prixVente: NEW_RECIPE_PRIX });
  }

  entreesCat.recettes = existingRecettes;

  console.log(`\n── ETE26 / ${entreesCat.nom} — APRÈS ──`);
  for (const r of existingRecettes) {
    const rec = recSnap.docs.find((d) => d.id === r.id);
    const nom = rec?.data().nom || (r.id === ouefCroissantoastId ? NEW_RECIPE_NOM : r.id);
    console.log(`  ${nom} — ${r.prixVente} €`);
  }

  // 6) Sauvegarder le menu
  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (catégorie Entrées uniquement).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
