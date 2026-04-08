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
  done: boolean;
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
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
  const a = normalize(nomCaisse);
  const b = normalize(nomRecette);
  if (a === b) return true;

  // Détection du type de plat (croger, bol, salade, etc.)
  const getType = (s: string) => {
    if (s.includes('bol')) return 'bol';
    if (s.includes('croger')) return 'croger';
    if (s.includes('salade')) return 'salade';
    if (s.includes('planche')) return 'planche';
    return 'autre';
  };
  const typeA = getType(a);
  const typeB = getType(b);
  if (typeA !== 'autre' && typeB !== 'autre' && typeA !== typeB) return false;

  const STOP = new Set(['croger', 'bol', 'bowl', 'plat', 'entree', 'avec', 'salade']);
  const motsCaisse = a.split(' ').filter(m => m.length > 3 && !STOP.has(m));
  const motsRecette = b.split(' ').filter(m => m.length > 3 && !STOP.has(m));
  if (motsCaisse.length === 0 || motsRecette.length === 0) return false;
  const communsCaisse = motsCaisse.filter(m => b.includes(m));
  const communsRecette = motsRecette.filter(m => a.includes(m));
  if (communsCaisse.length === 0 || communsRecette.length === 0) return false;
  return communsCaisse.length >= motsCaisse.length * 0.8 && communsRecette.length >= motsRecette.length * 0.8;
};

const SHEET_TO_CAT: Record<string, CategorieRecette> = {
  'Croger': 'Croger', 'Mini Croger': 'Mini Croger', 'Entrées': 'Entrées',
  'Sides': 'Sides', 'Desserts': 'Desserts', 'Bols': 'Bols',
  'Prépas': 'Préparations',
  'Wine beer': 'Les Wines', 'Cocktails': 'Les Cocktailz', 'Apero': 'Les Apéritifs et Digestifs',
  'Softs maison chaud': 'Le Chaud', 'Softs maison froid': 'Les Iced', 'Sodas': 'Les Sodas',
};

const emptyForm = { nom: '', categorie: 'Croger' as CategorieRecette, type: 'food' as TypePlat, actif: true, quantiteProduite: '', uniteProduction: 'kg' };

