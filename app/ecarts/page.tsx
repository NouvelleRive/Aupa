'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import TimePeriodFilter, { isInPeriod, type TimePeriod } from '@/components/TimePeriodFilter';

interface Achat { id: string; pfId: string; nom: string; qte: number; prixUnitaire: number; total: number; date: string; fournisseur: string; }
interface Vente { nom: string; quantity: number; ttc: number; menuNom: string; mois: string; jour?: string; }
interface Recette { id: string; nom: string; ingredients: any[]; categorie: string; }
interface PF { id: string; nom: string; prix: number; quantite: number; unite: string; rendement: number; ingredientId?: string; ingredient?: string; categorie: string; updatedAt: string; }
interface Ingredient { id: string; nom: string; unite: string; categorie: string; }

const convertQte = (qte: number, unite: string): number => {
  if (unite === 'g') return qte / 1000;
  if (unite === 'cL') return qte / 100;
  return qte;
};

const normalizeCaisse = (s: string) => s.toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, '').trim();

export default function Page() {
  const [achats, setAchats] = useState<Achat[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [pfs, setPfs] = useState<PF[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Default = Hier
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const hierStr = hier.toISOString().slice(0, 10);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>({ label: 'Hier', dateDebut: hierStr, dateFin: hierStr });

  // 1) Petites collections : load une seule fois (recettes 286 + PFs 842 + ingredients 203)
  useEffect(() => {
    (async () => {
      const [r, p, i] = await Promise.all([
        getDocs(collection(db, 'recettes')),
        getDocs(collection(db, 'produitsFournisseurs')),
        getDocs(collection(db, 'ingredients')),
      ]);
      setRecettes(r.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
      setPfs(p.docs.map(d => ({ id: d.id, ...d.data() } as PF)));
      setIngredients(i.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    })();
  }, []);

  // 2) Achats + ventes filtrés Firestore-side par période
  useEffect(() => {
    (async () => {
      setRefreshing(true);
      if (timePeriod) {
        const [a, v] = await Promise.all([
          getDocs(query(
            collection(db, 'achats'),
            where('date', '>=', timePeriod.dateDebut),
            where('date', '<=', timePeriod.dateFin + 'T23:59:59.999Z'),
          )),
          getDocs(query(
            collection(db, 'ventes'),
            where('jour', '>=', timePeriod.dateDebut),
            where('jour', '<=', timePeriod.dateFin),
          )),
        ]);
        setAchats(a.docs.map(d => ({ id: d.id, ...d.data() } as Achat)));
        setVentes(v.docs.map(d => d.data() as Vente));
      } else {
        const [a, v] = await Promise.all([
          getDocs(collection(db, 'achats')),
          getDocs(collection(db, 'ventes')),
        ]);
        setAchats(a.docs.map(d => ({ id: d.id, ...d.data() } as Achat)));
        setVentes(v.docs.map(d => d.data() as Vente));
      }
      setLoading(false);
      setRefreshing(false);
    })();
  }, [timePeriod]);

  // Années dispos pour le filtre (3 dernières)
  const availableDatesUI = useMemo(() => {
    const y = new Date().getFullYear();
    return [`${y}-01-01`, `${y - 1}-01-01`, `${y - 2}-01-01`];
  }, []);

  // achats/ventes déjà filtrés Firestore-side ; client-side filter pour multi-ranges
  const achatsP = useMemo(() => {
    if (!timePeriod?.ranges || timePeriod.ranges.length === 0) return achats;
    return achats.filter(a => isInPeriod(a.date, timePeriod));
  }, [achats, timePeriod]);
  const ventesP = useMemo(() => {
    if (!timePeriod?.ranges || timePeriod.ranges.length === 0) return ventes;
    return ventes.filter(v => isInPeriod(v.jour || v.mois, timePeriod));
  }, [ventes, timePeriod]);

  // Trouver la recette correspondant à une vente (matching simple par nom normalisé)
  const findRecetteByNomCaisse = (nomVente: string): Recette | null => {
    const norm = normalizeCaisse(nomVente);
    return recettes.find(r => normalizeCaisse(r.nom).replace(/\s+(ete|hiver)$/, '') === norm.replace(/\s+(ete|hiver)$/, '')) || null;
  };

  // Récupérer le PF d'un ingrédient (le plus récent)
  const pfByIngredientId = useMemo(() => {
    const m = new Map<string, PF>();
    for (const pf of pfs) {
      if (pf.ingredientId) {
        const existing = m.get(pf.ingredientId);
        if (!existing || new Date(pf.updatedAt) > new Date(existing.updatedAt)) {
          m.set(pf.ingredientId, pf);
        }
      }
    }
    return m;
  }, [pfs]);

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

  const { rows, totalTh, totalR } = useMemo(() => {
    // Théorique : pour chaque vente, expand en ingrédients
    const theoriqueParIng = new Map<string, { nom: string; qte: number; cout: number; categorie: string }>();
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
    return { rows, totalTh, totalR };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesP, achatsP, recettes, pfs, ingredients, pfByIngredientId]);

  if (loading) return <p className="text-gray-400 p-6">Chargement...</p>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Écarts achats / théorique</h1>
        {refreshing && <span className="text-xs text-gray-400">Actualisation…</span>}
      </div>

      <TimePeriodFilter availableDates={availableDatesUI} value={timePeriod} onChange={setTimePeriod} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
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

      <div className="bg-white rounded-xl border border-yellow-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
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
