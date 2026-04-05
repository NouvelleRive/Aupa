'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette, Ingredient, Preparation, CategorieRecette, Saison } from '@/lib/types';

const CATEGORIES: CategorieRecette[] = ['Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols', 'Wine/Beer', 'Cocktails', 'Apéro', 'Softs chaud', 'Softs froid', 'Sodas'];
const SAISONS: Saison[] = ['été', 'hiver'];

const SHEET_TO_CAT: Record<string, CategorieRecette> = {
  'Croger': 'Croger', 'Mini Croger': 'Mini Croger', 'Entrées': 'Entrées',
  'Sides': 'Sides', 'Desserts': 'Desserts', 'Bols': 'Bols',
  'Wine beer': 'Wine/Beer', 'Cocktails': 'Cocktails', 'Apero': 'Apéro',
  'Softs maison chaud': 'Softs chaud', 'Softs maison froid': 'Softs froid', 'Sodas': 'Sodas',
};

const emptyForm = { nom: '', categorie: 'Croger' as CategorieRecette, saisons: ['été'] as Saison[], actif: true };

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
  const [importing, setImporting] = useState(false);
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

  const handleImportXL = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);

    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const allIngredients = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));

    let created = 0;

    for (const sheetName of wb.SheetNames) {
      const cat = SHEET_TO_CAT[sheetName];
      if (!cat) continue;

      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const row0 = rows[1] || [];
      const platCols: { colGrammage: number; nom: string }[] = [];
      const nomsVus = new Map<string, number>();

      for (let c = 4; c < row0.length; c++) {
        const nom = row0[c];
        if (typeof nom !== 'string' || !nom.trim()) continue;
        const nomClean = nom.trim();
        if (!nomsVus.has(nomClean)) {
          nomsVus.set(nomClean, c);
        } else {
          platCols.push({ colGrammage: c, nom: nomClean });
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
          nom: plat.nom, categorie: cat,
          saisons: ['été'], actif: true,
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
    if (!form.nom) return;
    const cout = calculerCout();
    const data = {
      nom: form.nom, categorie: form.categorie,
      saisons: form.saisons, actif: form.actif,
      ingredients: lignes.filter(l => l.type === 'ingredient').map(l => ({ ingredientId: l.id, grammage: parseFloat(l.grammage) })),
      options: [], coutCalcule: cout, updatedAt: new Date().toISOString(),
    };
    if (editId) { await updateDoc(doc(db, 'recettes', editId), data); setEditId(null); }
    else { await addDoc(collection(db, 'recettes'), data); }
    setForm(emptyForm); setLignes([]); setShowForm(false); fetchAll();
  };

  const handleEdit = (r: Recette) => {
    setEditId(r.id);
    setForm({ nom: r.nom, categorie: r.categorie, saisons: r.saisons, actif: r.actif });
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
    (filterSaison === 'all' || r.saisons.includes(filterSaison as Saison))
  );

  const coutPreview = calculerCout();

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Nom de la recette" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as CategorieRecette })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
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

          {lignes.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-4 mb-4 flex gap-6 text-sm">
              <div><span className="text-gray-500">Coût matière</span><br /><span className="font-bold">{coutPreview.toFixed(2)} €</span></div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-6 py-2 text-sm">{editId ? 'Enregistrer' : 'Créer'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); setLignes([]); }} className="border border-yellow-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">Annuler</button>
          </div>
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
      </div>

      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Recette</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Saisons</th>
                <th className="px-4 py-3 text-right">Coût matière</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(r => (
                <tr key={r.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{r.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{r.categorie}</td>
                  <td className="px-4 py-3 text-gray-500">{r.saisons.join(', ')}</td>
                  <td className="px-4 py-3 text-right">{r.coutCalcule.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-center"><span className={`px-2 py-1 rounded-full text-xs ${r.actif ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>{r.actif ? 'Actif' : 'Inactif'}</span></td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => handleEdit(r)} className="text-xs text-gray-400 hover:text-yellow-500">Modifier</button>
                    <button onClick={() => handleDelete(r.id)} className="text-xs text-gray-400 hover:text-yellow-500">Supprimer</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune recette</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}