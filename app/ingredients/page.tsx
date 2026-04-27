'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ingredient, Categorie } from '@/lib/types';
import { recalculerTousLesCouts } from '@/lib/recalculCouts';

const CATEGORIES: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie salée', 'épicerie sucrée', 'boisson', 'autre'];

type Tab = 'bruts' | 'preparations';

interface PrepData {
  id: string;
  nom: string;
  coutAuKg: number;
  coutCalcule: number;
  quantiteProduite: number;
  uniteProduction: string;
  sousIngredients: string[];
  recettesUtilisees: string[];
}

export default function IngredientsPage() {
  const [tab, setTab] = useState<Tab>('bruts');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preparations, setPreparations] = useState<PrepData[]>([]);
  const [prepNoms, setPrepNoms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSansPrix, setFilterSansPrix] = useState(false);
  const [filterSansRecette, setFilterSansRecette] = useState(false);
  const [filterSansRef, setFilterSansRef] = useState(false);
  const [tri, setTri] = useState<'defaut' | 'prix' | 'recettes'>('defaut');
  const [pfOptions, setPfOptions] = useState<Record<string, { id: string; nom: string; fournisseur: string; prixUnit: number; unite: string; quantite: number }[]>>({});
  const [pfPrix, setPfPrix] = useState<Record<string, { prix: number; unite: string }>>({});
  const [recetteNames, setRecetteNames] = useState<Record<string, string[]>>({});

  // Inline editing (comme PF)
  const [editInlineId, setEditInlineId] = useState<string | null>(null);
  const [editInlineForm, setEditInlineForm] = useState({ nom: '', categorie: 'épicerie salée' as Categorie });
  // Ajout inline (nouvelle ligne)
  const [showAddRow, setShowAddRow] = useState(false);
  const [addForm, setAddForm] = useState({ nom: '', categorie: 'épicerie salée' as Categorie });
  const [updating, setUpdating] = useState(false);

  // Infinite scroll
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    const [ingSnap, pfSnap, recSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
      getDocs(collection(db, 'recettes')),
    ]);

    const ings = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));

    // Identifier les recettes de type Préparations
    const prepRecettes = recSnap.docs.filter(d => d.data().categorie === 'Préparations');
    const prepNomsSet = new Set<string>();
    for (const d of prepRecettes) {
      const nom = (d.data().nom as string).toLowerCase().trim();
      prepNomsSet.add(nom);
      // Ajouter aussi le nom sans le préfixe "prépa" / "prepa"
      const sansPrepa = nom.replace(/^pr[ée]pa\s+/i, '');
      if (sansPrepa !== nom) prepNomsSet.add(sansPrepa);
    }
    setPrepNoms(prepNomsSet);

    // Séparer ingrédients bruts (exclure ceux qui sont des prépas)
    const brutIngredients = ings.filter(i => {
      const n = i.nom.toLowerCase().trim();
      return !prepNomsSet.has(n) && !prepNomsSet.has('prépa ' + n) && !prepNomsSet.has('prepa ' + n);
    });
    setIngredients(brutIngredients);

    // Construire les données préparations
    const allRecettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const prepsData: PrepData[] = prepRecettes.map(d => {
      const data = d.data();
      const coutAuKg = data.coutAuKg || (data.coutCalcule && data.quantiteProduite ? data.coutCalcule / data.quantiteProduite : 0);

      // Sous-ingrédients de cette prépa
      const sousIngs = (data.ingredients || [])
        .map((l: any) => l.nomIngredient)
        .filter(Boolean) as string[];

      // Recettes qui utilisent cette prépa (par recetteId ou par nomIngredient)
      const recettesUtilisees: string[] = [];
      for (const r of allRecettes) {
        if ((r as any).categorie === 'Préparations') continue;
        const lignes = (r as any).ingredients || [];
        for (const l of lignes) {
          if (l.recetteId === d.id || l.nomIngredient === data.nom) {
            recettesUtilisees.push((r as any).nom || r.id);
            break;
          }
        }
      }

      return {
        id: d.id,
        nom: data.nom,
        coutAuKg,
        coutCalcule: data.coutCalcule || 0,
        quantiteProduite: data.quantiteProduite || 0,
        uniteProduction: data.uniteProduction || 'kg',
        sousIngredients: sousIngs,
        recettesUtilisees,
      };
    }).sort((a, b) => a.nom.localeCompare(b.nom));
    setPreparations(prepsData);

    // Conversion g→kg, cL→L pour obtenir un prix par unité de base
    const convertQte = (qte: number, unite: string): number => {
      if (unite === 'g') return qte / 1000;
      if (unite === 'cL') return qte / 100;
      return qte;
    };

    // Collecter les produits fournisseurs liés (pour bruts uniquement)
    const pfOpts: Record<string, { id: string; nom: string; fournisseur: string; prixUnit: number; unite: string; quantite: number }[]> = {};
    for (const d of pfSnap.docs) {
      const data = d.data();
      const nomIngredient = data.ingredient;
      if (nomIngredient) {
        const ing = brutIngredients.find(i => i.nom === nomIngredient);
        if (ing) {
          if (!pfOpts[ing.id]) pfOpts[ing.id] = [];
          const nomProduit = data.nom || data.designation || nomIngredient;
          const fournisseur = data.fournisseur || (data.foodflowCode ? 'Foodflow' : data.millietCode ? 'Milliet' : data.lbaCode ? 'LBA' : '');
          const qte = convertQte(data.quantite || data.nbKg || data.nbPieces || 1, data.unite || 'kg');
          const prixUnit = data.prix / qte / (data.rendement || 1);
          const uniteNormPf = (data.unite || 'kg') === 'g' ? 'kg' : (data.unite || 'kg') === 'cL' ? 'L' : (data.unite || 'kg');
          const quantiteRaw = data.quantite || data.nbKg || data.nbPieces || 1;
          pfOpts[ing.id].push({ id: d.id, nom: nomProduit, fournisseur, prixUnit, unite: uniteNormPf, quantite: quantiteRaw });
        }
      }
    }
    setPfOptions(pfOpts);

    // Calculer le prix par ingrédient brut (PF de réf si défini, sinon le plus récent)
    const uniteNorm = (u: string) => u === 'g' ? 'kg' : u === 'cL' ? 'L' : u;
    const prix: Record<string, { prix: number; unite: string }> = {};
    for (const ing of brutIngredients) {
      const refId = (ing as any).fournisseurRefId;
      if (refId && pfOpts[ing.id]?.find(p => p.id === refId)) {
        const refPf = pfSnap.docs.find(d => d.id === refId);
        const refUnite = refPf ? uniteNorm(refPf.data().unite || 'kg') : ing.unite;
        prix[ing.id] = { prix: pfOpts[ing.id].find(p => p.id === refId)!.prixUnit, unite: refUnite };
      } else {
        const pfsDocs = pfSnap.docs.filter(d => d.data().ingredient === ing.nom);
        if (pfsDocs.length > 0) {
          const plusRecent = pfsDocs.sort((a, b) => new Date(b.data().updatedAt).getTime() - new Date(a.data().updatedAt).getTime())[0];
          const data = plusRecent.data();
          const qte = convertQte(data.quantite || data.nbKg || data.nbPieces || 1, data.unite || 'kg');
          prix[ing.id] = { prix: data.prix / qte / (data.rendement || 1), unite: uniteNorm(data.unite || 'kg') };
        }
      }
    }
    setPfPrix(prix);

    // Collecter les noms des recettes liées (pour bruts) — par nom ET par ingredientId
    const rc: Record<string, string[]> = {};
    for (const d of recSnap.docs) {
      const data = d.data();
      const lignes = data.ingredients || [];
      const nomRecette = data.nom || d.id;
      const seenIngIds = new Set<string>();
      for (const l of lignes) {
        // Par ingredientId
        if (l.ingredientId) {
          const ing = brutIngredients.find(i => i.id === l.ingredientId);
          if (ing && !seenIngIds.has(ing.id)) {
            if (!rc[ing.id]) rc[ing.id] = [];
            rc[ing.id].push(nomRecette);
            seenIngIds.add(ing.id);
          }
        }
        // Par nomIngredient (fallback)
        if (l.nomIngredient && !l.ingredientId) {
          const ing = brutIngredients.find(i => i.nom === l.nomIngredient);
          if (ing && !seenIngIds.has(ing.id)) {
            if (!rc[ing.id]) rc[ing.id] = [];
            rc[ing.id].push(nomRecette);
            seenIngIds.add(ing.id);
          }
        }
      }
    }
    setRecetteNames(rc);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = async () => {
    if (!addForm.nom) return;
    await addDoc(collection(db, 'ingredients'), { nom: addForm.nom, categorie: addForm.categorie });
    setAddForm({ nom: '', categorie: 'épicerie salée' });
    setShowAddRow(false);
    await recalculerTousLesCouts();
    fetchAll();
  };

  const handleSaveInline = async () => {
    if (!editInlineId || !editInlineForm.nom) return;
    const ing = ingredients.find(i => i.id === editInlineId);
    const ancienNom = ing?.nom;
    const nouveauNom = editInlineForm.nom;

    await updateDoc(doc(db, 'ingredients', editInlineId), { nom: nouveauNom, categorie: editInlineForm.categorie });

    // Propager le renommage si le nom a changé
    if (ancienNom && ancienNom !== nouveauNom) {
      // Mettre à jour le champ "ingredient" dans les produitsFournisseurs
      const pfSnap = await getDocs(collection(db, 'produitsFournisseurs'));
      for (const d of pfSnap.docs) {
        if (d.data().ingredient === ancienNom) {
          await updateDoc(doc(db, 'produitsFournisseurs', d.id), { ingredient: nouveauNom });
        }
      }
      // Mettre à jour le champ "nomIngredient" dans les recettes
      const recSnap = await getDocs(collection(db, 'recettes'));
      for (const d of recSnap.docs) {
        const ings = d.data().ingredients || [];
        const hasMatch = ings.some((i: any) => i.nomIngredient === ancienNom);
        if (hasMatch) {
          const newIngs = ings.map((i: any) =>
            i.nomIngredient === ancienNom ? { ...i, nomIngredient: nouveauNom } : i
          );
          await updateDoc(doc(db, 'recettes', d.id), { ingredients: newIngs });
        }
      }
    }

    setEditInlineId(null);
    await recalculerTousLesCouts();
    fetchAll();
  };

  const handleEdit = (ing: Ingredient) => {
    setEditInlineId(ing.id);
    setEditInlineForm({ nom: ing.nom, categorie: ing.categorie });
  };

  const handleSetFournisseurRef = async (ingId: string, pfId: string) => {
    const updateData: Record<string, any> = { fournisseurRefId: pfId || null };
    if (pfId) {
      const pf = pfOptions[ingId]?.find(p => p.id === pfId);
      if (pf) updateData.unite = pf.unite;
    }
    await updateDoc(doc(db, 'ingredients', ingId), updateData);
    await recalculerTousLesCouts();
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet ingrédient canonique ?')) return;
    await deleteDoc(doc(db, 'ingredients', id));
    fetchAll();
  };

  const filtered = ingredients
    .filter(i => i.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    .filter(i => !filterSansPrix || !pfPrix[i.id]?.prix)
    .filter(i => !filterSansRecette || !recetteNames[i.id]?.length)
    .filter(i => !filterSansRef || !(i as any).fournisseurRefId)
    .sort((a, b) => {
      if (tri === 'prix') return (pfPrix[b.id]?.prix || 0) - (pfPrix[a.id]?.prix || 0);
      if (tri === 'recettes') return (recetteNames[b.id]?.length || 0) - (recetteNames[a.id]?.length || 0);
      return a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom);
    });

  const [triPrep, setTriPrep] = useState<'defaut' | 'cout'>('defaut');
  const filteredPreps = preparations
    .filter(p => p.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
    .sort((a, b) => triPrep === 'cout' ? (b.coutAuKg || 0) - (a.coutAuKg || 0) : a.nom.localeCompare(b.nom));

  // Infinite scroll
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, filterSansPrix, filterSansRecette, filterSansRef, tri]);
  const hasMore = visibleCount < filtered.length;
  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore) {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length));
    }
  }, [hasMore, filtered.length]);
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">Ingrédients</h1>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {tab === 'bruts' && (
            <>
              <button disabled={updating} onClick={async () => { setUpdating(true); await recalculerTousLesCouts(); await fetchAll(); setUpdating(false); }}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm">
                {updating ? 'Mise à jour...' : 'Mettre à jour'}
              </button>
              <button
                onClick={() => { setShowAddRow(true); setAddForm({ nom: '', categorie: 'épicerie salée' }); }}
                className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm"
              >
                + Ajouter
              </button>
            </>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 bg-yellow-50 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('bruts')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'bruts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Ingrédients bruts
        </button>
        <button
          onClick={() => setTab('preparations')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'preparations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Préparations
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-full sm:w-64 min-w-0"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'bruts' && (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={filterSansPrix} onChange={e => setFilterSansPrix(e.target.checked)} className="accent-yellow-400" />
              Sans prix
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={filterSansRecette} onChange={e => setFilterSansRecette(e.target.checked)} className="accent-yellow-400" />
              Sans recette
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={filterSansRef} onChange={e => setFilterSansRef(e.target.checked)} className="accent-yellow-400" />
              Sans PF de réf
            </label>
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm flex-1 sm:flex-initial min-w-0" value={tri} onChange={e => setTri(e.target.value as any)}>
              <option value="defaut">Tri : catégorie</option>
              <option value="prix">Tri : plus chers</option>
              <option value="recettes">Tri : plus utilisés</option>
            </select>
          </>
        )}
        {tab === 'preparations' && (
          <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm flex-1 sm:flex-initial min-w-0" value={triPrep} onChange={e => setTriPrep(e.target.value as any)}>
            <option value="defaut">Tri : nom</option>
            <option value="cout">Tri : plus cher au kg</option>
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : tab === 'bruts' ? (
        /* ── Tableau Ingrédients bruts ── */
        <div className="bg-white rounded-xl border border-yellow-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left w-[18%]">Nom</th>
                <th className="px-2 py-3 text-left w-[4%]">Unité</th>
                <th className="px-2 py-3 text-left w-[10%]">Catégorie</th>
                <th className="px-2 py-3 text-right w-[8%]">Prix/u</th>
                <th className="px-2 py-3 text-left w-[32%]">PF de réf</th>
                <th className="px-2 py-3 text-left w-[22%]">Recettes liées</th>
                <th className="px-2 py-3 w-[6%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {/* Ligne d'ajout inline */}
              {showAddRow && (
                <tr className="bg-yellow-50">
                  <td className="px-3 py-3">
                    <input className="border border-yellow-200 rounded px-2 py-1 text-sm w-full" placeholder="Nom" value={addForm.nom} onChange={e => setAddForm({ ...addForm, nom: e.target.value })} autoFocus />
                  </td>
                  <td className="px-2 py-3 text-gray-400 text-xs">—</td>
                  <td className="px-2 py-3">
                    <select className="bg-transparent text-xs cursor-pointer max-w-[100px]" value={addForm.categorie} onChange={e => setAddForm({ ...addForm, categorie: e.target.value as Categorie })}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-3 text-gray-300 text-right text-xs">—</td>
                  <td className="px-2 py-3 text-gray-300 text-xs">—</td>
                  <td className="px-2 py-3 text-gray-300 text-xs">—</td>
                  <td className="px-2 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={handleAdd} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded px-3 py-1 text-xs">Ajouter</button>
                      <button onClick={() => setShowAddRow(false)} className="border border-gray-200 rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-50">Annuler</button>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.slice(0, visibleCount).map(ing => {
                const isEditing = editInlineId === ing.id;
                return (
                  <tr key={ing.id} className={`transition-colors ${isEditing ? 'bg-yellow-50' : 'hover:bg-yellow-50'}`}>
                    <td className="px-3 py-3 font-medium">
                      {isEditing ? (
                        <div>
                          <input className="border border-yellow-200 rounded px-2 py-1 text-sm w-full" value={editInlineForm.nom} onChange={e => setEditInlineForm({ ...editInlineForm, nom: e.target.value })} />
                          <div className="flex gap-2 mt-2">
                            <button onClick={handleSaveInline} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded px-3 py-1 text-xs">Enregistrer</button>
                            <button onClick={() => setEditInlineId(null)} className="border border-gray-200 rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-50">Annuler</button>
                          </div>
                        </div>
                      ) : ing.nom}
                    </td>
                    <td className="px-2 py-3 text-gray-500 text-xs">{pfPrix[ing.id]?.unite || ing.unite || '—'}</td>
                    <td className="px-2 py-3 text-gray-500">
                      {isEditing ? (
                        <select className="bg-transparent text-xs cursor-pointer max-w-[100px]" value={editInlineForm.categorie} onChange={e => setEditInlineForm({ ...editInlineForm, categorie: e.target.value as Categorie })}>
                          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span className="text-xs">{ing.categorie}</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {pfPrix[ing.id]?.prix ? (
                        <span className="font-semibold text-yellow-600 text-xs">{pfPrix[ing.id].prix.toFixed(2)} €/{pfPrix[ing.id].unite}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {pfOptions[ing.id]?.length ? (
                        <select
                          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded px-1 py-1 text-xs w-full"
                          value={ing.fournisseurRefId || ''}
                          onChange={e => handleSetFournisseurRef(ing.id, e.target.value)}
                        >
                          <option value="">— Choisir —</option>
                          {pfOptions[ing.id].map(pf => (
                            <option key={pf.id} value={pf.id}>{pf.nom} ({pf.fournisseur || '?'}) — {pf.quantite} {pf.unite} — {pf.prixUnit.toFixed(2)} €/{pf.unite}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-300 text-xs">Aucun PF</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {recetteNames[ing.id]?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {recetteNames[ing.id].map((nom, i) => (
                            <span key={i} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{nom}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      {!isEditing && (
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEdit(ing)} className="text-gray-400 hover:text-yellow-500" title="Modifier">✏️</button>
                          <button onClick={() => handleDelete(ing.id)} className="text-gray-400 hover:text-red-500" title="Supprimer">🗑️</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun ingrédient</td></tr>
              )}
            </tbody>
          </table>
          {hasMore && (
            <div ref={loaderRef} className="py-4 text-center text-xs text-gray-400">
              Chargement…
            </div>
          )}
        </div>
      ) : (
        /* ── Tableau Préparations ── */
        <div className="bg-white rounded-xl border border-yellow-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left w-[20%]">Nom</th>
                <th className="px-2 py-3 text-right w-[10%]">Coût/kg</th>
                <th className="px-2 py-3 text-left w-[35%]">Sous-ingrédients</th>
                <th className="px-2 py-3 text-left w-[35%]">Utilisée dans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filteredPreps.map(prep => (
                <tr key={prep.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-3 py-3 font-medium">{prep.nom}</td>
                  <td className="px-2 py-3 text-right">
                    {prep.coutAuKg > 0 ? (
                      <span className="font-semibold text-yellow-600">{prep.coutAuKg.toFixed(2)} €/kg</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {prep.sousIngredients.length ? (
                      <div className="flex flex-wrap gap-1">
                        {prep.sousIngredients.map((nom, i) => (
                          <span key={i} className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-medium">{nom}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {prep.recettesUtilisees.length ? (
                      <div className="flex flex-wrap gap-1">
                        {prep.recettesUtilisees.map((nom, i) => (
                          <span key={i} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">{nom}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredPreps.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucune préparation</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
