// Catégories Les Sodas + Les Eaux pour ETE26.
// - Crée 7 jus (Jus pomme, Jus ananas, Jus goyave, Jus fraise, Jus mangue, Jus cranberry, Jus tomate)
// - Les Sodas : 5 classiques + 7 jus = 12 items
// - Les Eaux : 3 items

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const JUS_FRUITS = ['pomme', 'ananas', 'goyave', 'fraise', 'mangue', 'cranberry', 'tomate'];

const SODAS: [string, number][] = [
  ['Coca', 3.90],
  ['Coca zero', 3.90],
  ['Tonic', 4],
  ['Diabolo', 3.50],
  ['Sirop à l\'eau', 3],
  // + 7 jus à 3,50 ajoutés dynamiquement
];

const EAUX: [string, number][] = [
  ['Eau Evian 1L', 4.90],
  ['Perrier 33', 3.90],
  ['San Pellegrino 1L', 5.90],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  // 1) Créer les 7 jus si absents
  for (const fruit of JUS_FRUITS) {
    const nom = `Jus ${fruit}`;
    if (byNom.has(nom)) {
      console.log(`ℹ️  ${nom} existe déjà`);
      continue;
    }
    const ref = await db.collection('recettes').add({
      nom,
      categorie: 'Les Sodas',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: 3.50,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set(nom, ref.id);
    console.log(`✅ Créé : ${nom}`);
  }

  // 2) Construire la liste Les Sodas complète
  const sodasItems: [string, number][] = [
    ...SODAS,
    ...JUS_FRUITS.map((f) => [`Jus ${f}`, 3.50] as [string, number]),
  ];

  // 3) Vérifier les recettes existent
  const missing: string[] = [];
  for (const [nom] of [...sodasItems, ...EAUX]) {
    if (!byNom.has(nom)) missing.push(nom);
  }
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  // 4) Charger ETE26
  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  // 5) Ajouter/remplacer Les Sodas
  const sodasCat = {
    nom: 'Les Sodas',
    recettes: sodasItems.map(([nom, prix]) => ({ id: byNom.get(nom)!, prixVente: prix })),
  };
  const sodasIdx = categories.findIndex((c: any) => c.nom === 'Les Sodas');
  if (sodasIdx >= 0) categories[sodasIdx] = sodasCat;
  else categories.push(sodasCat);

  // 6) Ajouter/remplacer Les Eaux
  const eauxCat = {
    nom: 'Les Eaux',
    recettes: EAUX.map(([nom, prix]) => ({ id: byNom.get(nom)!, prixVente: prix })),
  };
  const eauxIdx = categories.findIndex((c: any) => c.nom === 'Les Eaux');
  if (eauxIdx >= 0) categories[eauxIdx] = eauxCat;
  else categories.push(eauxCat);

  console.log(`\n── ETE26 / Les Sodas ──`);
  for (const [nom, prix] of sodasItems) console.log(`  ${nom} — ${prix} €`);
  console.log(`\n── ETE26 / Les Eaux ──`);
  for (const [nom, prix] of EAUX) console.log(`  ${nom} — ${prix} €`);

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Sodas + Eaux).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
