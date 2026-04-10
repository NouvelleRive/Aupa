import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// Prix TTC → HT selon taux TVA
const ht = (ttc: number, tva: number) => +(ttc / (1 + tva / 100)).toFixed(2);

const produits = [
  // Ticket 1
  { nom: 'Raclette sans croûte', prix: ht(3.95, 5.5), unite: 'pièce', categorie: 'laitage' },
  { nom: 'Margarine de cuisson', prix: ht(1.29, 20), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Pomme Golden 2kg', prix: ht(2.99, 5.5), unite: 'kg', categorie: 'fruit', quantite: 2 },
  { nom: 'Tomate cerise mix', prix: ht(5.99, 5.5), unite: 'pièce', categorie: 'légume' },
  { nom: 'Huile de tournesol', prix: ht(1.62, 5.5), unite: 'L', categorie: 'épicerie' },
  { nom: 'Pommes bicolores 2kg', prix: ht(2.99, 5.5), unite: 'kg', categorie: 'fruit', quantite: 2 },
  { nom: 'Sel fin verseuse', prix: ht(0.53, 5.5), unite: 'pièce', categorie: 'épicerie' },
  // Ticket 2
  { nom: 'Poivron mix', prix: ht(0.99, 5.5), unite: 'pièce', categorie: 'légume' },
  { nom: 'Tomate cerise barquette', prix: ht(1.89, 5.5), unite: 'pièce', categorie: 'légume' },
  { nom: 'Président camembert', prix: ht(1.98, 5.5), unite: 'pièce', categorie: 'laitage' },
  { nom: 'Chocolat dessert', prix: ht(3.56, 5.5), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Maggi Fond de Veau', prix: ht(3.53, 5.5), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Poivron Mix 500g', prix: ht(1.99, 5.5), unite: 'g', categorie: 'légume', quantite: 500 },
  // Ticket 3
  { nom: 'Tomate cerise 250g', prix: ht(0.99, 5.5), unite: 'g', categorie: 'légume', quantite: 250 },
  { nom: 'Farine T45', prix: ht(0.65, 5.5), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Concombre', prix: ht(1.39, 5.5), unite: 'pièce', categorie: 'légume' },
  { nom: 'Tomate ronde 1kg', prix: ht(1.89, 5.5), unite: 'kg', categorie: 'légume' },
  // Ticket 4
  { nom: 'Bouillons légumes', prix: ht(0.63, 5.5), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Curcuma moulu', prix: ht(0.89, 5.5), unite: 'pièce', categorie: 'épicerie' },
  { nom: 'Saucisson sec 48 tranches', prix: ht(2.14, 5.5), unite: 'pièce', categorie: 'viande' },
  { nom: 'Viande des grisons', prix: ht(3.99, 5.5), unite: 'pièce', categorie: 'viande' },
  { nom: 'Chorizo en tranches', prix: ht(2.78, 5.5), unite: 'pièce', categorie: 'viande' },
  { nom: 'Cerneaux de noix', prix: ht(2.97, 5.5), unite: 'pièce', categorie: 'épicerie' },
];

async function main() {
  console.log('=== Import produits Lidl ===\n');

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;

  // Vérifier doublons par nom + fournisseur
  const snap = await db.collection('produitsFournisseurs').get();
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const p of produits) {
    const match = existing.find((e: any) => e.fournisseur === 'Lidl' && e.nom === p.nom);
    if (match) {
      await db.collection('produitsFournisseurs').doc((match as any).id).update({
        prix: p.prix,
        historiquesPrix: [...((match as any).historiquesPrix || []), { date: now, prix: p.prix }],
        updatedAt: now,
      });
      console.log(`  ↻ ${p.nom} (mis à jour)`);
      updated++;
    } else {
      await db.collection('produitsFournisseurs').add({
        nom: p.nom,
        prix: p.prix,
        unite: p.unite,
        categorie: p.categorie,
        rendement: 1,
        quantite: (p as any).quantite || 1,
        fournisseur: 'Lidl',
        historiquesPrix: [{ date: now, prix: p.prix }],
        updatedAt: now,
      });
      console.log(`  ✔ ${p.nom} (créé) — ${p.prix} € HT`);
      created++;
    }
  }

  console.log(`\n  ${created} créés, ${updated} mis à jour`);
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
