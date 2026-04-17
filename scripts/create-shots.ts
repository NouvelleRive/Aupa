import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  const now = new Date().toISOString();
  const base = {
    type: 'boisson',
    categorie: 'Fresh & Detox',
    actif: true,
    saisons: [],
    carte: '',
    options: [],
    coutCalcule: 0,
    updatedAt: now,
  };

  const shots = [
    {
      nom: 'Shot gingembre bio',
      prixVente: 2,
      ingredients: [
        { ingredientId: '3aEbKkS6GMTYv6oqDOp4', nomIngredient: 'Gingembre liquide', grammage: 0.03 },
      ],
    },
    {
      nom: 'Shot fleur d\'oranger bio',
      prixVente: 3,
      ingredients: [
        { ingredientId: 'rwQ7hMRMQzYQtBbacmhE', nomIngredient: 'Fleur d\'oranger', grammage: 0.03 },
      ],
    },
    {
      nom: 'Shot cranberry bio',
      prixVente: 2,
      ingredients: [
        { ingredientId: 'mwQxDEFrt0Eo6ahUYwJM', nomIngredient: 'Jus de cranberry', grammage: 0.03 },
      ],
    },
  ];

  for (const s of shots) {
    await db.collection('recettes').add({ ...base, ...s });
    console.log(`✅ ${s.nom} créé (${s.prixVente} €)`);
  }

  console.log('\nTerminé !');
}

main().catch(err => { console.error(err); process.exit(1); });
