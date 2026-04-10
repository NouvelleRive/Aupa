import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Migration nbKg/nbPieces → quantite ===\n');

  const snap = await db.collection('produitsFournisseurs').get();
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Skip si déjà migré
    if (data.quantite) continue;

    // Fusionner: prendre nbPieces si > 1, sinon nbKg, sinon 1
    const nbPieces = data.nbPieces || 1;
    const nbKg = data.nbKg || 1;
    // Si les deux sont > 1 on multiplie (cas rare), sinon on prend le non-1
    let quantite: number;
    if (nbPieces > 1 && nbKg > 1) {
      quantite = nbPieces * nbKg;
    } else if (nbPieces > 1) {
      quantite = nbPieces;
    } else if (nbKg > 1) {
      quantite = nbKg;
    } else {
      // Tenter d'extraire du nom
      const match = data.nom?.match(/[xX]\s?(\d+)/);
      quantite = match ? parseInt(match[1]) : 1;
    }

    await doc.ref.update({ quantite });
    if (quantite !== 1) {
      console.log(`  ✔ ${data.nom}: quantite=${quantite}`);
    }
    updated++;
  }

  console.log(`\n  ${updated} produit(s) migrés`);
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
