'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette, Ingredient, Preparation, CategorieRecette, Saison, Carte } from '@/lib/types';

const CATEGORIES: CategorieRecette[] = ['Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols', 'Wine/Beer', 'Cocktails', 'Apéro', 'Softs chaud', 'Softs froid', 'Sodas'];
const SAISONS: Saison[] = ['été', 'hiver'];
const CARTES: Carte[] = ['ETE26', 'HIVER25', 'ETE25', 'HIVER24', 'ETE24'];

const SHEET_TO_CAT: Record<string, CategorieRecette> = {
  'Croger': 'Croger', 'Mini Croger': 'Mini Croger', 'Entrées': 'Entrées',
  'Sides': 'Sides', 'Desserts': 'Desserts', 'Bols': 'Bols',
  'Wine beer': 'Wine/Beer', 'Cocktails': 'Cocktails', 'Apero': 'Apéro',
  'Softs maison chaud': 'Softs chaud', 'Softs maison froid': 'Softs froid', 'Sodas': 'Sodas',
};

const emptyForm = { nom: '', categorie: 'Croger' as CategorieRecette, prixVente: '', saisons: ['été'] as Saison[], carte: 'ETE26' as Carte, actif: true };

export default function RecettesPage() {
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [lignes, setLignes] = useState<{ type: 'ingredient' | 'preparation'; id: string; grammage: string }[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterSaison, setFilterSaison] = useState<string>('all');
  const [filterCarte, setFilterCarte] = useState<string>('all');
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCarte, setBulkCarte] = useState<Carte>('ETE26');
  const xlRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    const [rSnap, iSnap, pSnap] = await Promise.all([
      getDocs(collection(db, 'recettes')),
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'preparations')),
    ]);
    setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
    setIngredients(iSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    setPreparations(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Preparation)));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleBulkUpdate = async () => {
    if (selected.size === 0) return;
    for (const id of selected) {
      await updateDoc(doc(db, 'recettes', id), { carte: bulkCarte });
    }
    setSelected(new Set());
    fetchAll();
  };

  const handleImportXL = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);

    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const allIngredients = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient & { foodflowCode?: string }));

    let created = 0;

    for (const sheetName of wb.SheetNames) {
      const cat = SHEET_TO_CAT[sheetName];
      if (!cat) continue;

      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const row0 = rows[1] || [];
      const row2 = rows[3] || [];

      const platCols: { colPrix: number; colGrammage: number; nom: string; prix: number }[] = [];
      const nomsVus = new Map<string, number>();

      for (let c = 4; c < row0.length; c++) {
        const nom = row0[c];
        if (typeof nom !== 'string' || !nom.trim()) continue;
        const nomClean = nom.trim();
        if (!nomsVus.has(nomClean)) {
          nomsVus.set(nomClean, c);
        } else {
          const colPrix = nomsVus.get(nomClean)!;
          const prix = typeof row2[colPrix] === 'number' ? row2[colPrix] : 0;
          platCols.push({ colPrix, colGrammage: c, nom: nomClean, prix });
        }
      }

      for (const plat of platCols) {
        const lignesRecette: { ingredientId: string; grammage: number }[] = [];

        for (let r = 9; r < rows.length; r++) {
          const row = rows[r];
          const nomIng = row[0];
          const grammage = row[plat.colGrammage];

          if (typeof nomIng !== 'string' || !nomIng.trim()) continue;
          if (typeof grammage !== 'number' || grammage <= 0) continue;

          const nomNorm = nomIng.trim().toLowerCase();
          const match = allIngredients.find(i =>
            i.nom.toLowerCase().includes(nomNorm) ||
            nomNorm.includes(i.nom.toLowerCase().split(' ')[0])
          );
          if (match) lignesRecette.push({ ingredientId: match.id, grammage });
        }

        const cout = lignesRecette.reduce((total, l) => {
          const ing = allIngredients.find(i => i.id === l.ingredientId);
          if (!ing) return total;
          return total + (ing.prix / ing.rendement) * l.grammage;
        }, 0);

        await addDoc(collection(db, 'recettes'), {
          nom: plat.nom, categorie: cat, prixVente: plat.prix,
          saisons: ['été'], carte: 'ETE26', actif: true,
          ingredients: lignesRecette, options: [], coutCalcule: cout,
          updatedAt: new Date().toISOString(),
        });
        created++;
      }
    }

    setImporting(false);
    alert(`✅ ${created} recettes importées !`);
    fetchAll();
    e.target.value = '';
  };

  const calculerCout = () => {
    return lignes.reduce((total, ligne) => {
      const grammage = parseFloat(ligne.grammage) || 0;
      if (ligne.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === ligne.id);
        if (!ing) return total;
        return total + (ing.prix / ing.rendement) * grammage;
      } else {
        const prep = preparations.find(p => p.id === ligne.id);
        if (!prep) return total;
        return total + prep.coutCalcule * grammage;
      }
    }, 0);
  };

  const handleSubmit = async () => {
    if (!form.nom || !form.prixVente) return;
    const cout = calculerCout();
    const data = {
      nom: form.nom, categorie: form.categorie, prixVente: parseFloat(form.prixVente),
      saisons: form.saisons, carte: form.carte, actif: form.actif,
      ingredients: lignes.filter(l => l.type === 'ingredient').map(l => ({ ingredientId: l.id, grammage: parseFloat(l.grammage) })),
      options: [], coutCalcule: cout, updatedAt: new Date().toISOString(),
    };
    if (editId) { await updateDoc(doc(db, 'recettes', editId), data); setEditId(null); }
    else { await addDoc(collection(db, 'recettes'), data); }
    setForm(emptyForm); setLignes([]); setShowForm(false); fetchAll();
  };

  const handleEdit = (r: Recette) => {
    setEditId(r.id);
    setForm({ nom: r.nom, categorie: r.categorie, prixVente: String(r.prixVente), saisons: r.saisons, carte: r.carte, actif: r.actif });
    setLignes(r.ingredients.map(i => ({ type: 'ingredient' as const, id: i.ingredientId!, grammage: String(i.grammage) })));
    setShowForm(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette recette ?')) return;
    await deleteDoc(doc(db, 'recettes', id));
    fetchAll();
  };

  const toggleSaison = (s: Saison) => {
    setForm(f => ({ ...f, saisons: f.saisons.includes(s) ? f.saisons.filter(x => x !== s) : [...f.saisons, s] }));
  };

  const filtered = recettes.filter(r =>
    (filterCat === 'all' || r.categorie === filterCat) &&
    (filterSaison === 'all' || r.saisons.includes(filterSaison as Saison)) &&
    (filterCarte === 'all' || r.carte === filterCarte)
  );

  const coutPreview = calculerCout();
  const prixHT = parseFloat(form.prixVente) / 1.1 || 0;
  const marge = prixHT > 0 ? ((prixHT - coutPreview) / prixHT) * 100 : 0;
  const foodCost = prixHT > 0 ? (coutPreview / prixHT) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Recettes</h1>
        <div className="flex gap-3">
          <button onClick={() => xlRef.current?.click()} disabled={importing} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {importing ? 'Import en cours...' : 'Importer Excel'}
          </button>
          <input ref={xlRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportXL} />
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); setLignes([]); }} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
            + Nouvelle recette
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Modifier la recette' : 'Nouvelle recette'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Nom de la recette" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as CategorieRecette })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.carte} onChange={e => setForm({ ...form, carte: e.target.value as Carte })}>
              {CARTES.map(c => <option key={c}>{c}</option>)}
            </select>
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Prix vente TTC (€)" type="number" value={form.prixVente} onChange={e => setForm({ ...form, prixVente: e.target.value })} />
          </div>

          <div className="flex gap-2 mb-4">
            {SAISONS.map(s => (
              <button key={s} onClick={() => toggleSaison(s)} className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.saisons.includes(s) ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500 hover:border-yellow-400'}`}>
                {s}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Ingrédients & Préparations</span>
              <div className="flex gap-2">
                <button onClick={() => setLignes([...lignes, { type: 'ingredient', id: ingredients[0]?.id || '', grammage: '' }])} className="text-xs border border-yellow-200 hover:bg-yellow-50 rounded px-2 py-1">+ Ingrédient</button>
                <button onClick={() => setLignes([...lignes, { type: 'preparation', id: preparations[0]?.id || '', grammage: '' }])} className="text-xs border border-yellow-200 hover:bg-yellow-50 rounded px-2 py-1">+ Préparation</button>
              </div>
            </div>
            <div className="space-y-2">
              {lignes.map((ligne, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="border border-yellow-200 rounded-lg px-3 py-2 text-sm flex-1" value={ligne.id} onChange={e => { const n = [...lignes]; n[i].id = e.target.value; setLignes(n); }}>
                    {ligne.type === 'ingredient'
                      ? ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.nom} ({ing.unite})</option>)
                      : preparations.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)
                    }
                  </select>
                  <input className="border border-yellow-200 rounded-lg px-3 py-2 text-sm w-28" placeholder="Qté" type="number" value={ligne.grammage} onChange={e => { const n = [...lignes]; n[i].grammage = e.target.value; setLignes(n); }} />
                  <button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="text-gray-400 hover:text-yellow-500 text-sm">✕</button>
                </div>
              ))}
            </div>
          </div>

          {form.prixVente && (
            <div className="bg-yellow-50 rounded-lg p-4 mb-4 flex gap-6 text-sm">
              <div><span className="text-gray-500">Coût matière</span><br /><span className="font-bold">{coutPreview.toFixed(2)} €</span></div>
              <div><span className="text-gray-500">Food cost</span><br /><span className={`font-bold ${foodCost > 32 ? 'text-yellow-600' : 'text-black'}`}>{foodCost.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Marge</span><br /><span className="font-bold">{marge.toFixed(1)}%</span></div>
              <div><span className="text-gray-500">Bénéfice HT</span><br /><span className="font-bold">{(prixHT - coutPreview).toFixed(2)} €</span></div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2 text-sm">{editId ? 'Enregistrer' : 'Créer'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); setLignes([]); }} className="border border-yellow-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium">{selected.size} recette(s) sélectionnée(s)</span>
          <select className="border border-yellow-200 rounded-lg px-3 py-1 text-sm" value={bulkCarte} onChange={e => setBulkCarte(e.target.value as Carte)}>
            {CARTES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={handleBulkUpdate} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-1 text-sm">Appliquer la carte</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterSaison} onChange={e => setFilterSaison(e.target.value)}>
          <option value="all">Toutes saisons</option>
          {SAISONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterCarte} onChange={e => setFilterCarte(e.target.value)}>
          <option value="all">Toutes les cartes</option>
          {CARTES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())} />
                </th>
                <th className="px-4 py-3 text-left">Recette</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Carte</th>
                <th className="px-4 py-3 text-left">Saisons</th>
                <th className="px-4 py-3 text-right">Prix vente</th>
                <th className="px-4 py-3 text-right">Coût</th>
                <th className="px-4 py-3 text-right">Food cost</th>
                <th className="px-4 py-3 text-right">Marge</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(r => {
                const pHT = r.prixVente / 1.1;
                const fc = pHT > 0 ? (r.coutCalcule / pHT) * 100 : 0;
                const mg = pHT > 0 ? ((pHT - r.coutCalcule) / pHT) * 100 : 0;
                return (
                  <tr key={r.id} className="hover:bg-yellow-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={e => {
                        const s = new Set(selected);
                        e.target.checked ? s.add(r.id) : s.delete(r.id);
                        setSelected(s);
                      }} />
                    </td>
                    <td className="px-4 py-3 font-medium">{r.nom}</td>
                    <td className="px-4 py-3 text-gray-500">{r.categorie}</td>
                    <td className="px-4 py-3 text-gray-500">{r.carte}</td>
                    <td className="px-4 py-3 text-gray-500">{r.saisons.join(', ')}</td>
                    <td className="px-4 py-3 text-right">{r.prixVente.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right">{r.coutCalcule.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-right"><span className={`font-semibold ${fc > 32 ? 'text-yellow-600' : ''}`}>{fc.toFixed(1)}%</span></td>
                    <td className="px-4 py-3 text-right font-semibold">{mg.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs ${r.actif ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>{r.actif ? 'Actif' : 'Inactif'}</span></td>
                    <td className="px-4 py-3 flex gap-2 justify-end">
                      <button onClick={() => handleEdit(r)} className="text-xs text-gray-400 hover:text-yellow-500">Modifier</button>
                      <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-yellow-500">Supprimer</button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Aucune recette</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}