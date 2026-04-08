import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1. Init Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, '../serviceAccountKey.json'), 'utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 2. Liste des ingrédients canoniques (copie de lib/ingredient.ts)
const INGREDIENTS: string[] = [
  'Ail', 'Ail pelé', 'Ail semoule', 'Aneth', 'Aperol', 'Armagnac',
  'Aubergine', 'Avocat', 'Baileys', 'Basilic', 'Beurre', 'Beurre de lidl',
  'Beurre demi sel', 'Beurre salé de lidl', 'Bœuf', 'Burrata', 'Cachaca',
  'Café', 'Café déca', 'Calva', 'Camembert', 'Canard', 'Canelle de metro',
  'Canneberge', 'Capres', 'Carotte', 'Champignon de paris', 'Chantilly',
  'Cheddar', 'Chèvre', 'Chicorée', 'Chocolat', 'Chou rouge', 'Ciboulette',
  'Cidre', 'Citron', 'Citron jaune', 'Cognac', 'Comté', 'Concentreé tomate',
  'Concentré tomate', 'Concombre', 'Coppa', 'Coriandre', 'Courgette',
  'Crème 12%', 'Crème 18%', 'Crème 30%', 'Crème 35%', 'Croissant',
  'Cumin de metro', 'Cumin metro', 'Curry de metro', 'Dinde', 'Eau',
  'Eau gazeuse', 'Echalotte', 'Emmental', 'Epices curry',
  'Epices guaca de metro', 'Epices roti de metro', 'Epices roti lidl',
  'Epinards', 'Farine', 'Fleur d\'oranger', 'Frizzante', 'Get 27', 'Get 31',
  'Gin', 'Gingembre', 'Gingembre de metro', 'Ginger beer', 'Harissa',
  'Huile', 'Huile olive', 'IPA', 'Jambon blanc', 'Jambon cru',
  'Jaune d\'œuf', 'Jus de veau', 'Ketchup', 'Lait', 'Lait entier',
  'Lait végétal', 'Laurier', 'Limonade', 'Limoncello', 'Martini blanc',
  'Martini rouge', 'Matcha', 'Mayo', 'Menthe', 'Mesclun', 'Miel',
  'Mozzarella', 'Moutarde', 'Moutarde à l\'ancienne', 'Muscade de metro',
  'Myrtille', 'Noisette', 'Noix', 'Nutella', 'Œuf', 'Oignon jaune',
  'Oignon rouge', 'Olives', 'Orange', 'Ouzo', 'Paprika de metro',
  'Paprika fumée metro', 'Parmesan', 'Pastrami', 'Pastis', 'Pdt', 'Perrier',
  'Persil', 'Picon', 'Pignon', 'Poivre', 'Poivron rouge', 'Polenta',
  'Pomme', 'Porc', 'Portobello', 'Potimarron', 'Poudre amande', 'Poudre chai',
  'Poulet', 'Praliné', 'Raclette', 'Rhum', 'Riz', 'Romarin',
  'Roti de bœuf', 'Sauce tomate', 'Saucisse fumée', 'Saumon', 'Sirop',
  'Sirop citrouille', 'Sirop de sucre de canne', 'Sirop de violette',
  'Speculoos', 'St ger', 'Steak boeuf', 'Sucre', 'Sucre blanc',
  'Sucre cassonade', 'Sucre de canne', 'Suze', 'Thé', 'Thon', 'Thym',
  'Tomate', 'Tomate cerise', 'Tonic', 'Vanille liquide', 'Vin', 'Vin blanc',
  'Vinaigre blanc', 'Vodka', 'Whisky', 'Yahourt grec',
  'Aioli', 'Bourguignon', 'Caramel beurre salé', 'Coleslaw',
  'Crème de champi', 'Croissant perdu', 'Guaca', 'Mayonnaise',
  'Mayonnaise harissa', 'Mayonnaise moutarde à l\'ancienne',
  'Pickles concombre', 'Pickles oignon', 'Pesto', 'Polpette',
  'Poulet basquaise', 'Puled pork', 'Ratatouille', 'Rougail',
  'Thon prépa', 'Tzatziki', 'Velouté',
].sort();

