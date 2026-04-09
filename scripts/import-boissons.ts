import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

const boissons = [
  { nom: "Kir", categorie: "Les Cocktailz", prixVente: 6, ingredients: [{ nomIngredient: "Vin blanc", grammage: 0.1, unite: "20" }, { nomIngredient: "Creme de fruit", grammage: 0.02, unite: "1" }] },
  { nom: "Kir royal", categorie: "Les Cocktailz", prixVente: 8, ingredients: [{ nomIngredient: "Frizzante", grammage: 0.1, unite: "20" }, { nomIngredient: "Creme de fruit", grammage: 0.02, unite: "1" }] },
  { nom: "Spritz", categorie: "Les Cocktailz", prixVente: 8, ingredients: [{ nomIngredient: "Frizzante", grammage: 0.04, unite: "20" }, { nomIngredient: "Aperol", grammage: 0.02, unite: "1" }, { nomIngredient: "Eau gazeuse", grammage: 0.25, unite: "1" }] },
  { nom: "Suze spritz", categorie: "Les Cocktailz", prixVente: 8, ingredients: [{ nomIngredient: "Frizzante", grammage: 0.04, unite: "20" }, { nomIngredient: "Suze", grammage: 0.02, unite: "1" }, { nomIngredient: "Eau gazeuse", grammage: 0.25, unite: "1" }] },
  { nom: "Hugo", categorie: "Les Cocktailz", prixVente: 11, ingredients: [{ nomIngredient: "Frizzante", grammage: 0.04, unite: "20" }, { nomIngredient: "St ger", grammage: 0.02, unite: "0.7" }, { nomIngredient: "Eau gazeuse", grammage: 0.25, unite: "1" }] },
  { nom: "Gin tonic", categorie: "Les Cocktailz", prixVente: 7, ingredients: [{ nomIngredient: "Gin", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Tonic", grammage: 0.25, unite: "1.5" }, { nomIngredient: "Citron", grammage: 0.02, unite: "1" }] },
  { nom: "Suze tonic", categorie: "Les Cocktailz", prixVente: 7, ingredients: [{ nomIngredient: "Suze", grammage: 0.04, unite: "1" }, { nomIngredient: "Tonic", grammage: 0.25, unite: "1.5" }, { nomIngredient: "Citron", grammage: 0.02, unite: "1" }] },
  { nom: "Mojito", categorie: "Les Cocktailz", prixVente: 8, ingredients: [{ nomIngredient: "Rhum", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Eau gazeuse", grammage: 0.15, unite: "1" }, { nomIngredient: "Sucre de canne", grammage: 0.02, unite: "1" }, { nomIngredient: "Citron", grammage: 0.05, unite: "1" }, { nomIngredient: "Menthe", grammage: 0.1, unite: "1" }] },
  { nom: "Ti punch", categorie: "Les Cocktailz", prixVente: 7, ingredients: [{ nomIngredient: "Rhum", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Sucre de canne", grammage: 0.02, unite: "1" }, { nomIngredient: "Citron", grammage: 0.05, unite: "1" }] },
  { nom: "Caipirinha", categorie: "Les Cocktailz", prixVente: 8, ingredients: [{ nomIngredient: "Cachaca", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Sucre de canne", grammage: 0.02, unite: "1" }, { nomIngredient: "Citron", grammage: 0.05, unite: "1" }] },
  { nom: "Moscow mule", categorie: "Les Cocktailz", prixVente: 7, ingredients: [{ nomIngredient: "Vodka", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Ginger beer", grammage: 0.25, unite: "1" }, { nomIngredient: "Citron", grammage: 0.02, unite: "1" }] },
  { nom: "Parma violet", categorie: "Les Cocktailz", prixVente: 7, ingredients: [{ nomIngredient: "Vodka", grammage: 0.04, unite: "0.7" }, { nomIngredient: "Limonade", grammage: 0.25, unite: "1.5" }, { nomIngredient: "Sirop de violette", grammage: 0.03, unite: "1" }] },
  { nom: "Virgin cocktail", categorie: "Les Cocktailz", prixVente: 6, ingredients: [] },
  { nom: "Expresso", categorie: "Le Chaud", prixVente: 2.5, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }] },
  { nom: "Déca", categorie: "Le Chaud", prixVente: 2.5, ingredients: [{ nomIngredient: "Café déca", grammage: 0.012, unite: "0.25" }] },
  { nom: "Crème", categorie: "Le Chaud", prixVente: 3.5, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }, { nomIngredient: "Lait", grammage: 0.2, unite: "6" }] },
  { nom: "Cappuccino", categorie: "Le Chaud", prixVente: 4.5, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }, { nomIngredient: "Lait", grammage: 0.2, unite: "6" }] },
  { nom: "Chocolat chaud", categorie: "Le Chaud", prixVente: 4, ingredients: [{ nomIngredient: "Lait", grammage: 0.2, unite: "6" }, { nomIngredient: "Chocolat", grammage: 0.012, unite: "0.35" }] },
  { nom: "Thé", categorie: "Le Chaud", prixVente: 3.5, ingredients: [{ nomIngredient: "Thé", grammage: 1, unite: "15" }] },
  { nom: "Grog", categorie: "Le Chaud", prixVente: 5.5, ingredients: [{ nomIngredient: "Rhum", grammage: 0.03, unite: "0.7" }] },
  { nom: "Latte aux épices", categorie: "Le Chaud", prixVente: 4.5, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }, { nomIngredient: "Lait", grammage: 0.2, unite: "6" }] },
  { nom: "Pumpkin latte", categorie: "Le Chaud", prixVente: 5, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }, { nomIngredient: "Lait", grammage: 0.2, unite: "6" }, { nomIngredient: "Sirop citrouille", grammage: 0.03, unite: "0.7" }, { nomIngredient: "Chantilly", grammage: 0.01, unite: "0.7" }] },
  { nom: "Vin chaud", categorie: "Le Chaud", prixVente: 5, ingredients: [{ nomIngredient: "Vin", grammage: 0.2, unite: "20" }] },
  { nom: "Cidre chaud", categorie: "Le Chaud", prixVente: 5, ingredients: [{ nomIngredient: "Cidre", grammage: 0.2, unite: "20" }] },
  { nom: "Chai latte", categorie: "Le Chaud", prixVente: 4.5, ingredients: [{ nomIngredient: "Lait", grammage: 0.2, unite: "6" }, { nomIngredient: "Poudre chai", grammage: 0.02, unite: "1" }] },
  { nom: "Café frappé", categorie: "Le Chaud", prixVente: 4, ingredients: [{ nomIngredient: "Café", grammage: 0.012, unite: "1" }, { nomIngredient: "Lait", grammage: 0.2, unite: "6" }] },
  { nom: "Chicorée", categorie: "Le Chaud", prixVente: 3, ingredients: [{ nomIngredient: "Chicorée", grammage: 0.01, unite: "125" }] },
  { nom: "Matcha latte", categorie: "Le Chaud", prixVente: 5, ingredients: [{ nomIngredient: "Lait végétal", grammage: 0.2, unite: "1" }, { nomIngredient: "Matcha", grammage: 1, unite: "200" }] },
  { nom: "Smoothie", categorie: "Les Iced", prixVente: 4, ingredients: [] },
  { nom: "Orange pressée", categorie: "Les Iced", prixVente: 4, ingredients: [{ nomIngredient: "Orange", grammage: 0.8, unite: "1" }] },
  { nom: "Citron pressé", categorie: "Les Iced", prixVente: 3.5, ingredients: [{ nomIngredient: "Citron", grammage: 0.03, unite: "1" }] },
  { nom: "Citronnade", categorie: "Les Iced", prixVente: 4, ingredients: [{ nomIngredient: "Citron", grammage: 0.03, unite: "1" }, { nomIngredient: "Menthe", grammage: 0.005, unite: "1" }, { nomIngredient: "Sirop de sucre de canne", grammage: 0.005, unite: "1" }] },
  { nom: "Limonade maison", categorie: "Les Iced", prixVente: 4.5, ingredients: [{ nomIngredient: "Citron", grammage: 0.03, unite: "1" }, { nomIngredient: "Menthe", grammage: 0.005, unite: "1" }, { nomIngredient: "Sirop de sucre de canne", grammage: 0.005, unite: "1" }, { nomIngredient: "Perrier", grammage: 0.25, unite: "1" }] },
  { nom: "Shot gingembre", categorie: "Les Iced", prixVente: 2.5, ingredients: [{ nomIngredient: "Gingembre", grammage: 0.03, unite: "1" }] },
  { nom: "Shot fleur d'oranger", categorie: "Les Iced", prixVente: 2.5, ingredients: [{ nomIngredient: "Fleur d'oranger", grammage: 0.03, unite: "0.5" }] },
  { nom: "Shot cranberry", categorie: "Les Iced", prixVente: 2.5, ingredients: [{ nomIngredient: "Canneberge", grammage: 0.03, unite: "1" }] },
  { nom: "Diabolo", categorie: "Les Iced", prixVente: 3, ingredients: [{ nomIngredient: "Sirop", grammage: 0.03, unite: "1" }, { nomIngredient: "Limonade", grammage: 0.25, unite: "1.5" }] },
  { nom: "Sirop à l'eau", categorie: "Les Iced", prixVente: 1.5, ingredients: [{ nomIngredient: "Sirop", grammage: 0.03, unite: "1" }] },
  { nom: "Coca", categorie: "Les Sodas", prixVente: 3.5, ingredients: [] },
  { nom: "Coca zero", categorie: "Les Sodas", prixVente: 3.5, ingredients: [] },
  { nom: "Ice tea", categorie: "Les Sodas", prixVente: 3.5, ingredients: [] },
  { nom: "Orangina", categorie: "Les Sodas", prixVente: 3.5, ingredients: [] },
  { nom: "Perrier bouteille", categorie: "Les Sodas", prixVente: 4, ingredients: [] },
  { nom: "Pastis", categorie: "Les Apéritifs et Digestifs", prixVente: 3, ingredients: [] },
  { nom: "Ouzo", categorie: "Les Apéritifs et Digestifs", prixVente: 5, ingredients: [] },
  { nom: "Martini rouge", categorie: "Les Apéritifs et Digestifs", prixVente: 5, ingredients: [] },
  { nom: "Martini blanc", categorie: "Les Apéritifs et Digestifs", prixVente: 5, ingredients: [] },
  { nom: "Calva", categorie: "Les Apéritifs et Digestifs", prixVente: 6, ingredients: [] },
  { nom: "Cognac", categorie: "Les Apéritifs et Digestifs", prixVente: 8, ingredients: [] },
  { nom: "Limoncello", categorie: "Les Apéritifs et Digestifs", prixVente: 6, ingredients: [] },
  { nom: "Get 27", categorie: "Les Apéritifs et Digestifs", prixVente: 5.5, ingredients: [] },
  { nom: "Get 31", categorie: "Les Apéritifs et Digestifs", prixVente: 5.5, ingredients: [] },
  { nom: "Baileys", categorie: "Les Apéritifs et Digestifs", prixVente: 5.5, ingredients: [] },
  { nom: "Armagnac", categorie: "Les Apéritifs et Digestifs", prixVente: 8, ingredients: [] },
  { nom: "Diplomatico", categorie: "Les Apéritifs et Digestifs", prixVente: 8, ingredients: [] },
  { nom: "Poire williams", categorie: "Les Apéritifs et Digestifs", prixVente: 8, ingredients: [] },
  { nom: "Whisky", categorie: "Les Apéritifs et Digestifs", prixVente: 8, ingredients: [] },
  { nom: "Picon bière", categorie: "Les Apéritifs et Digestifs", prixVente: 5, ingredients: [] },
  { nom: "Vin blanc (verre)", categorie: "Les Wines", prixVente: 5, ingredients: [] },
  { nom: "Vin rouge (verre)", categorie: "Les Wines", prixVente: 5, ingredients: [] },
  { nom: "Vin rosé (verre)", categorie: "Les Wines", prixVente: 5, ingredients: [] },
  { nom: "Pétillant (verre)", categorie: "Les Wines", prixVente: 6, ingredients: [] },
  { nom: "Bière pression", categorie: "Les Binouz", prixVente: 5, ingredients: [] },
  { nom: "IPA", categorie: "Les Binouz", prixVente: 6, ingredients: [] },
  { nom: "Corona", categorie: "Les Binouz", prixVente: 5, ingredients: [] },
  { nom: "Cidre bouteille", categorie: "Les Binouz", prixVente: 4.5, ingredients: [] },
];

async function run() {
  const snap = await db.collection('recettes').get();
  const existingNoms = new Set(snap.docs.map(d => d.data().nom));

  let created = 0;
  let skipped = 0;
  let batch = db.batch();
  for (const r of boissons) {
    if (existingNoms.has(r.nom)) { skipped++; continue; }
    const ref = db.collection('recettes').doc();
    batch.set(ref, {
      nom: r.nom, categorie: r.categorie, type: 'boisson', actif: true,
      prixVente: r.prixVente, ingredients: r.ingredients, options: [], coutCalcule: 0,
      updatedAt: new Date().toISOString(),
    });
    created++;
    if (created % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (created % 400 !== 0) await batch.commit();
  console.log(`${created} boissons importées, ${skipped} déjà existantes`);
}

run().catch(console.error);
