import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function recalculerTousLesCouts() {
  const [recSnap, pfSnap, ingSnap] = await Promise.all([
    getDocs(collection(db, 'recettes')),
    getDocs(collection(db, 'produitsFournisseurs')),
    getDocs(collection(db, 'ingredients')),
  ]);

  const recettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const pfs = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const ingredients = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const convertQuantite = (qte: number, unite: string): number => {
    if (unite === 'g') return qte / 1000;
    if (unite === 'cL') return qte / 100;
    return qte;
  };

  const prixUnitPF = (pf: any): number => {
    const qte = convertQuantite(pf.quantite || pf.nbKg || pf.nbPieces || 1, pf.unite || 'kg');
    return pf.prix / qte / (pf.rendement || 1);
  };

  // Cherche le prix PF en respectant le fournisseurRefId de l'ingrédient
  const getPrixPF = (ingredientNom: string, ingredientId?: string): number => {
    // Si on a un ingredientId, vérifier s'il y a un fournisseurRefId
    if (ingredientId) {
      const ing = ingredients.find((x: any) => x.id === ingredientId);
      if (ing?.fournisseurRefId) {
        const refPf = pfs.find((p: any) => p.id === ing.fournisseurRefId);
        if (refPf) return prixUnitPF(refPf);
      }
    }
    // Sinon chercher par nom d'ingrédient — trouver l'ingrédient canonique pour son fournisseurRefId
    const ing = ingredients.find((x: any) => x.nom === ingredientNom);
    if (ing?.fournisseurRefId) {
      const refPf = pfs.find((p: any) => p.id === ing.fournisseurRefId);
      if (refPf) return prixUnitPF(refPf);
    }
    // Fallback : PF le plus récent par ingredientId
    if (ingredientId) {
      const byId = pfs.filter((p: any) => p.ingredientId === ingredientId);
      if (byId.length > 0) {
        const plusRecent = byId.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        return prixUnitPF(plusRecent);
      }
    }
    // Fallback : PF le plus récent par nom
    const matches = pfs.filter((p: any) => p.ingredient === ingredientNom);
    if (matches.length === 0) return 0;
    const plusRecent = matches.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    return prixUnitPF(plusRecent);
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
          const prix = getPrixPF(i.nomIngredient, i.ingredientId);
          if (prix > 0) { cout += prix * grammage; continue; }
        }

        // Ingrédient avec seulement ingredientId (pas de nomIngredient)
        if (i.ingredientId && !i.nomIngredient) {
          const ing = ingredients.find((x: any) => x.id === i.ingredientId);
          const prix = getPrixPF(ing?.nom || '', i.ingredientId);
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
