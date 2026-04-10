import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Recalcul coutCalcule pour toutes les recettes ===\n');

  const [recSnap, pfSnap] = await Promise.all([
    db.collection('recettes').get(),
    db.collection('produitsFournisseurs').get(),
  ]);

  const recettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const pfs = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const getPrixPF = (ingredientNom: string): number => {
    const matches = pfs.filter(p => p.ingredient === ingredientNom);
    if (matches.length === 0) return 0;
    const plusRecent = matches.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return plusRecent.prix / (plusRecent.quantite || plusRecent.nbKg || plusRecent.nbPieces || 1) / (plusRecent.rendement || 1);
  };

  let updated = 0;

  for (const r of recettes) {
    const ings = r.ingredients || [];
    if (ings.length === 0) continue;

    let cout = 0;
    for (const i of ings) {
      const grammage = i.grammage || 0;
      if (grammage === 0) continue;

      // Préparation (par recetteId ou nomIngredient)
      if (i.recetteId) {
        const prep = recettes.find((x: any) => x.id === i.recetteId);
        if (prep?.coutAuKg) { cout += prep.coutAuKg * grammage; continue; }
        if (prep?.coutCalcule && prep?.quantiteProduite) { cout += (prep.coutCalcule / prep.quantiteProduite) * grammage; continue; }
      }

      // Par nomIngredient
      if (i.nomIngredient) {
        // Chercher prépa
        const prep = recettes.find((x: any) => x.categorie === 'Préparations' && x.nom === i.nomIngredient);
        if (prep) {
          if (prep.coutAuKg) { cout += prep.coutAuKg * grammage; continue; }
          if (prep.coutCalcule && prep.quantiteProduite) { cout += (prep.coutCalcule / prep.quantiteProduite) * grammage; continue; }
          continue;
        }
        // Chercher PF
        const prix = getPrixPF(i.nomIngredient);
        if (prix > 0) { cout += prix * grammage; continue; }
      }
    }

    if (cout > 0 && Math.abs(cout - (r.coutCalcule || 0)) > 0.01) {
      const data: any = { coutCalcule: cout };
      // Mettre à jour coutAuKg pour les préparations
      if (r.categorie === 'Préparations' && r.quantiteProduite > 0) {
        data.coutAuKg = cout / r.quantiteProduite;
      }
      await db.collection('recettes').doc(r.id).update(data);
      console.log(`  ✔ ${r.nom}: ${(r.coutCalcule || 0).toFixed(2)} → ${cout.toFixed(2)} €`);
      updated++;
    }
  }

  console.log(`\n  ${updated} recette(s) mises à jour`);
  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
