import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

async function list() {
  const [menuSnap, recSnap] = await Promise.all([
    db.collection('menus').get(),
    db.collection('recettes').get(),
  ]);

  const recById = new Map(recSnap.docs.map(d => [d.id, d.data().nom as string]));

  for (const d of menuSnap.docs) {
    const menu = d.data();
    console.log(`\n══════ ${menu.nom} (${menu.dateDebut} → ${menu.dateFin}) ══════`);
    const cats = menu.categories || [];
    for (const cat of cats) {
      console.log(`\n  ── ${cat.nom} ──`);
      const recettes = cat.recettes || cat.recetteIds?.map((id: string) => ({ id, prixVente: 0 })) || [];
      for (const r of recettes) {
        const nom = recById.get(r.id) || `❌ INTROUVABLE (${r.id})`;
        console.log(`    ${nom} — ${r.prixVente || 0} €`);
      }
    }
  }
}

list().catch(console.error);
