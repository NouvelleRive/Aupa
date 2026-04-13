'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Achat { id: string; pfId: string; nom: string; qte: number; prixUnitaire: number; total: number; date: string; fournisseur: string; }
interface Vente { nom: string; quantity: number; ttc: number; menuNom: string; mois: string; }
interface Recette { id: string; nom: string; ingredients: any[]; categorie: string; }
interface PF { id: string; nom: string; prix: number; quantite: number; unite: string; rendement: number; ingredientId?: string; ingredient?: string; categorie: string; updatedAt: string; }
interface Ingredient { id: string; nom: string; unite: string; categorie: string; }

const convertQte = (qte: number, unite: string): number => {
  if (unite === 'g') return qte / 1000;
  if (unite === 'cL') return qte / 100;
  return qte;
};

const normalizeCaisse = (s: string) => s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();

export default function Page() {
  const [achats, setAchats] = useState<Achat[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [pfs, setPfs] = useState<PF[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodeDebut, setPeriodeDebut] = useState('');
  const [periodeFin, setPeriodeFin] = useState('');

  useEffect(() => { (async () => {
    const [a, v, r, p, i] = await Promise.all([
      getDocs(collection(db, 'achats')),
      getDocs(collection(db, 'ventes')),
      getDocs(collection(db, 'recettes')),
      getDocs(collection(db, 'produitsFournisseurs')),
      getDocs(collection(db, 'ingredients')),
    ]);
    setAchats(a.docs.map(d => ({ id: d.id, ...d.data() } as Achat)));
    setVentes(v.docs.map(d => d.data() as Vente));
    setRecettes(r.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
    setPfs(p.docs.map(d => ({ id: d.id, ...d.data() } as PF)));
    setIngredients(i.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    setLoading(false);
  })(); }, []);

  if (loading) return <p className="text-gray-400 p-6">Chargement...</p>;

  // Filtrer par période (mois actuel par défaut)
  const debut = periodeDebut || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const fin = periodeFin || new Date().toISOString().slice(0, 10);

  // Achats sur la période
  const achatsP = achats.filter(a => a.date >= debut && a.date <= fin + 'T23:59:59');

  // Ventes sur la période (par mois YYYY-MM)
  const moisDebut = debut.slice(0, 7);
  const moisFin = fin.slice(0, 7);
  const ventesP = ventes.filter(v => v.mois >= moisDebut && v.mois <= moisFin);

  // Calcul théorique : pour chaque vente, parcourir la recette et accumuler les ingrédients
  // Map: ingredientId/nom → { qteTheorique (en kg/L base), coutTheorique }
  const theoriqueParIng = new Map<string, { nom: string; qte: number; cout: number; categorie: string }>();

  // Trouver la recette correspondant à une vente (matching simple par nom normalisé)
  const findRecetteByNomCaisse = (nomVente: string): Recette | null => {
    const norm = normalizeCaisse(nomVente);
    return recettes.find(r => normalizeCaisse(r.nom).replace(/\s+(ete|hiver)$/, '') === norm.replace(/\s+(ete|hiver)$/, '')) || null;
  };

  // Récupérer le PF d'un ingrédient (le plus récent)
  const pfByIngredientId = new Map<string, PF>();
  for (const pf of pfs) {
    if (pf.ingredientId) {
      const existing = pfByIngredientId.get(pf.ingredientId);
      if (!existing || new Date(pf.updatedAt) > new Date(existing.updatedAt)) {
        pfByIngredientId.set(pf.ingredientId, pf);
      }
    }
  }

  const prixUnitPF = (pf: PF): number => {
    const qte = convertQte(pf.quantite || 1, pf.unite || 'kg');
    return pf.prix / qte / (pf.rendement || 1);
  };

  // Récursif : étend une recette en ingrédients de base (gère les prépas)
  const expandIngredients = (recette: Recette, multiplicateur: number): Array<{ ingredientId: string; nom: string; grammage: number; categorie: string }> => {
    const result: Array<{ ingredientId: string; nom: string; grammage: number; categorie: string }> = [];
    for (const ing of (recette.ingredients || [])) {
      const grammage = (ing.grammage || 0) * multiplicateur;
      if (ing.recetteId) {
        const prep = recettes.find(r => r.id === ing.recetteId);
        if (prep) {
          const prepProduite = (prep as any).quantiteProduite || 1;
          result.push(...expandIngredients(prep, grammage / prepProduite));
        }
      } else if (ing.ingredientId) {
        const canon = ingredients.find(x => x.id === ing.ingredientId);
        result.push({ ingredientId: ing.ingredientId, nom: canon?.nom || ing.nomIngredient || '', grammage, categorie: canon?.categorie || 'autre' });
      }
    }
    return result;
  };

  for (const v of ventesP) {
    const r = findRecetteByNomCaisse(v.nom);
    if (!r) continue;
    const expanded = expandIngredients(r, v.quantity);
    for (const e of expanded) {
      const pf = pfByIngredientId.get(e.ingredientId);
      const prixU = pf ? prixUnitPF(pf) : 0;
      const existing = theoriqueParIng.get(e.ingredientId) || { nom: e.nom, qte: 0, cout: 0, categorie: e.categorie };
      existing.qte += e.grammage;
      existing.cout += e.grammage * prixU;
      theoriqueParIng.set(e.ingredientId, existing);
    }
  }

  // Réel : agrégation des achats par ingrédient
  const reelParIng = new Map<string, { nom: string; qte: number; cout: number; categorie: string }>();
  for (const a of achatsP) {
    const pf = pfs.find(p => p.id === a.pfId);
    if (!pf) continue;
    const ingId = pf.ingredientId || pf.id;
    const canon = ingredients.find(x => x.id === ingId);
    const nom = canon?.nom || pf.nom;
    const cat = canon?.categorie || pf.categorie || 'autre';
    const qteBase = convertQte(a.qte, pf.unite || 'kg');
    const existing = reelParIng.get(ingId) || { nom, qte: 0, cout: 0, categorie: cat };
    existing.qte += qteBase;
    existing.cout += a.total;
    reelParIng.set(ingId, existing);
  }

  // Fusionner les deux maps
  const allIds = new Set([...theoriqueParIng.keys(), ...reelParIng.keys()]);
  const rows = [...allIds].map(id => {
    const t = theoriqueParIng.get(id) || { nom: '', qte: 0, cout: 0, categorie: '' };
    const r = reelParIng.get(id) || { nom: '', qte: 0, cout: 0, categorie: '' };
    return {
      id, nom: t.nom || r.nom, categorie: t.categorie || r.categorie,
      qteTh: t.qte, coutTh: t.cout, qteR: r.qte, coutR: r.cout,
      ecart: r.cout - t.cout,
      ecartPct: t.cout > 0 ? ((r.cout - t.cout) / t.cout) * 100 : 0,
    };
  }).sort((a, b) => Math.max(b.coutTh, b.coutR) - Math.max(a.coutTh, a.coutR));

  const totalTh = rows.reduce((s, r) => s + r.coutTh, 0);
  const totalR = rows.reduce((s, r) => s + r.coutR, 0);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Écarts achats / théorique</h1>

      <div className="flex gap-3 mb-6 items-center">
        <input type="date" className="border border-yellow-200 rounded-lg px-3 py-2 text-sm" value={debut} onChange={e => setPeriodeDebut(e.target.value)} />
        <span className="text-gray-400">→</span>
        <input type="date" className="border border-yellow-200 rounded-lg px-3 py-2 text-sm" value={fin} onChange={e => setPeriodeFin(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Théorique (devrait)</p>
          <p className="text-2xl font-bold">{totalTh.toFixed(0)} €</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Réel (acheté)</p>
          <p className="text-2xl font-bold">{totalR.toFixed(0)} €</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Écart</p>
          <p className={`text-2xl font-bold ${totalR - totalTh > 0 ? 'text-red-500' : 'text-green-500'}`}>{(totalR - totalTh).toFixed(0)} €</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Ingrédient</th>
              <th className="px-4 py-3 text-left">Catégorie</th>
              <th className="px-4 py-3 text-right">Théorique</th>
              <th className="px-4 py-3 text-right">Réel</th>
              <th className="px-4 py-3 text-right">Écart €</th>
              <th className="px-4 py-3 text-right">Écart %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-yellow-50">
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-8">Pas de données pour cette période.</td></tr>}
            {rows.map(r => {
              const ecartColor = r.ecartPct > 15 ? 'text-red-500' : r.ecartPct > 5 ? 'text-yellow-500' : 'text-green-500';
              return (
                <tr key={r.id} className="hover:bg-yellow-50">
                  <td className="px-4 py-3 font-medium">{r.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{r.categorie}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.coutTh.toFixed(0)} €</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.coutR.toFixed(0)} €</td>
                  <td className={`px-4 py-3 text-right font-semibold ${ecartColor}`}>{r.ecart > 0 ? '+' : ''}{r.ecart.toFixed(0)} €</td>
                  <td className={`px-4 py-3 text-right font-semibold ${ecartColor}`}>{r.coutTh > 0 ? (r.ecartPct > 0 ? '+' : '') + r.ecartPct.toFixed(0) + '%' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
