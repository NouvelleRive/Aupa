import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const NOMS = ['Thé glacé', 'Limonade', 'Citron pressé', 'Citronade', 'Orange pressé', 'Orangina', 'Ginger beer'];

async function main() {
  const recSnap = await db.collection('recettes').get();
  const all = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const nom of NOMS) {
    const found = all.filter((r: any) => r.nom?.toLowerCase() === nom.toLowerCase());
    if (found.length === 0) {
      console.log(`❌ ${nom} — NON TROUVÉE`);
    } else {
      for (const r of found) {
        const data = r as any;
        const ings = (data.ingredients || []).map((i: any) => {
          return `${i.nomIngredient || i.preparationId || '?'} ${i.grammage}`;
        }).join(', ');
        console.log(`✅ ${data.nom} [${data.categorie}] — ${ings || 'aucun ingrédient'}`);
      }
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
