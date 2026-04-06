'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette, Ingredient, Preparation, CategorieRecette, TypePlat } from '@/lib/types';
import { CATEGORIES } from '@/lib/categories';
const TYPES_PLAT = ['food', 'boisson'] as const;
interface ImportPreviewItem {
  nomOriginal: string;
  nom: string;
  categorie: CategorieRecette;
  prix: number;
  recetteExistanteId: string | null;
  recetteExistanteNom: string | null;
  recetteChoisieId: string | null;
  selected: boolean;
}

const POPINA_FOOD_CAT: Record<string, CategorieRecette> = {
  'Croger  🍔': 'Croger', 'Croger': 'Croger',
  'Bowl 🍛': 'Bols', 'Bowl': 'Bols',
  'Side': 'Sides', 'Entrees ': 'Entrées', 'Entrees': 'Entrées',
  'Grignotte': 'Grignotage', 'Saisonnier': 'Croger',
  'Tous': 'Desserts', 'Desserts': 'Desserts',
};

const POPINA_FAMILLE_FOOD: Record<string, CategorieRecette> = {
  'Plats': 'Croger', 'Entrées': 'Entrées',
  'Sides et Tapas': 'Sides', 'Desserts': 'Desserts',
};

const matchExistant = (nomCaisse: string, nomRecette: string): boolean => {
  const a = nomCaisse.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const b = nomRecette.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mots = b.split(' ').filter(m => m.length > 3);
  return a === b || mots.some(m => a.includes(m)) || a.includes(b.split(' ')[0]);
};

const SHEET_TO_CAT: Record<string, CategorieRecette> = {
  'Croger': 'Croger', 'Mini Croger': 'Mini Croger', 'Entrées': 'Entrées',
  'Sides': 'Sides', 'Desserts': 'Desserts', 'Bols': 'Bols',
  'Wine beer': 'Les Wines', 'Cocktails': 'Les Cocktailz', 'Apero': 'Les Apéritifs et Digestifs',
  'Softs maison chaud': 'Le Chaud', 'Softs maison froid': 'Les Iced', 'Sodas': 'Les Sodas',
};

