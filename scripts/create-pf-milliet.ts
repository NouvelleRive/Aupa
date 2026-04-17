import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);
const now = new Date().toISOString();

const PFS = [
  { nom: 'ARMAGNAC GELAS SELECTION 40° 0.70L', prix: 13.26, unite: 'L', quantite: 0.7, categorie: 'boisson', ingredientNom: 'Armagnac', millietCode: '' },
  { nom: 'CREME BOIS LE DUC CASSIS 15° 1L', prix: 6.91, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Crème de cassis', millietCode: '' },
  { nom: 'TEQUILA CAMINO REAL 35° 0.70L', prix: 15.71, unite: 'L', quantite: 0.7, categorie: 'boisson', ingredientNom: 'Tequila', millietCode: '' },
  { nom: 'OCEAN SPRAY CRANBERRY PET 6X1L', prix: 2.93, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Jus de cranberry', millietCode: '' },
  { nom: 'GRANINI GOYAVE PET 6X1L', prix: 2.82, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Jus de goyave', millietCode: '' },
  { nom: 'GRANINI POMME PUR JUS 6X1L VC', prix: 2.81, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Jus de pomme', millietCode: '' },
  { nom: 'GRANINI TOMATE PET 6X1L', prix: 3.15, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Jus de tomate', millietCode: '' },
  { nom: 'MONIN CITROUILLE EPICEE 0.70L', prix: 8.06, unite: 'L', quantite: 0.7, categorie: 'boisson', ingredientNom: 'Sirop citrouille', millietCode: '' },
  { nom: 'VDP CEE VIGNE ZINC ROUGE BIB 10L', prix: 3.33, unite: 'L', quantite: 1, categorie: 'boisson', ingredientNom: 'Vin rouge cubi', millietCode: '' },
];

async function main() {
  const ingSnap = await db.collection('ingredients').get();
  const ingMap = new Map<string, string>();
  for (const d of ingSnap.docs) ingMap.set(d.data().nom, d.id);

  for (const pf of PFS) {
    const ingId = ingMap.get(pf.ingredientNom);
    if (!ingId) {
      console.log(`⚠️ Ingrédient "${pf.ingredientNom}" non trouvé, PF créé sans lien`);
    }

    const data: any = {
      nom: pf.nom,
      prix: pf.prix,
      unite: pf.unite,
      quantite: pf.quantite,
      categorie: pf.categorie,
      rendement: 1,
      fournisseur: 'Milliet',
      historiquesPrix: [{ date: now.slice(0, 10), prix: pf.prix }],
      updatedAt: now,
    };
    if (ingId) {
      data.ingredientId = ingId;
      data.ingredient = pf.ingredientNom;
    }

    const ref = await db.collection('produitsFournisseurs').add(data);
    console.log(`✅ ${pf.nom} | ${pf.prix} €/${pf.unite}`);

    if (ingId) {
      await db.collection('ingredients').doc(ingId).update({ fournisseurRefId: ref.id });
      console.log(`   → lié à ${pf.ingredientNom}`);
    }
  }

  console.log('\nTerminé !');
}

main().catch(err => { console.error(err); process.exit(1); });
