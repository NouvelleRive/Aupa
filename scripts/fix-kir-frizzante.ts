import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  // IDs
  const OLD_KIR = 'XTZV2V0v24ngi5B5iAmR';
  const OLD_KIR_ROYAL = 'MKwrTfnWkxKKRJhRRNXG';
  const NEW_KIR = 'WBycZjiLrvz4TnokzThB';
  const NEW_KIR_ROYAL = 'xmTMDQLJjMdvOEYxwgcj';
  const MY_FRIZZANTE = 'TTmmpPvcHts9VrW5s9NG';
  const REAL_FRIZZANTE = 'gl6RUeraAeIErOtn6TLv';
  const CREME_CASSIS = 'hGnWzSEJi0lHHcdts9ar';
  const VIN_BLANC = '5nuU92uKualiVdm1xuIO';

  // 1. Supprimer mes doublons
  await db.collection('recettes').doc(NEW_KIR).delete();
  console.log('Supprimé: nouveau Kir');
  await db.collection('recettes').doc(NEW_KIR_ROYAL).delete();
  console.log('Supprimé: nouveau Kir royal');

  // 2. Supprimer mon doublon Frizzante
  await db.collection('ingredients').doc(MY_FRIZZANTE).delete();
  console.log('Supprimé: doublon Frizzante');

  // 3. Corriger les anciens Kir avec ingredientId
  await db.collection('recettes').doc(OLD_KIR).update({
    ingredients: [
      { ingredientId: VIN_BLANC, nomIngredient: 'Vin blanc', grammage: 0.1 },
      { ingredientId: CREME_CASSIS, nomIngredient: 'Crème de cassis', grammage: 0.02 },
    ],
  });
  console.log('✅ Kir corrigé avec ingredientId');

  await db.collection('recettes').doc(OLD_KIR_ROYAL).update({
    ingredients: [
      { ingredientId: REAL_FRIZZANTE, nomIngredient: 'Frizzante', grammage: 0.1 },
      { ingredientId: CREME_CASSIS, nomIngredient: 'Crème de cassis', grammage: 0.02 },
    ],
  });
  console.log('✅ Kir royal corrigé avec ingredientId');

  // 4. Nettoyer le menu — retirer mes IDs
  const menuDoc = await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').get();
  const categories = menuDoc.data()!.categories;
  const aperoIdx = categories.findIndex((c: any) => c.nom === 'Les Apéritifs et Digestifs');

  categories[aperoIdx].recettes = categories[aperoIdx].recettes.filter(
    (r: any) => r.id !== NEW_KIR && r.id !== NEW_KIR_ROYAL
  );

  await db.collection('menus').doc('fJWV9He5oV6jBKaI7FuH').update({ categories });
  console.log('✅ Menu nettoyé');

  console.log('\nTerminé !');
}

main().catch(err => { console.error(err); process.exit(1); });
