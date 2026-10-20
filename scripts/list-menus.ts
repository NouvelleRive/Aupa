import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function main() {
  const snap = await getDocs(collection(db, 'menus'));
  for (const d of snap.docs) {
    const m = d.data() as any;
    const nbRec = (m.categories || []).reduce((s: number, c: any) => s + (c.recettes?.length || c.recetteIds?.length || 0), 0);
    const v = await getDocs(query(collection(db, 'ventes'), where('menuNom', '==', m.nom)));
    console.log(`${d.id} | ${m.nom} | ${m.dateDebut}→${m.dateFin} | cats=${(m.categories||[]).length} recettes=${nbRec} | createdAt=${m.createdAt} | ventes(nom)=${v.size}`);
  }
  process.exit(0);
}
main();
