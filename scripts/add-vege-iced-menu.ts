import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const MENU_ID = 'fJWV9He5oV6jBKaI7FuH';

const ICED_VEGE = [
  { id: 'pbu4VCrgJMlX49QUodd8', prixVente: 6 },    // Iced café latte lait végétal
  { id: 'knI06XtbOEbb6JklfQQ0', prixVente: 7 },    // Iced chocolate lait végétal
  { id: 'PiuMi2EGoL5Mpkoafekh', prixVente: 7 },    // Iced matcha lait végétal
  { id: 'JfvWcaaM8DrcG33HRdI3', prixVente: 7.5 },  // Iced golden latte lait végétal
  { id: 'Ie3lGgxBsJI1qObsV2au', prixVente: 8 },    // Iced chai latte lait végétal
];

async function main() {
  const doc = await db.collection('menus').doc(MENU_ID).get();
  const data = doc.data()!;
  const categories = data.categories;

  const vegeIdx = categories.findIndex((c: any) => c.nom === 'Les Laits Végétaux');
  if (vegeIdx === -1) {
    console.log('Catégorie Les Laits Végétaux non trouvée');
    return;
  }

  for (const r of ICED_VEGE) {
    categories[vegeIdx].recettes.push(r);
  }

  await db.collection('menus').doc(MENU_ID).update({ categories });

  const recSnap = await db.collection('recettes').get();
  for (const r of ICED_VEGE) {
    const rec = recSnap.docs.find(d => d.id === r.id);
    console.log(`✅ ${rec?.data().nom} ajouté au menu`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
