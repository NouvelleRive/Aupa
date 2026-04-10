import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function recalculerTousLesCouts() {
  const [recSnap, pfSnap] = await Promise.all([
    getDocs(collection(db, 'recettes')),
    getDocs(collection(db, 'produitsFournisseurs')),
  ]);

  const recettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const pfs = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const getPrixPF = (ingredientNom: string): number => {
    const matches = pfs.filter((p: any) => p.ingredient === ingredientNom);
    if (matches.length === 0) return 0;
    const plusRecent = matches.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return plusRecent.prix / (plusRecent.quantite || plusRecent.nbKg || plusRecent.nbPieces || 1) / (plusRecent.rendement || 1);
  };

  // D'abord recalculer les préparations (elles peuvent dépendre de PF)
  // Puis les recettes (elles peuvent dépendre de préparations)
  for (const pass of ['Préparations', 'other']) {
    for (const r of recettes) {
      if (pass === 'Préparations' && r.categorie !== 'Préparations') continue;
      if (pass === 'other' && r.categorie === 'Préparations') continue;

      const ings = r.ingredients || [];
      if (ings.length === 0) continue;

      let cout = 0;
      for (const i of ings) {
        const grammage = i.grammage || 0;
        if (grammage === 0) continue;

        if (i.recetteId) {
          const prep = recettes.find((x: any) => x.id === i.recetteId);
          if (prep?.coutAuKg) { cout += prep.coutAuKg * grammage; continue; }
          if (prep?.coutCalcule && prep?.quantiteProduite) { cout += (prep.coutCalcule / prep.quantiteProduite) * grammage; continue; }
        }

        if (i.nomIngredient) {
          const prep = recettes.find((x: any) => x.categorie === 'Préparations' && x.nom === i.nomIngredient);
          if (prep) {
            if (prep.coutAuKg) { cout += prep.coutAuKg * grammage; continue; }
            if (prep.coutCalcule && prep.quantiteProduite) { cout += (prep.coutCalcule / prep.quantiteProduite) * grammage; continue; }
            continue;
          }
          const prix = getPrixPF(i.nomIngredient);
          if (prix > 0) { cout += prix * grammage; continue; }
        }
      }

      if (cout > 0 && Math.abs(cout - (r.coutCalcule || 0)) > 0.01) {
        const data: any = { coutCalcule: cout };
        if (r.categorie === 'Préparations' && r.quantiteProduite > 0) {
          data.coutAuKg = cout / r.quantiteProduite;
        }
        await updateDoc(doc(db, 'recettes', r.id), data);
        // Mettre à jour la valeur locale pour les recettes qui dépendent de cette prépa
        r.coutCalcule = cout;
        if (data.coutAuKg) r.coutAuKg = data.coutAuKg;
      }
    }
  }
}
