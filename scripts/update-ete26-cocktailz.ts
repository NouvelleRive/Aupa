// Catégorie Les Cocktailz pour ETE26 (15 items).
// - Crée : Le Maxim's, London mule, Jamaican mule

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const TARGET_MENU = 'ETE26';

const TO_CREATE = ['Le Maxim\'s', 'London mule', 'Jamaican mule'];

const ITEMS: [string, number][] = [
  ['Le Maxim\'s', 8],
  ['Spritz', 8],
  ['Spritz suze', 8],
  ['Spritz St Germain', 11],
  ['Expresso martini', 9],
  ['Gin tonic', 7],
  ['Suze tonic', 7],
  ['Mojito', 8],
  ['Ti punch', 7],
  ['Caipirinha', 8],
  ['Moscow mule', 7],
  ['London mule', 7],
  ['Jamaican mule', 7],
  ['Petrouchka', 7],
  ['Mocktail fruits rouges', 6],
];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const byNom = new Map<string, string>();
  for (const d of recSnap.docs) byNom.set(d.data().nom, d.id);

  for (const nom of TO_CREATE) {
    if (byNom.has(nom)) { console.log(`ℹ️  ${nom} existe déjà`); continue; }
    const prix = ITEMS.find(([n]) => n === nom)?.[1] || 0;
    const ref = await db.collection('recettes').add({
      nom,
      categorie: 'Les Cocktailz',
      saisons: [],
      carte: '',
      actif: true,
      type: 'boisson',
      prixVente: prix,
      ingredients: [],
      options: [],
      coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    byNom.set(nom, ref.id);
    console.log(`✅ Créé : ${nom}`);
  }

  const missing: string[] = [];
  for (const [nom] of ITEMS) if (!byNom.has(nom)) missing.push(nom);
  if (missing.length > 0) throw new Error('Recettes introuvables: ' + missing.join(', '));

  const menusSnap = await db.collection('menus').where('nom', '==', TARGET_MENU).get();
  const menuDoc = menusSnap.docs[0];
  const menu = menuDoc.data();
  const categories: any[] = menu.categories || [];

  const newCat = {
    nom: 'Les Cocktailz',
    recettes: ITEMS.map(([nom, prix]) => ({ id: byNom.get(nom)!, prixVente: prix })),
  };

  const idx = categories.findIndex((c: any) => c.nom === 'Les Cocktailz');
  if (idx >= 0) categories[idx] = newCat;
  else categories.push(newCat);

  console.log(`\n── ETE26 / Les Cocktailz ──`);
  for (const [nom, prix] of ITEMS) console.log(`  ${nom} — ${prix} €`);

  await menuDoc.ref.update({ categories });
  console.log(`\n✅ Menu ${TARGET_MENU} mis à jour (Les Cocktailz).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
