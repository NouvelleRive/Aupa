import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const menuDoc = await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').get();
  const categories = menuDoc.data()!.categories;

  const vegeIdx = categories.findIndex((c: any) => c.nom === 'Les Laits Végétaux');
  const chaudIdx = categories.findIndex((c: any) => c.nom === 'Le Chaud');
  const icedIdx = categories.findIndex((c: any) => c.nom === 'Les Iced');

  const vegeRecettes = categories[vegeIdx].recettes;

  const recSnap = await db.collection('recettes').get();

  for (const r of vegeRecettes) {
    const rec = recSnap.docs.find(d => d.id === r.id);
    const nom = rec?.data().nom || '';

    if (nom.toLowerCase().includes('iced')) {
      categories[icedIdx].recettes.push(r);
      console.log(`→ Les Iced: ${nom}`);
    } else {
      categories[chaudIdx].recettes.push(r);
      console.log(`→ Le Chaud: ${nom}`);
    }
  }

  // Supprimer la catégorie Les Laits Végétaux
  categories.splice(vegeIdx, 1);

  await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').update({ categories });
  console.log('\n✅ Catégorie "Les Laits Végétaux" supprimée, recettes redistribuées');
}

main().catch(err => { console.error(err); process.exit(1); });
