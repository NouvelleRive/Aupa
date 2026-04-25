'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ingredient, ProduitFournisseur, Categorie } from '@/lib/types';

type PFWithFournisseur = ProduitFournisseur & { fournisseur?: string; quantite?: number; ingredient?: string };

interface LigneComparatif {
  ingredient: Ingredient;
  pfs: { fournisseur: string; pf: PFWithFournisseur; prixNormalise: number }[];
  moinsCher: string | null;
  plusCher: string | null;
  economiePotentielle: number; // €/unité (différence par kg/L/pce)
  economieAnnuelle: number;    // €/an (basé sur volumes 12 derniers mois)
  fournisseurActuel: string | null;
  prixActuel: number | null;
  prixMoinsCher: number | null;
}

const FOURNISSEURS_COULEURS: Record<string, string> = {
  Foodflow: 'bg-green-100 text-green-800',
  Foodomarket: 'bg-teal-100 text-teal-800',
  Rungis: 'bg-red-100 text-red-800',
  Milliet: 'bg-blue-100 text-blue-800',
  LBA: 'bg-purple-100 text-purple-800',
  Lidl: 'bg-orange-100 text-orange-800',
  'Les Assembleurs': 'bg-rose-100 text-rose-800',
  Amazon: 'bg-yellow-100 text-yellow-800',
};

const FOURNISSEURS_ORDRE = ['Foodflow', 'Foodomarket', 'Rungis', 'Milliet', 'LBA', 'Lidl', 'Les Assembleurs', 'Amazon'];

// Extrait un poids/volume depuis le nom du PF pour convertir pièce → kg/L
// Reconnaît "150g", "1kg", "33cl", "1L", "x9", etc.
function parseGrammage(nom: string): { kg?: number; L?: number } {
  const n = nom.toLowerCase();
  // Multiplicateur "x9" ou "9x"
  const multMatch = n.match(/(?:^|\s|x)\s*(\d+)\s*x|x\s*(\d+)(?:\s|$)/);
  const mult = multMatch ? parseInt(multMatch[1] || multMatch[2]) : 1;
  // Poids unitaire
  const gMatch = n.match(/(\d+(?:[.,]\d+)?)\s*g(?:r|ramme)?(?:\s|\)|$|x|\b)/);
  const kgMatch = n.match(/(\d+(?:[.,]\d+)?)\s*kg/);
  const lMatch = n.match(/(\d+(?:[.,]\d+)?)\s*l(?:itre)?(?:\s|$|x|\b)/);
  const clMatch = n.match(/(\d+(?:[.,]\d+)?)\s*cl/);
  if (kgMatch) return { kg: parseFloat(kgMatch[1].replace(',', '.')) * mult };
  if (gMatch) return { kg: parseFloat(gMatch[1].replace(',', '.')) / 1000 * mult };
  if (lMatch) return { L: parseFloat(lMatch[1].replace(',', '.')) * mult };
  if (clMatch) return { L: parseFloat(clMatch[1].replace(',', '.')) / 100 * mult };
  return {};
}

function normalisePrix(pf: PFWithFournisseur, ingUnite?: string): number {
  const qte = pf.quantite || 1;
  const rendement = pf.rendement || 1;
  let prixBase = pf.prix;
  if (pf.unite === 'g') prixBase = pf.prix / (qte / 1000);
  else if (pf.unite === 'cL') prixBase = pf.prix / (qte / 100);
  else if (pf.unite === 'kg' || pf.unite === 'L') prixBase = pf.prix / qte;
  else {
    // PF en pièce/pack — si l'ingrédient est en kg/L, essayer de parser le grammage
    const ingIsKg = ingUnite === 'kg' || ingUnite === 'g';
    const ingIsL = ingUnite === 'L' || ingUnite === 'cL';
    if (ingIsKg || ingIsL) {
      const gramm = parseGrammage(pf.nom || '');
      if (ingIsKg && gramm.kg) prixBase = pf.prix / gramm.kg;
      else if (ingIsL && gramm.L) prixBase = pf.prix / gramm.L;
      else prixBase = pf.prix / qte; // fallback
    } else {
      prixBase = pf.prix / qte;
    }
  }
  return prixBase / rendement;
}

function uniteLabel(ing: Ingredient): string {
  if (ing.unite === 'kg' || ing.unite === 'g') return '€/kg';
  if (ing.unite === 'L' || ing.unite === 'cL') return '€/L';
  return '€/pce';
}

type SortKey = 'nom' | 'categorie' | 'economie' | 'fournisseur' | 'prix' | 'commande';
type SortDir = 'asc' | 'desc';

