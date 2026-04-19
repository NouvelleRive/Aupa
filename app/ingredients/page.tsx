'use client';

import { useState, useEffect } from 'react';
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', categorie: 'épicerie salée' as Categorie });
  const [editId, setEditId] = useState<string | null>(null);
  const [pfOptions, setPfOptions] = useState<Record<string, { id: string; nom: string; fournisseur: string; prixUnit: number; unite: string }[]>>({});
  const [pfPrix, setPfPrix] = useState<Record<string, { prix: number; unite: string }>>({});
  const [recetteNames, setRecetteNames] = useState<Record<string, string[]>>({});

  const fetchAll = async () => {
    const [ingSnap, pfSnap, recSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
      getDocs(collection(db, 'recettes')),
    ]);

    const ings = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));

    // Identifier les recettes de type Préparations
    const prepRecettes = recSnap.docs.filter(d => d.data().categorie === 'Préparations');
    const prepNomsSet = new Set(prepRecettes.map(d => d.data().nom as string));
    setPrepNoms(prepNomsSet);

    // Séparer ingrédients bruts (exclure ceux qui sont des prépas)
    const brutIngredients = ings.filter(i => !prepNomsSet.has(i.nom));
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
    const pfOpts: Record<string, { id: string; nom: string; fournisseur: string; prixUnit: number; unite: string }[]> = {};
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
          pfOpts[ing.id].push({ id: d.id, nom: nomProduit, fournisseur, prixUnit, unite: uniteNormPf });
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

    // Collecter les noms des recettes liées (pour bruts)
    const rc: Record<string, string[]> = {};
    for (const d of recSnap.docs) {
      const data = d.data();
      const lignes = data.ingredients || [];
      const nomRecette = data.nom || d.id;
      const seen = new Set<string>();
      for (const l of lignes) {
        const nomIngredient = l.nomIngredient;
        if (nomIngredient && !seen.has(nomIngredient)) {
          const ing = brutIngredients.find(i => i.nom === nomIngredient);
          if (ing) {
            if (!rc[ing.id]) rc[ing.id] = [];
            rc[ing.id].push(nomRecette);
            seen.add(nomIngredient);
          }
        }
      }
    }
    setRecetteNames(rc);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async () => {
    if (!form.nom) return;
    const data = { nom: form.nom, categorie: form.categorie };
    if (editId) {
      await updateDoc(doc(db, 'ingredients', editId), data);
      setEditId(null);
    } else {
      await addDoc(collection(db, 'ingredients'), data);
    }
    setForm({ nom: '', categorie: 'épicerie salée' });
    setShowForm(false);
    await recalculerTousLesCouts();
    fetchAll();
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

  const handleEdit = (ing: Ingredient) => {
    setEditId(ing.id);
    setForm({ nom: ing.nom, categorie: ing.categorie });
    setShowForm(true);
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
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

  const filteredPreps = preparations
    .filter(p => p.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ingrédients</h1>
        {tab === 'bruts' && (
          <button
            onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ nom: '', categorie: 'épicerie salée' }); }}
            className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm"
          >
            + Ajouter
          </button>
        )}
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

      {tab === 'bruts' && showForm && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Modifier' : 'Nouvel ingrédient'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2 flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Nom</label>
              <input
                className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                placeholder="Nom"
                value={form.nom}
                onChange={e => setForm({ ...form, nom: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Catégorie</label>
              <select
                className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                value={form.categorie}
                onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
                {editId ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'bruts' && (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-2">
              <input type="checkbox" checked={filterSansPrix} onChange={e => setFilterSansPrix(e.target.checked)} className="accent-yellow-400" />
              Sans prix
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-2">
              <input type="checkbox" checked={filterSansRecette} onChange={e => setFilterSansRecette(e.target.checked)} className="accent-yellow-400" />
              Sans recette
            </label>
          </>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : tab === 'bruts' ? (
        /* ── Tableau Ingrédients bruts ── */
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Unité</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix/unité</th>
                <th className="px-4 py-3 text-left">PF de réf</th>
                <th className="px-4 py-3 text-left">Recettes liées</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{ing.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{pfPrix[ing.id]?.unite || ing.unite}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.categorie}</td>
                  <td className="px-4 py-3 text-right">
                    {pfPrix[ing.id]?.prix ? (
                      <span className="font-semibold text-yellow-600">{pfPrix[ing.id].prix.toFixed(2)} €/{pfPrix[ing.id].unite}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {pfOptions[ing.id]?.length ? (
                      <select
                        className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-2 py-1 text-xs w-full max-w-[250px]"
                        value={ing.fournisseurRefId || ''}
                        onChange={e => handleSetFournisseurRef(ing.id, e.target.value)}
                      >
                        <option value="">— Choisir —</option>
                        {pfOptions[ing.id].map(pf => (
                          <option key={pf.id} value={pf.id}>{pf.nom} ({pf.fournisseur || '?'}) — {pf.prixUnit.toFixed(2)} €</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-gray-300 text-xs">Aucun PF</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => handleEdit(ing)} className="text-gray-400 hover:text-yellow-500 mr-2" title="Modifier">✏️</button>
                    <button onClick={() => handleDelete(ing.id)} className="text-gray-400 hover:text-red-500" title="Supprimer">🗑️</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun ingrédient</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Tableau Préparations ── */
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-right">Coût/kg</th>
                <th className="px-4 py-3 text-left">Sous-ingrédients</th>
                <th className="px-4 py-3 text-left">Utilisée dans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filteredPreps.map(prep => (
                <tr key={prep.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{prep.nom}</td>
                  <td className="px-4 py-3 text-right">
                    {prep.coutAuKg > 0 ? (
                      <span className="font-semibold text-yellow-600">{prep.coutAuKg.toFixed(2)} €/kg</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