export default function RecettesPage() {
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [lignes, setLignes] = useState<{ type: 'ingredient' | 'preparation'; id: string; grammage: string }[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>('all');
  const [importing, setImporting] = useState(false);
  const xlRef = useRef<HTMLInputElement>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<TypePlat>('food');
  const [showBulk, setShowBulk] = useState(false);
  const [nomIngredients, setNomIngredients] = useState<{nom: string, grammage: number, unite: string}[]>([]);
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
      const dejaMatchee = recettes.find(r => (r as any).nomPopina === nomRaw);
      if (dejaMatchee) continue;
      items.push({
        nomOriginal: nomRaw, nom, categorie, prix,
        recetteExistanteId: existante?.id || null,
        recetteExistanteNom: existante?.nom || null,
        recetteChoisieId: existante?.id || null,
        selected: true,
        done: false,
      });
    }
    setImportPreview(items);
    setShowImportPreview(true);
  };

  const handleConfirmImportFood = async () => {
    const aCreer = importPreview.filter(i => i.selected && !i.recetteChoisieId && !i.done);
    const aRenommer = importPreview.filter(i => i.selected && i.recetteChoisieId && !i.done);
    let created = 0;
    let renamed = 0;
    for (const item of aCreer) {
      await addDoc(collection(db, 'recettes'), {
        nom: item.nom, categorie: item.categorie, type: 'food', actif: true,
        prixVente: item.prix, ingredients: [], options: [], coutCalcule: 0,
        updatedAt: new Date().toISOString(),
      });
      created++;
    }
    for (const item of aRenommer) {
      if (!item.recetteChoisieId) continue;
      await updateDoc(doc(db, 'recettes', item.recetteChoisieId), {
        nom: item.nom,
        prixVente: item.prix,
        updatedAt: new Date().toISOString(),
      });
      renamed++;
    }
    setShowImportPreview(false);
    setImportPreview([]);
    alert(`✅ ${created} recettes créées, ${renamed} renommées !`);
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

    let created = 0;
    for (const sheetName of wb.SheetNames) {
      const cat = SHEET_TO_CAT[sheetName];
      if (!cat) continue;
      const ws2 = wb.Sheets[sheetName];
      const rows2: any[][] = XLSX.utils.sheet_to_json(ws2, { header: 1 });

      if (cat === 'Préparations') {
        // Format Prépas : nom prépa en col A avec col B vide, ingrédients en dessous
        let currentNom: string | null = null;
        let currentIngs: { nomIngredient: string; grammage: number; unite: string }[] = [];
        for (let r = 1; r < rows2.length; r++) {
          const row = rows2[r];
          const colA = row[0];
          const colB = row[1];
          if (typeof colA === 'string' && colA.trim() && (colB === null || colB === undefined)) {
            // Sauvegarder la prépa précédente
            if (currentNom && currentIngs.length > 0) {
              const existeDeja = recettes.find(r => r.nom.toLowerCase().trim() === currentNom!.toLowerCase().trim());
              if (!existeDeja) {
                await addDoc(collection(db, 'recettes'), {
                  nom: currentNom, categorie: 'Préparations', type: 'food', actif: true,
                  ingredients: currentIngs, options: [], coutCalcule: 0,
                  updatedAt: new Date().toISOString(),
                });
                created++;
              }
            }
            currentNom = colA.trim();
            currentIngs = [];
          } else if (currentNom && typeof colA === 'string' && colA.trim() && typeof colB === 'number') {
            const grammage = row[4];
            const unite = row[3];
            if (typeof grammage === 'number' && grammage > 0) {
              currentIngs.push({ nomIngredient: colA.trim(), grammage, unite: typeof unite === 'string' ? unite.trim() : 'kg' });
            }
          }
        }
        if (currentNom && currentIngs.length > 0) {
          const existeDeja = recettes.find(r => r.nom.toLowerCase().trim() === currentNom!.toLowerCase().trim());
          if (!existeDeja) {
            await addDoc(collection(db, 'recettes'), {
              nom: currentNom, categorie: 'Préparations', type: 'food', actif: true,
              ingredients: currentIngs, options: [], coutCalcule: 0,
              updatedAt: new Date().toISOString(),
            });
            created++;
          }
        }
        continue;
      }

      // Format standard (Croger, Sides, etc.)
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
        const lignesRecette: { nomIngredient: string; grammage: number; unite: string }[] = [];
        for (let r = 2; r < rows2.length; r++) {
          const row = rows2[r];
          const nomIng = row[0];
          const grammage = row[plat.colGrammage];
          if (typeof nomIng !== 'string' || !nomIng.trim()) continue;
          if (typeof grammage !== 'number' || grammage <= 0) continue;
          const unite = rows2[r][2];
          lignesRecette.push({ nomIngredient: nomIng.trim(), grammage, unite: typeof unite === 'string' ? unite.trim() : 'kg' });
        }
        const existeDeja = recettes.find(r => r.nom.toLowerCase().trim() === plat.nom.toLowerCase().trim());
        if (existeDeja) continue;
        await addDoc(collection(db, 'recettes'), {
          nom: plat.nom, categorie: cat, type: 'food', actif: true,
          ingredients: lignesRecette, options: [], coutCalcule: 0,
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
        const prixUnitaire = (ing.prix / ing.rendement) / ((ing as any).nbPieces || 1);
        return total + prixUnitaire * grammage;
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
    const quantiteProduite = parseFloat(form.quantiteProduite) || 0;
    const coutAuKg = quantiteProduite > 0 ? cout / quantiteProduite : 0;
    const data: any = {
      nom: form.nom, categorie: form.categorie,
      type: form.type, actif: form.actif,
      ingredients: lignes.filter(l => l.type === 'ingredient').map(l => ({ ingredientId: l.id, grammage: parseFloat(l.grammage) })),
      options: [], coutCalcule: cout, updatedAt: new Date().toISOString(),
    };
    if (form.categorie === 'Préparations' && quantiteProduite > 0) {
      data.quantiteProduite = quantiteProduite;
      data.uniteProduction = form.uniteProduction;
      data.coutAuKg = coutAuKg;
    }
    if (editId) { await updateDoc(doc(db, 'recettes', editId), data); setEditId(null); }
    else { await addDoc(collection(db, 'recettes'), data); }
    setForm(emptyForm); setLignes([]); setShowForm(false); fetchAll();
  };

  const handleEdit = (r: Recette) => {
    setEditId(r.id);
    setForm({ nom: r.nom, categorie: r.categorie, type: r.type || 'food', actif: r.actif, quantiteProduite: String((r as any).quantiteProduite || ''), uniteProduction: (r as any).uniteProduction || 'kg' });
    setLignes(r.ingredients.filter(i => i.ingredientId).map(i => ({ type: 'ingredient' as const, id: i.ingredientId!, grammage: String(i.grammage) })));
    setNomIngredients((r.ingredients as any[]).filter(i => i.nomIngredient).map(i => ({ nom: i.nomIngredient, grammage: i.grammage, unite: i.unite || 'kg' })));
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
  ).sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

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
          <button onClick={() => { setShowImportPreview(false); setImportPreview([]); fetchAll(); }}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            Fermer
          </button>
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
                if (item.done) return null;
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
                        {recettes.filter(r => r.type === 'food' && !importPreview.some(p => p.recetteChoisieId === r.id && p !== item)).sort((a, b) => a.nom.localeCompare(b.nom)).map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">{item.prix} €</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={async () => {
                          if (item.done) return;
                          const n = [...importPreview];
                          n[globalIdx] = { ...n[globalIdx], selected: true, done: true };
                          setImportPreview(n);
                          if (item.recetteChoisieId) {
                            await updateDoc(doc(db, 'recettes', item.recetteChoisieId), { nom: item.nom, nomPopina: item.nomOriginal, prixVente: item.prix, updatedAt: new Date().toISOString() });
                          } else {
                            await addDoc(collection(db, 'recettes'), { nom: item.nom, nomPopina: item.nomOriginal, categorie: item.categorie, type: 'food', actif: true, prixVente: item.prix, ingredients: [], options: [], coutCalcule: 0, updatedAt: new Date().toISOString() });
                          }
                        }}
                          className={`w-7 h-7 rounded-full border-2 transition-colors flex items-center justify-center ${item.done ? 'bg-green-600 border-green-600 text-white' : item.selected ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-gray-300 hover:border-green-400 hover:text-green-400'}`}>
                          {item.done ? '✓✓' : '✓'}
                        </button>
                        <button onClick={() => { setImportPreview(p => p.filter((_, j) => j !== globalIdx)); }}
                          className="w-7 h-7 rounded-full border-2 border-gray-300 text-gray-300 hover:border-red-400 hover:text-red-400 transition-colors flex items-center justify-center">
                          ✕
                        </button>
                      </div>
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

          {form.categorie === 'Préparations' && (
            <div className="flex gap-3 mb-4 items-center">
              <span className="text-sm text-gray-600">Quantité produite :</span>
              <input className="border border-yellow-200 rounded-lg px-3 py-2 text-sm w-24" type="number" placeholder="ex: 4" value={form.quantiteProduite} onChange={e => setForm(f => ({ ...f, quantiteProduite: e.target.value }))} />
              <select className="border border-yellow-200 rounded-lg px-3 py-2 text-sm" value={form.uniteProduction} onChange={e => setForm(f => ({ ...f, uniteProduction: e.target.value }))}>
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="pièce">pièce</option>
                <option value="portion">portion</option>
              </select>
              {form.quantiteProduite && coutPreview > 0 && (
                <span className="text-sm text-yellow-600 font-semibold">{(coutPreview / parseFloat(form.quantiteProduite)).toFixed(2)} €/{form.uniteProduction}</span>
              )}
            </div>
          )}

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Ingrédients & Préparations</span>
              <div className="flex gap-2">
                <button onClick={() => setLignes([...lignes, { type: 'ingredient', id: ingredients[0]?.id || '', grammage: '' }])} className="text-xs border border-yellow-200 hover:bg-yellow-50 rounded px-2 py-1">+ Ingrédient</button>
                <button onClick={() => {
                  const preps = recettes.filter(r => r.categorie === 'Préparations');
                  setLignes([...lignes, { type: 'preparation', id: preps[0]?.id || '', grammage: '' }]);
                }} className="text-xs border border-yellow-200 hover:bg-yellow-50 rounded px-2 py-1">+ Préparation</button>
              </div>
            </div>
            <div className="space-y-2">
              {lignes.map((ligne, i) => {
                const ing = ingredients.find(x => x.id === ligne.id);
                const grammage = parseFloat(ligne.grammage) || 0;
                const coutLigne = ing ? (ing.prix / ing.rendement) * grammage : 0;
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select className="border border-yellow-200 rounded-lg px-3 py-2 text-sm flex-1" value={ligne.id} onChange={e => { const n = [...lignes]; n[i].id = e.target.value; setLignes(n); }}>
                      {ligne.type === 'ingredient'
                        ? ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.nom} ({ing.unite})</option>)
                        : recettes.filter(r => r.categorie === 'Préparations').map(p => <option key={p.id} value={p.id}>{p.nom}</option>)
                      }
                    </select>
                    <input className="border border-yellow-200 rounded-lg px-3 py-2 text-sm w-24" placeholder="Qté" type="number" value={ligne.grammage} onChange={e => { const n = [...lignes]; n[i].grammage = e.target.value; setLignes(n); }} />
                    {ing && <span className="text-xs text-gray-400 w-20 text-right">{ing.prix.toFixed(2)} €/{ing.unite}</span>}
                    {coutLigne > 0 && <span className="text-xs font-semibold text-yellow-600 w-16 text-right">{coutLigne.toFixed(3)} €</span>}
                    <button onClick={() => setLignes(lignes.filter((_, j) => j !== i))} className="text-gray-400 hover:text-yellow-500 text-sm">✕</button>
                  </div>
                );
              })}
            </div>
          </div>

          {nomIngredients.map((n, i) => (
            <div key={'nom-' + i} className="flex gap-2 items-center mb-2">
              <span className="flex-1 border border-yellow-100 bg-yellow-50 rounded-lg px-3 py-2 text-sm text-gray-400 italic">{n.nom}</span>
              <input className="border border-yellow-200 rounded-lg px-3 py-2 text-sm w-24" type="number" value={n.grammage}
                onChange={e => { const nn = [...nomIngredients]; nn[i] = { ...nn[i], grammage: parseFloat(e.target.value) || 0 }; setNomIngredients(nn); }} />
              <span className="text-xs text-gray-400 w-20 text-right">— €/{n.unite}</span>
              <span className="text-xs text-gray-300 w-16 text-right">non lié</span>
              <button onClick={() => setNomIngredients(nomIngredients.filter((_, j) => j !== i))} className="text-gray-400 hover:text-yellow-500 text-sm">✕</button>
            </div>
          ))}

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
                <th className="px-4 py-3 text-center w-8">
                  <input type="checkbox" className="accent-yellow-400"
                    checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                    onChange={e => { const s = new Set(selected); filtered.forEach(r => e.target.checked ? s.add(r.id) : s.delete(r.id)); setSelected(s); }} />
                </th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-left">Recette</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix TTC</th>
                <th className="px-4 py-3 text-right">Coût matière</th>
                <th className="px-4 py-3 text-right">Food cost</th>
                <th className="px-4 py-3 text-right">Marge</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(r => (
                <tr key={r.id} className={`hover:bg-yellow-50 transition-colors ${selected.has(r.id) ? 'bg-yellow-50' : ''} ${(!r.ingredients || r.ingredients.length === 0) ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" checked={selected.has(r.id)} className="accent-yellow-400"
                      onChange={e => { const s = new Set(selected); e.target.checked ? s.add(r.id) : s.delete(r.id); setSelected(s); }} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.type === 'boisson' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                      {r.type === 'boisson' ? 'B' : 'F'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{r.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{r.categorie}</td>
                  <td className="px-4 py-3 text-right">
                    {r.prixVente ? <><div>{r.prixVente.toFixed(2)} €</div><div className="text-xs text-gray-400">{(r.prixVente / 1.1).toFixed(2)} € HT</div></> : <span className="text-gray-300">—</span>}
                  </td>
                  {(() => {
                    const cout = (r.ingredients || []).reduce((total: number, i: any) => {
                      if (i.ingredientId || i.ingredientIds?.length > 0) {
                        const ids = i.ingredientIds || [i.ingredientId];
                        const ings = ids.map((id: string) => ingredients.find(x => x.id === id)).filter(Boolean);
                        if (ings.length === 0) return total;
                        const prixMoyen = ings.reduce((s: number, ing: any) => s + (ing.prix / ing.rendement) / ((ing as any).nbPieces || 1), 0) / ings.length;
                        return total + prixMoyen * i.grammage;
                      }
                      if (i.recetteId) {
                        const prep = recettes.find(x => x.id === i.recetteId) as any;
                        if (!prep || !prep.coutAuKg) return total;
                        return total + prep.coutAuKg * i.grammage;
                      }
                      return total;
                    }, 0);
                    const ht = r.prixVente ? r.prixVente / 1.1 : 0;
                    const fc = cout > 0 && ht > 0 ? cout / ht * 100 : 0;
                    return <>
                      <td className="px-4 py-3 text-right">
                        {cout > 0 ? <><div>{cout.toFixed(2)} €</div>{ht > 0 && <div className="text-xs text-gray-400">{(cout / ht * 100).toFixed(0)}% du HT</div>}</> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fc > 0 ? <span className={`font-semibold ${fc > 32 ? 'text-red-500' : 'text-gray-700'}`}>{fc.toFixed(1)}%</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cout > 0 && ht > 0 ? <span className="text-green-600 font-semibold">{(ht - cout).toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </>;
                  })()}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(r)} className="text-gray-400 hover:text-yellow-500" title="Modifier">✏️</button>
                      <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500" title="Supprimer">🗑️</button>
                    </div>
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