export default function ComparatifFournisseurs() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [pfs, setPfs] = useState<PFWithFournisseur[]>([]);
  const [depensesParIng, setDepensesParIng] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('all');
  const [filterMode, setFilterMode] = useState<'all' | 'multi' | 'single' | 'switch'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('commande');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    (async () => {
      const [ingSnap, pfSnap, achatsSnap] = await Promise.all([
        getDocs(collection(db, 'ingredients')),
        getDocs(collection(db, 'produitsFournisseurs')),
        getDocs(collection(db, 'achats')),
      ]);
      const ings = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));
      const pfsArr = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as PFWithFournisseur));

      // Map PF id → ingredient id (via fournisseurRefId ou matching nom)
      const pfToIngId = new Map<string, string>();
      for (const ing of ings) {
        if (ing.fournisseurRefId) pfToIngId.set(ing.fournisseurRefId, ing.id);
      }
      for (const pf of pfsArr) {
        if (pfToIngId.has(pf.id)) continue;
        if ((pf as any).ingredientId) pfToIngId.set(pf.id, (pf as any).ingredientId);
      }

      // Total dépensé par ingrédient sur les 12 derniers mois
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const depMap = new Map<string, number>();
      for (const d of achatsSnap.docs) {
        const a = d.data() as { pfId?: string; total?: number; date?: string | { toDate: () => Date } };
        const total = a.total || 0;
        if (total <= 0 || !a.pfId) continue;
        const dateStr = typeof a.date === 'string' ? a.date : (a.date as { toDate: () => Date })?.toDate?.()?.toISOString?.() || '';
        if (dateStr < cutoffStr) continue;
        const ingId = pfToIngId.get(a.pfId);
        if (!ingId) continue;
        depMap.set(ingId, (depMap.get(ingId) || 0) + total);
      }

      setIngredients(ings);
      setPfs(pfsArr);
      setDepensesParIng(depMap);
      setLoading(false);
    })();
  }, []);

  const lignes = useMemo<LigneComparatif[]>(() => {
    return ingredients
      .map(ing => {
        const pfsIng = pfs.filter(
          p => p.ingredientId === ing.id || p.ingredient === ing.nom
        );

        const parFournisseur = new Map<string, { pf: PFWithFournisseur; prixNormalise: number }>();
        for (const pf of pfsIng) {
          const f = pf.fournisseur || 'Inconnu';
          const prix = normalisePrix(pf, ing.unite);
          if (prix <= 0 || !isFinite(prix)) continue;
          const existing = parFournisseur.get(f);
          if (!existing || new Date(pf.updatedAt) > new Date(existing.pf.updatedAt)) {
            parFournisseur.set(f, { pf, prixNormalise: prix });
          }
        }

        const entries = Array.from(parFournisseur.entries()).map(([fournisseur, v]) => ({
          fournisseur,
          pf: v.pf,
          prixNormalise: v.prixNormalise,
        }));

        entries.sort((a, b) => a.prixNormalise - b.prixNormalise);

        const moinsCher = entries.length > 0 ? entries[0].fournisseur : null;
        const plusCher = entries.length > 1 ? entries[entries.length - 1].fournisseur : null;
        const prixMoinsCher = entries.length > 0 ? entries[0].prixNormalise : null;

        const pfActuel = pfs.find(p => p.id === ing.fournisseurRefId);
        const fournisseurActuel = pfActuel?.fournisseur || null;
        const prixActuel = pfActuel ? normalisePrix(pfActuel as PFWithFournisseur, ing.unite) : null;

        const economiePotentielle =
          prixActuel && prixMoinsCher && fournisseurActuel !== moinsCher
            ? prixActuel - prixMoinsCher
            : 0;
        // Économie annuelle = dépense 12 derniers mois × (1 - prixMoinsCher/prixActuel)
        const depAnn = depensesParIng.get(ing.id) || 0;
        const economieAnnuelle =
          prixActuel && prixMoinsCher && fournisseurActuel !== moinsCher && prixActuel > 0
            ? depAnn * (1 - prixMoinsCher / prixActuel)
            : 0;

        return { ingredient: ing, pfs: entries, moinsCher, plusCher, economiePotentielle, economieAnnuelle, fournisseurActuel, prixActuel, prixMoinsCher };
      })
      .filter(l => l.pfs.length > 0);
  }, [ingredients, pfs, depensesParIng]);

  const sortedLignes = useMemo(() => {
    return [...lignes].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'nom') { va = a.ingredient.nom.toLowerCase(); vb = b.ingredient.nom.toLowerCase(); }
      else if (sortKey === 'categorie') { va = a.ingredient.categorie; vb = b.ingredient.categorie; }
      else if (sortKey === 'economie') { va = a.economieAnnuelle; vb = b.economieAnnuelle; }
      else if (sortKey === 'fournisseur') { va = a.fournisseurActuel || ''; vb = b.fournisseurActuel || ''; }
      else if (sortKey === 'prix') { va = a.prixActuel || a.prixMoinsCher || 0; vb = b.prixActuel || b.prixMoinsCher || 0; }
      else if (sortKey === 'commande') { va = depensesParIng.get(a.ingredient.id) || 0; vb = depensesParIng.get(b.ingredient.id) || 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [lignes, sortKey, sortDir, depensesParIng]);

  const filteredLignes = useMemo(() => {
    return sortedLignes.filter(l => {
      if (search) {
        const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const nom = l.ingredient.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!nom.includes(s)) return false;
      }
      if (filterCategorie !== 'all' && l.ingredient.categorie !== filterCategorie) return false;
      if (filterMode === 'multi' && l.pfs.length < 2) return false;
      if (filterMode === 'single' && l.pfs.length !== 1) return false;
      if (filterMode === 'switch' && l.economiePotentielle <= 0) return false;
      return true;
    });
  }, [sortedLignes, search, filterCategorie, filterMode]);

  const stats = useMemo(() => {
    const multi = lignes.filter(l => l.pfs.length >= 2);
    const switchables = lignes.filter(l => l.economiePotentielle > 0);
    const totalEconomie = switchables.reduce((s, l) => s + l.economieAnnuelle, 0);
    return {
      total: lignes.length,
      multi: multi.length,
      single: lignes.filter(l => l.pfs.length === 1).length,
      switchables: switchables.length,
      totalEconomie,
    };
  }, [lignes]);

  const categories: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie salée', 'épicerie sucrée', 'boisson', 'autre'];
  const fournisseurs = useMemo(() => {
    const set = new Set(pfs.map(p => p.fournisseur).filter((f): f is string => !!f));
    set.add('Foodomarket');
    set.add('Rungis');
    const arr = Array.from(set);
    return arr.sort((a, b) => {
      const ia = FOURNISSEURS_ORDRE.indexOf(a);
      const ib = FOURNISSEURS_ORDRE.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [pfs]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'economie' ? 'desc' : 'asc'); }
  };

  const sortIcon = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

  const [refreshingFM, setRefreshingFM] = useState(false);
  const refreshFoodomarket = async () => {
    setRefreshingFM(true);
    try {
      const [fmRes, ruRes] = await Promise.all([
        fetch('/api/foodomarket/refresh', { method: 'POST' }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) })),
        fetch('/api/rungis/refresh', { method: 'POST' }).then(r => r.json()).catch(e => ({ ok: false, error: String(e) })),
      ]);
      const msgFM = fmRes.ok ? `Foodomarket : ${fmRes.updated || 0} maj, ${fmRes.created || 0} créés` : `Foodomarket : ${fmRes.error}`;
      const msgRu = ruRes.ok ? `Rungis : ${ruRes.updated || 0} maj, ${ruRes.created || 0} créés${ruRes.noMatch ? `, ${ruRes.noMatch} sans match` : ''} (à valider)` : `Rungis : ${ruRes.error}`;
      alert(msgFM + '\n' + msgRu);
      window.location.reload();
    } catch (e: unknown) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefreshingFM(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Chargement...</div>;

  return (
    <div>
      {/* Header + Stats */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Comparatif Fournisseurs</h1>
        <div className="flex gap-2 text-sm items-center">
          <button
            onClick={refreshFoodomarket}
            disabled={refreshingFM}
            className="bg-teal-100 hover:bg-teal-200 text-teal-800 rounded-lg px-4 py-2 border border-teal-200 font-semibold disabled:opacity-50"
          >
            {refreshingFM ? 'Actualisation...' : 'Actualiser tout'}
          </button>
          <div className="bg-white rounded-lg px-4 py-2 border border-gray-200">
            <span className="text-gray-500">{stats.total} ingrédients</span>
          </div>
          <div className="bg-yellow-50 rounded-lg px-4 py-2 border border-yellow-200">
            <span className="font-semibold text-yellow-700">{stats.multi} comparables</span>
          </div>
          {stats.switchables > 0 && (
            <div className="bg-red-50 rounded-lg px-4 py-2 border border-red-200">
              <span className="font-semibold text-red-600">{stats.switchables} switch possibles</span>
              <span className="text-red-400 ml-1 text-xs">(~{Math.round(stats.totalEconomie).toLocaleString('fr-FR')} €/an)</span>
            </div>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-6">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm flex-1"
          placeholder="Rechercher un ingrédient..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
          value={filterCategorie}
          onChange={e => setFilterCategorie(e.target.value)}
        >
          <option value="all">Toutes catégories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
          value={filterMode}
          onChange={e => setFilterMode(e.target.value as typeof filterMode)}
        >
          <option value="all">Tous ({stats.total})</option>
          <option value="multi">Multi-fournisseurs ({stats.multi})</option>
          <option value="single">Mono-fournisseur ({stats.single})</option>
          <option value="switch">Switch possibles ({stats.switchables})</option>
        </select>
        <select
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
          value={`${sortKey}-${sortDir}`}
          onChange={e => { const [k, d] = e.target.value.split('-'); setSortKey(k as SortKey); setSortDir(d as SortDir); }}
        >
          <option value="nom-asc">Tri : A → Z</option>
          <option value="commande-desc">Tri : plus commandés</option>
          <option value="prix-desc">Tri : plus cher</option>
          <option value="economie-desc">Tri : économie</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-3 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:text-yellow-500 w-[12%]" onClick={() => handleSort('nom')}>
                Ingrédient{sortIcon('nom')}
              </th>
              <th className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-2 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:text-yellow-500 w-[19%]" onClick={() => handleSort('fournisseur')}>
                PF de réf{sortIcon('fournisseur')}
              </th>
              {fournisseurs.map(f => (
                <th key={f} className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-2 py-3 text-right font-semibold text-gray-600" style={{ width: `${Math.floor(50 / fournisseurs.length)}%` }}>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${FOURNISSEURS_COULEURS[f] || 'bg-gray-100 text-gray-600'}`}>{f}</span>
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-2 py-3 text-center font-semibold text-gray-600 w-[7%]">Reco</th>
              <th className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-2 py-3 text-right font-semibold text-gray-600 cursor-pointer hover:text-yellow-500 w-[9%]" onClick={() => handleSort('economie')}>
                Économies sur un an{sortIcon('economie')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLignes.map(l => {
              const prixParFournisseur = new Map(l.pfs.map(p => [p.fournisseur, p]));
              const shouldSwitch = l.economiePotentielle > 0;
              const unite = uniteLabel(l.ingredient);
              return (
                <tr key={l.ingredient.id} className={`border-b border-gray-50 hover:bg-yellow-50/50 transition-colors ${shouldSwitch ? 'bg-red-50/20' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.ingredient.nom}</div>
                  </td>
                  <td className="px-4 py-3">
                    {l.fournisseurActuel ? (
                      <div>
                        <div className="text-xs text-gray-600 truncate max-w-[160px]" title={l.pfs.find(p => p.fournisseur === l.fournisseurActuel)?.pf.nom}>
                          {l.pfs.find(p => p.fournisseur === l.fournisseurActuel)?.pf.nom || '—'}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${FOURNISSEURS_COULEURS[l.fournisseurActuel] || 'bg-gray-100 text-gray-600'}`}>
                          {l.fournisseurActuel}
                        </span>
                        {l.prixActuel && <span className="text-xs text-gray-500 ml-1">{l.prixActuel.toFixed(2)} {unite}</span>}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {fournisseurs.map(f => {
                    const entry = prixParFournisseur.get(f);
                    if (!entry) return <td key={f} className="px-2 py-3 text-right text-gray-200">—</td>;
                    const isCheapest = f === l.moinsCher && l.pfs.length > 1;
                    const isMostExpensive = f === l.plusCher && l.pfs.length > 1;
                    const isActuel = f === l.fournisseurActuel;
                    const prixProduit = entry.pf.prix;
                    return (
                      <td key={f} className="px-2 py-3">
                        <div className="text-xs text-gray-600 break-words leading-tight">{entry.pf.nom}</div>
                        <div className="font-mono text-sm text-gray-800">{prixProduit.toFixed(2)} €</div>
                        <div className={`font-mono text-xs ${isCheapest ? 'text-green-600 font-bold' : isMostExpensive ? 'text-red-400' : 'text-gray-400'}`}>
                          {entry.prixNormalise.toFixed(2)} {unite}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-3 text-center">
                    {shouldSwitch ? (
                      <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-semibold">CHANGER</span>
                    ) : l.pfs.length > 1 ? (
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-semibold">GARDER</span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {l.economieAnnuelle > 1 ? (
                      <div>
                        <div className="font-semibold text-red-600">-{Math.round(l.economieAnnuelle).toLocaleString('fr-FR')} €</div>
                        <div className="text-xs text-gray-400">-{l.economiePotentielle.toFixed(2)} {unite}</div>
                      </div>
                    ) : (
                      <span className="text-gray-200">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredLignes.length === 0 && (
          <div className="text-center py-8 text-gray-400">Aucun résultat</div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-300 text-right">
        Prix normalisés par unité de base (kg/L/pièce). Économie = différence entre fournisseur actuel et moins cher.
      </div>
    </div>
  );
}