const emptyForm = { nom: '', categorie: 'Croger' as CategorieRecette, type: 'food' as TypePlat, actif: true };

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
  const [importing, setImporting] = useState(false);
  const xlRef = useRef<HTMLInputElement>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<TypePlat>('food');
  const [showBulk, setShowBulk] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreviewItem[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);

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

  const cleanNom = (nom: string) => nom.replace(/[^\u0000-\u024F\u1E00-\u1EFF\s]/gu, '').replace(/\s+/g, ' ').trim();

  const handleImportFoodPopina = async (rows: any[][]) => {
    const seen = new Set<string>();
    const items: ImportPreviewItem[] = [];
    for (const row of rows.slice(1)) {
      const nomRaw = String(row[0] || '').trim();
      const famille = String(row[1] || '').trim();
      const catPopina = String(row[2] || '').trim();
      const prix = row[5];
      if (!nomRaw || !famille) continue;
      if (!['Plats', 'Entrées', 'Sides et Tapas', 'Desserts'].includes(famille)) continue;
      if (typeof prix !== 'number' || prix <= 0 || prix > 50) continue;
      const nom = cleanNom(nomRaw);
      if (!nom || seen.has(nom)) continue;
      seen.add(nom);
      const categorie: CategorieRecette = POPINA_FOOD_CAT[catPopina] || POPINA_FAMILLE_FOOD[famille] || 'Croger';
      const existante = recettes.find(r => matchExistant(nom, r.nom));
      items.push({
        nomOriginal: nomRaw, nom, categorie, prix,
        recetteExistanteId: existante?.id || null,
        recetteExistanteNom: existante?.nom || null,
        recetteChoisieId: existante?.id || null,
        selected: true,
      });
    }
    setImportPreview(items);
    setShowImportPreview(true);
  };

  const handleConfirmImportFood = async () => {
    const aCreer = importPreview.filter(i => i.selected && !i.recetteChoisieId);
    let created = 0;
    for (const item of aCreer) {
      await addDoc(collection(db, 'recettes'), {
        nom: item.nom, categorie: item.categorie, type: 'food', actif: true,
        prixVente: item.prix, ingredients: [], options: [], coutCalcule: 0,
        updatedAt: new Date().toISOString(),
      });
      created++;
    }
    setShowImportPreview(false);
    setImportPreview([]);
    alert(`✅ ${created} recettes créées !`);
    fetchAll();
  };

  const POPINA_CAT_MAP: Record<string, CategorieRecette> = {
    '🧊 Maison & Iced ': 'Les Iced', 'Cocktail': 'Les Cocktailz',
    'Apéritifs/Digestifs': 'Les Apéritifs et Digestifs', '💧Soft & eau': 'Les Eaux',
    'Crazy hot drinks': 'Le Chaud', 'Binouz': 'Les Binouz',
  };
  const POPINA_FAMILLE_MAP: Record<string, CategorieRecette> = {
    'Boissons chaudes': 'Le Chaud', 'Boissons Froides': 'Les Iced',
  };

  const handleImportXL = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const headers = rows[0] || [];

    // Détection format Popina (colonne "Famille")
    if (headers[1] === 'Famille') {
      const toutesLesFamilles = rows.slice(1).map((r: any[]) => String(r[1] || '').trim());
      const hasFoodFamille = toutesLesFamilles.some((f: string) => ['Plats', 'Entrées', 'Sides et Tapas', 'Desserts'].includes(f));
      if (!hasFoodFamille) {
        const seen = new Set<string>();
        let created = 0;
        for (const row of rows.slice(1)) {
          const nomRaw = String(row[0] || '').trim();
          const famille = String(row[1] || '').trim();
          const catPopina = String(row[2] || '').trim();
          const prix = row[5];
          if (!nomRaw || !famille) continue;
          if (!['Boissons chaudes', 'Boissons Froides'].includes(famille)) continue;
          if (typeof prix !== 'number' || prix <= 0 || prix > 50) continue;
          const nom = cleanNom(nomRaw);
          if (!nom || seen.has(nom)) continue;
          seen.add(nom);
          const categorie: CategorieRecette = POPINA_CAT_MAP[catPopina] || POPINA_FAMILLE_MAP[famille] || 'Les Iced';
          await addDoc(collection(db, 'recettes'), {
            nom, categorie, type: 'boisson', actif: true,
            prixVente: prix, ingredients: [], options: [], coutCalcule: 0,
            updatedAt: new Date().toISOString(),
          });
          created++;
        }
        setImporting(false);
        alert(`✅ ${created} boissons importées !`);
        fetchAll();
        e.target.value = '';
      } else {
        setImporting(false);
        await handleImportFoodPopina(rows);
        e.target.value = '';
      }
      return;
    }

    // Format recettes cuisine (ancien format)
    const ingSnap = await getDocs(collection(db, 'ingredients'));
    const allIngredients = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));
    let created = 0;
    for (const sheetName of wb.SheetNames) {
      const cat = SHEET_TO_CAT[sheetName];
      if (!cat) continue;
      const ws2 = wb.Sheets[sheetName];
      const rows2: any[][] = XLSX.utils.sheet_to_json(ws2, { header: 1 });
      const row0 = rows2[1] || [];
      const platCols: { colGrammage: number; nom: string }[] = [];
      const nomsVus = new Map<string, number>();
      for (let c = 4; c < row0.length; c++) {
        const nom = row0[c];
        if (typeof nom !== 'string' || !nom.trim()) continue;
        const nomClean = nom.trim();
        if (!nomsVus.has(nomClean)) { nomsVus.set(nomClean, c); }
        else { platCols.push({ colGrammage: c, nom: nomClean }); }
      }
      for (const plat of platCols) {
        const lignesRecette: { ingredientId: string; grammage: number }[] = [];
        for (let r = 9; r < rows2.length; r++) {
          const row = rows2[r];
          const nomIng = row[0];
          const grammage = row[plat.colGrammage];
          if (typeof nomIng !== 'string' || !nomIng.trim()) continue;
          if (typeof grammage !== 'number' || grammage <= 0) continue;
          const nomNorm = nomIng.trim().toLowerCase();
          const match = allIngredients.find(i =>
            i.nom.toLowerCase().includes(nomNorm) || nomNorm.includes(i.nom.toLowerCase().split(' ')[0])
          );
          if (match) lignesRecette.push({ ingredientId: match.id, grammage });
        }
        const cout = lignesRecette.reduce((total, l) => {
          const ing = allIngredients.find(i => i.id === l.ingredientId);
          if (!ing) return total;
          return total + (ing.prix / ing.rendement) * l.grammage;
        }, 0);
        await addDoc(collection(db, 'recettes'), {
          nom: plat.nom, categorie: cat, type: 'food', actif: true,
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
      type: form.type, actif: form.actif,
      ingredients: lignes.filter(l => l.type === 'ingredient').map(l => ({ ingredientId: l.id, grammage: parseFloat(l.grammage) })),
      options: [], coutCalcule: cout, updatedAt: new Date().toISOString(),
    };
    if (editId) { await updateDoc(doc(db, 'recettes', editId), data); setEditId(null); }
    else { await addDoc(collection(db, 'recettes'), data); }
    setForm(emptyForm); setLignes([]); setShowForm(false); fetchAll();
  };

  const handleEdit = (r: Recette) => {
    setEditId(r.id);
    setForm({ nom: r.nom, categorie: r.categorie, type: r.type || 'food', actif: r.actif });
    setLignes(r.ingredients.map(i => ({ type: 'ingredient' as const, id: i.ingredientId!, grammage: String(i.grammage) })));
    setShowForm(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette recette ?')) return;
    await deleteDoc(doc(db, 'recettes', id));
    fetchAll();
  };

  const handleBulkType = async () => {
    for (const id of selected) {
      await updateDoc(doc(db, 'recettes', id), { type: bulkType });
    }
    setSelected(new Set());
    setShowBulk(false);
    fetchAll();
  };

  const filtered = recettes.filter(r =>
    (filterCat === 'all' || r.categorie === filterCat) &&
    (filterType === 'all' || (filterType === 'food' ? (!r.type || r.type === 'food') : r.type === filterType))
  );

  const coutPreview = calculerCout();

  if (showImportPreview) {
    const aCreerCount = importPreview.filter(i => i.selected && !i.recetteChoisieId).length;
    const matchesCount = importPreview.filter(i => i.recetteChoisieId).length;
    const ignoresCount = importPreview.filter(i => !i.selected && !i.recetteChoisieId).length;
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Validation import Popina</h1>
            <p className="text-sm text-gray-400 mt-1">{aCreerCount} à créer · {matchesCount} matchés · {ignoresCount} ignorés</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setShowImportPreview(false); setImportPreview([]); }}
              className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
              Annuler
            </button>
            <button onClick={handleConfirmImportFood}
              className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
              Valider
            </button>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-gray-400 text-xs uppercase border-b border-yellow-50 bg-yellow-50">
              <tr>
                <th className="px-4 py-2 text-left">Nom caisse</th>
                <th className="px-4 py-2 text-left">Nom recette (éditable)</th>
                <th className="px-4 py-2 text-left">Ou choisir parmi existantes</th>
                <th className="px-4 py-2 text-right">Prix</th>
                <th className="px-4 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {importPreview.map((item, globalIdx) => {
                const isIgnored = !item.selected && !item.recetteChoisieId;
                const isMatched = !!item.recetteChoisieId;
                const isNew = item.selected && !item.recetteChoisieId;
                return (
                  <tr key={globalIdx} className={`transition-colors ${isIgnored ? 'opacity-40 bg-gray-50' : isMatched ? 'bg-green-50' : 'bg-yellow-50'}`}>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-[180px] truncate">{item.nomOriginal}</td>
                    <td className="px-4 py-2">
                      {isMatched ? (
                        <span className="text-green-700 font-medium text-xs">{recettes.find(r => r.id === item.recetteChoisieId)?.nom}</span>
                      ) : isNew ? (
                        <input className="border border-yellow-200 rounded-lg px-2 py-1 text-sm w-full focus:border-yellow-400 focus:outline-none"
                          value={item.nom}
                          onChange={e => setImportPreview(p => p.map((x, j) => j === globalIdx ? { ...x, nom: e.target.value } : x))} />
                      ) : (
                        <span className="text-gray-400 text-xs italic">ignoré</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                        value={item.recetteChoisieId || ''}
                        onChange={e => setImportPreview(p => p.map((x, j) => j === globalIdx ? { ...x, recetteChoisieId: e.target.value || null, selected: true } : x))}>
                        <option value="">— Créer nouveau —</option>
                        {recettes.filter(r => r.type === 'food').map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{item.prix} €</td>
                    <td className="px-4 py-2 text-center">
                      {isMatched ? (
                        <button onClick={() => setImportPreview(p => p.map((x, j) => j === globalIdx ? { ...x, recetteChoisieId: null, selected: true } : x))}
                          className="text-xs font-medium px-3 py-1 rounded-full border bg-green-100 text-green-700 border-green-200">
                          ✓ Matchée
                        </button>
                      ) : isNew ? (
                        <button onClick={() => setImportPreview(p => p.map((x, j) => j === globalIdx ? { ...x, selected: false } : x))}
                          className="text-xs font-medium px-3 py-1 rounded-full border bg-yellow-400 text-black border-yellow-400">
                          ✓ Créer
                        </button>
                      ) : (
                        <button onClick={() => setImportPreview(p => p.map((x, j) => j === globalIdx ? { ...x, selected: true } : x))}
                          className="text-xs font-medium px-3 py-1 rounded-full border bg-gray-100 text-gray-400 border-gray-200">
                          Ignoré
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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
            {TYPES_PLAT.map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.type === t ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500 hover:border-yellow-400'}`}>
                {t === 'food' ? 'Food' : 'Boisson'}
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

      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Food & Boisson</option>
          <option value="food">Food</option>
          <option value="boisson">Boisson</option>
        </select>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-500">{selected.size} sélectionnées</span>
            <select className="border border-yellow-200 rounded-lg px-3 py-2 text-sm" value={bulkType} onChange={e => setBulkType(e.target.value as TypePlat)}>
              <option value="food">Food</option>
              <option value="boisson">Boisson</option>
            </select>
            <button onClick={handleBulkType} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-3 py-2 text-sm">Appliquer type</button>
            <button onClick={async () => { if (!confirm(`Supprimer ${selected.size} recettes ?`)) return; for (const id of selected) await deleteDoc(doc(db, 'recettes', id)); setSelected(new Set()); fetchAll(); }} className="bg-red-100 text-red-600 hover:bg-red-200 font-semibold rounded-lg px-3 py-2 text-sm">Supprimer</button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
          </div>
        )}
      </div>

      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Recette</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-center w-8">
                  <input type="checkbox" className="accent-yellow-400"
                    checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                    onChange={e => { const s = new Set(selected); filtered.forEach(r => e.target.checked ? s.add(r.id) : s.delete(r.id)); setSelected(s); }} />
                </th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Coût matière</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-yellow-50 transition-colors ${selected.has(r.id) ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{r.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{r.categorie}</td>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={selected.has(r.id)} className="accent-yellow-400"
                      onChange={e => { const s = new Set(selected); e.target.checked ? s.add(r.id) : s.delete(r.id); setSelected(s); }} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.type === 'boisson' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {r.type === 'boisson' ? 'B' : 'F'}
                    </span>
                  </td>
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