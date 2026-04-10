import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const ht = (ttc: number, tva: number) => +(ttc / (1 + tva / 100)).toFixed(2);

const produits = [
  { nom: 'Camembert', prix: ht(1.49, 5.5), unite: 'pièce', categorie: 'laitage' },
  { nom: 'Oranges 3kg', prix: ht(4.79, 5.5), unite: 'kg', categorie: 'fruit', quantite: 3 },
  { nom: 'Miel de fleurs', prix: ht(3.19, 5.5), unite: 'pièce', categorie: 'épicerie' },
];

async function main() {
  console.log('=== Import produits Lidl (lot 2) ===\n');
  const now = new Date().toISOString();
  const snap = await db.collection('produitsFournisseurs').get();
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  let created = 0, updated = 0;

  for (const p of produits) {
    const match = existing.find((e: any) => e.fournisseur === 'Lidl' && e.nom === p.nom);
    if (match) {
      console.log(`  ↻ ${p.nom} (déjà existant)`);
      updated++;
    } else {
      await db.collection('produitsFournisseurs').add({
        nom: p.nom, prix: p.prix, unite: p.unite, categorie: p.categorie,
        rendement: 1, quantite: (p as any).quantite || 1, fournisseur: 'Lidl',
        historiquesPrix: [{ date: now, prix: p.prix }], updatedAt: now,
      });
      console.log(`  ✔ ${p.nom} — ${p.prix} € HT`);
      created++;
    }
  }
  console.log(`\n  ${created} créés, ${updated} déjà existants\n=== Terminé ===`);
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
