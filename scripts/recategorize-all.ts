import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// ── 1. Fusion Beurre demi sel → Beurre salé ──
async function mergeBeurre() {
  console.log('=== Fusion "Beurre demi sel" → "Beurre salé" ===\n');

  const recSnap = await db.collection('recettes').get();
  let recUpdated = 0;
  for (const doc of recSnap.docs) {
    const data = doc.data();
    const lignes: any[] = data.ingredients || [];
    let changed = false;
    const newLignes = lignes.map((l: any) => {
      if (l.nomIngredient === 'Beurre demi sel') { changed = true; return { ...l, nomIngredient: 'Beurre salé' }; }
      return l;
    });
    if (changed) {
      await doc.ref.update({ ingredients: newLignes });
      console.log(`  ✔ Recette "${data.nom}"`);
      recUpdated++;
    }
  }
  console.log(`  ${recUpdated} recette(s)\n`);

  const pfSnap = await db.collection('produitsFournisseurs').get();
  let pfUpdated = 0;
  for (const doc of pfSnap.docs) {
    if (doc.data().ingredient === 'Beurre demi sel') {
      await doc.ref.update({ ingredient: 'Beurre salé' });
      console.log(`  ✔ PF ${doc.id}`);
      pfUpdated++;
    }
  }
  console.log(`  ${pfUpdated} PF\n`);

  const snap = await db.collection('ingredients').where('nom', '==', 'Beurre demi sel').get();
  for (const doc of snap.docs) {
    await doc.ref.delete();
    console.log(`  ✔ Supprimé (${doc.id})`);
  }
}

// ── 2. Recatégorisation ──
const CATEGORIES: Record<string, string[]> = {
  viande: [
    'Bœuf', 'Canard', 'Coppa', 'Dinde', 'Jambon blanc', 'Jambon cru',
    'Pastrami', 'Porc', 'Poulet', 'Roti de bœuf', 'Saucisse fumée', 'Steak boeuf',
  ],
  poisson: ['Saumon', 'Thon'],
  légume: [
    'Ail', 'Aubergine', 'Avocat', 'Carotte', 'Champignon de paris',
    'Chou rouge', 'Concombre', 'Courgette', 'Echalotte', 'Epinards',
    'Mesclun', 'Oignon jaune', 'Oignon rouge', 'Pdt', 'Poivron rouge',
    'Portobello', 'Potimarron', 'Tomate', 'Tomate cerise',
  ],
  fruit: ['Citron', 'Citron jaune', 'Myrtille', 'Orange', 'Pomme'],
  laitage: [
    'Beurre', 'Beurre salé', 'Burrata', 'Camembert', 'Cheddar',
    'Chantilly', 'Chèvre', 'Comté', 'Crème 12%', 'Crème 18%', 'Crème 30%',
    'Crème 35%', 'Emmental', 'Lait', 'Lait entier', 'Lait végétal',
    'Mozzarella', 'Parmesan', 'Raclette', 'Yahourt grec',
  ],
  boisson: [
    'Aperol', 'Armagnac', 'Baileys', 'Cachaca', 'Calva', 'Canneberge',
    'Cidre', 'Cognac', 'Eau', 'Eau gazeuse', 'Frizzante',
    'Get 27', 'Get 31', 'Gin', 'Ginger beer', 'IPA',
    'Limonade', 'Limoncello', 'Martini blanc', 'Martini rouge',
    'Ouzo', 'Pastis', 'Perrier', 'Picon', 'Rhum',
    'Sirop', 'Sirop citrouille', 'Sirop de sucre de canne', 'Sirop de violette',
    'St ger', 'Suze', 'Tonic', 'Vin', 'Vin blanc', 'Vodka', 'Whisky',
  ],
  // tout le reste reste en épicerie
};

async function recategorize() {
  console.log('=== Recatégorisation des ingrédients ===\n');

  const nomToCategorie = new Map<string, string>();
  for (const [cat, noms] of Object.entries(CATEGORIES)) {
    for (const nom of noms) nomToCategorie.set(nom, cat);
  }

  const snap = await db.collection('ingredients').get();
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const newCat = nomToCategorie.get(data.nom);
    if (newCat && newCat !== data.categorie) {
      await doc.ref.update({ categorie: newCat });
      console.log(`  ✔ ${data.nom}: ${data.categorie} → ${newCat}`);
      updated++;
    }
  }
  console.log(`\n  ${updated} ingrédient(s) recatégorisé(s)`);
}

async function main() {
  await mergeBeurre();
  await recategorize();
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