async function migrate() {
  console.log('=== Début de la migration ===\n');

  // --- Étape A : Créer les ingrédients canoniques ---
  console.log('--- A. Création des ingrédients canoniques ---');
  const canonSnap = await db.collection('ingredients').get();
  const existingCanon = new Set(canonSnap.docs.map(d => d.data().nom));

  // Vérifier si la collection contient déjà des ingrédients canoniques (sans prix)
  // ou des produits fournisseurs (avec prix). Si c'est des produits fournisseurs,
  // on utilise une collection temporaire pour ne pas écraser.
  const hasOldIngredients = canonSnap.docs.some(d => d.data().prix !== undefined);

  if (hasOldIngredients) {
    // La collection "ingredients" contient encore les anciens produits fournisseurs
    // On crée les canoniques seulement s'il n'y a pas déjà un doc canonique avec ce nom
    const canonNoms = new Set<string>();
    for (const d of canonSnap.docs) {
      if (d.data().prix === undefined) canonNoms.add(d.data().nom);
    }

    let createdCanon = 0;
    for (const nom of INGREDIENTS) {
      if (canonNoms.has(nom)) {
        console.log(`  [SKIP] Ingrédient canonique "${nom}" existe déjà`);
        continue;
      }
      await db.collection('ingredientsCanoniques').add({
        nom,
        unite: 'kg',
        categorie: 'épicerie',
      });
      console.log(`  [CRÉÉ] Ingrédient canonique "${nom}"`);
      createdCanon++;
    }
    console.log(`\n  → ${createdCanon} ingrédients canoniques créés dans "ingredientsCanoniques"\n`);
    console.log('  ⚠️  NOTE: Les canoniques sont dans "ingredientsCanoniques" car "ingredients" contient encore les anciens docs.');
    console.log('      Après vérification, vous pourrez nettoyer manuellement.\n');
  } else {
    let createdCanon = 0;
    for (const nom of INGREDIENTS) {
      if (existingCanon.has(nom)) {
        console.log(`  [SKIP] Ingrédient canonique "${nom}" existe déjà`);
        continue;
      }
      await db.collection('ingredients').add({
        nom,
        unite: 'kg',
        categorie: 'épicerie',
      });
      console.log(`  [CRÉÉ] Ingrédient canonique "${nom}"`);
      createdCanon++;
    }
    console.log(`\n  → ${createdCanon} ingrédients canoniques créés\n`);
  }

  // --- Étape B : Copier les anciens "ingredients" (produits fournisseurs) vers "produitsFournisseurs" ---
  console.log('--- B. Migration des produits fournisseurs ---');
  const oldSnap = await db.collection('ingredients').get();
  const pfSnap = await db.collection('produitsFournisseurs').get();
  const existingPF = new Set(pfSnap.docs.map(d => d.data().nom + '|' + (d.data().foodflowCode || '')));

  let createdPF = 0;
  let skippedPF = 0;

  for (const docSnap of oldSnap.docs) {
    const data = docSnap.data();
    // Ne migrer que les docs qui ont un prix (= vrais produits fournisseurs)
    if (data.prix === undefined) {
      console.log(`  [SKIP] "${data.nom}" n'est pas un produit fournisseur (pas de prix)`);
      continue;
    }

    const key = data.nom + '|' + (data.foodflowCode || '');
    if (existingPF.has(key)) {
      console.log(`  [SKIP] Produit fournisseur "${data.nom}" existe déjà`);
      skippedPF++;
      continue;
    }

    const pfData: Record<string, any> = { ...data, ingredientId: '' };
    delete pfData.id; // ne pas copier l'id comme champ

    await db.collection('produitsFournisseurs').add(pfData);
    console.log(`  [COPIÉ] "${data.nom}" → produitsFournisseurs (tous champs conservés + ingredientId: '')`);
    createdPF++;
  }

  console.log(`\n  → ${createdPF} produits fournisseurs copiés, ${skippedPF} déjà existants`);
  console.log('  → Collection "ingredients" originale NON supprimée\n');

  console.log('=== Migration terminée ===');
  console.log(`  - Ingrédients canoniques: collection "${hasOldIngredients ? 'ingredientsCanoniques' : 'ingredients'}"`);
  console.log('  - Produits fournisseurs: collection "produitsFournisseurs"');
  console.log('  - Ancienne collection "ingredients": intacte');

  process.exit(0);
}

migrate().catch(err => {
  console.error('Erreur de migration:', err);
  process.exit(1);
});
