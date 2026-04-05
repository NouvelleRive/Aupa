'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette } from '@/lib/types';
import { MenuDoc, MenuCategorie } from '@/lib/menuTypes';

interface VenteLine {
  nom: string;
  quantity: number;
  ttc: number;
  menuNom: string;
  mois: string;
}

const MENUS_ORDER = ['HIVER25', 'ETE25', 'HIVER24', 'ETE24', 'HIVER23', 'ETE23'];
const CATEGORIES = ['Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols', 'Wine/Beer', 'Cocktails', 'Apéro', 'Softs chaud', 'Softs froid', 'Sodas'];

const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
  const a = nomPopina.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const b = nomMenu.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mots = b.split(' ').filter(m => m.length > 3);
  return mots.some(m => a.includes(m)) || a.includes(b.split(' ')[0].toLowerCase());
};

export default function MenusPage() {
  const [menus, setMenus] = useState<MenuDoc[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [ventes, setVentes] = useState<VenteLine[]>([]);
  const [menuActif, setMenuActif] = useState<string>('');
  const [moisActif, setMoisActif] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  // Création menu
  const [showCreerMenu, setShowCreerMenu] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('ETE26');

  // Édition catégorie dans un menu
  const [menuEdit, setMenuEdit] = useState<string>(''); // id du menu en cours d'édition
  const [catNom, setCatNom] = useState('Croger');
  const [catRecetteIds, setCatRecetteIds] = useState<Set<string>>(new Set());
  const [filterCatEdit, setFilterCatEdit] = useState('all');
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    const [mSnap, rSnap, vSnap] = await Promise.all([
      getDocs(collection(db, 'menus')),
      getDocs(collection(db, 'recettes')),
      getDocs(collection(db, 'ventes')),
    ]);
    const ms = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuDoc));
    setMenus(ms);
    setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
    setVentes(vSnap.docs.map(d => d.data() as VenteLine));
    if (ms.length > 0 && !menuActif) setMenuActif(ms[0].id);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Créer un nouveau menu
  const handleCreerMenu = async () => {
    if (!nouveauNom.trim()) return;
    const nom = nouveauNom.toUpperCase().trim();
    const saison = nom.startsWith('ETE') ? 'été' : 'hiver';
    const annee = parseInt('20' + nom.replace('ETE', '').replace('HIVER', ''));
    const newDoc = await addDoc(collection(db, 'menus'), {
      nom, saison, annee, categories: [], actif: true,
      createdAt: new Date().toISOString(),
    });
    setShowCreerMenu(false);
    setNouveauNom('ETE26');
    await fetchAll();
    setMenuActif(newDoc.id);
  };

  // Sauvegarder une catégorie dans un menu
  const handleSauvegarderCategorie = async () => {
    const menu = menus.find(m => m.id === menuEdit);
    if (!menu) return;

    const newCat: MenuCategorie = { nom: catNom, recetteIds: [...catRecetteIds] };
    let newCats = [...menu.categories];

    if (editingCatIdx !== null) {
      newCats[editingCatIdx] = newCat;
    } else {
      newCats.push(newCat);
    }

    await updateDoc(doc(db, 'menus', menuEdit), { categories: newCats });
    setMenuEdit('');
    setCatRecetteIds(new Set());
    setEditingCatIdx(null);
    await fetchAll();
  };

  // Supprimer une catégorie
  const handleSupprimerCategorie = async (menuId: string, idx: number) => {
    const menu = menus.find(m => m.id === menuId);
    if (!menu) return;
    const newCats = menu.categories.filter((_, i) => i !== idx);
    await updateDoc(doc(db, 'menus', menuId), { categories: newCats });
    await fetchAll();
  };

  // Import Popina
  const handleImportPopina = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const dateMatch = file.name.match(/(\d{4})(\d{2})\d{2}/);
    let mois = '2025-01';
    let menuNom = 'HIVER25';
    if (dateMatch) {
      const annee = dateMatch[1];
      const moisNum = parseInt(dateMatch[2]);
      mois = `${annee}-${String(moisNum).padStart(2, '0')}`;
      const saison = moisNum >= 5 && moisNum <= 10 ? 'ETE' : 'HIVER';
      menuNom = `${saison}${annee.slice(2)}`;
    }

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);

    const existingSnap = await getDocs(query(collection(db, 'ventes'), where('mois', '==', mois)));
    for (const d of existingSnap.docs) await deleteDoc(d.ref);

    let count = 0;
    for (const row of rows) {
      const nom = row['name'] || '';
      const quantity = row['quantity'] || 0;
      const ttc = row['TTC'] || 0;
      if (!nom || quantity <= 0) continue;
      await addDoc(collection(db, 'ventes'), { nom, quantity, ttc, menuNom, mois });
      count++;
    }

    setImporting(false);
    alert(`✅ ${count} lignes importées → ${menuNom} / ${mois}`);
    const vSnap = await getDocs(collection(db, 'ventes'));
    setVentes(vSnap.docs.map(d => d.data() as VenteLine));
    e.target.value = '';
  };

  const menuCourant = menus.find(m => m.id === menuActif);
  const moisDisponibles = [...new Set(ventes.filter(v => v.menuNom === menuCourant?.nom).map(v => v.mois))].sort();

  const getVentesPourPlat = (nomPlat: string) => {
    return ventes.filter(v =>
      v.menuNom === menuCourant?.nom &&
      (moisActif === 'all' || v.mois === moisActif) &&
      matchPlat(v.nom, nomPlat)
    );
  };

  const tousLesIds = menuCourant?.categories.flatMap(c => c.recetteIds) || [];
  const toutesRecettesCarte = recettes.filter(r => tousLesIds.includes(r.id));

  const caReel = ventes.filter(v => v.menuNom === menuCourant?.nom && (moisActif === 'all' || v.mois === moisActif)).reduce((s, v) => s + v.ttc, 0);
  const totalVendus = ventes.filter(v => v.menuNom === menuCourant?.nom && (moisActif === 'all' || v.mois === moisActif)).reduce((s, v) => s + v.quantity, 0);
  const foodCostMoyen = toutesRecettesCarte.filter(r => r.prixVente > 0).length > 0
    ? toutesRecettesCarte.filter(r => r.prixVente > 0).reduce((s, r) => s + (r.coutCalcule / (r.prixVente / 1.1)) * 100, 0) / toutesRecettesCarte.filter(r => r.prixVente > 0).length
    : 0;

  const recettesFiltrees = recettes.filter(r => filterCatEdit === 'all' || r.categorie === filterCatEdit);

  if (loading) return <p className="text-gray-400 p-6">Chargement...</p>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Menus</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCreerMenu(!showCreerMenu)}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            + Nouveau menu
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {importing ? 'Import...' : 'Importer ventes Popina'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportPopina} />
        </div>
      </div>

      {/* Créer un menu */}
      {showCreerMenu && (
        <div className="bg-white rounded-xl border border-yellow-100 p-4 mb-6 flex gap-3 items-center">
          <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-40"
            placeholder="Ex: ETE26" value={nouveauNom}
            onChange={e => setNouveauNom(e.target.value.toUpperCase())} />
          <button onClick={handleCreerMenu} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Créer</button>
          <button onClick={() => setShowCreerMenu(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
        </div>
      )}

      {/* Onglets menus */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {menus.sort((a, b) => b.annee - a.annee || (b.saison === 'hiver' ? 1 : -1)).map(m => (
          <button key={m.id} onClick={() => { setMenuActif(m.id); setMoisActif('all'); setMenuEdit(''); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${menuActif === m.id ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-gray-200 text-gray-600 hover:border-yellow-300'}`}>
            {m.nom}
          </button>
        ))}
      </div>

      {!menuCourant ? (
        <p className="text-gray-400 text-center py-12">Crée un menu pour commencer.</p>
      ) : (
        <>
          {/* Filtre mois */}
          {moisDisponibles.length > 0 && (
            <div className="flex gap-2 mb-6 flex-wrap">
              <button onClick={() => setMoisActif('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === 'all' ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
                Tous les mois
              </button>
              {moisDisponibles.map(m => (
                <button key={m} onClick={() => setMoisActif(m)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === m ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-yellow-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Plats sur le menu</p>
              <p className="text-2xl font-bold">{tousLesIds.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Food cost moyen</p>
              <p className={`text-2xl font-bold ${foodCostMoyen > 32 ? 'text-yellow-500' : ''}`}>{foodCostMoyen > 0 ? foodCostMoyen.toFixed(1) + '%' : '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-100 p-4">
              <p className="text-xs text-gray-500 mb-1">CA réel (Popina)</p>
              <p className="text-2xl font-bold">{caReel > 0 ? caReel.toFixed(0) + ' €' : '—'}</p>
            </div>
            <div className="bg-white rounded-xl border border-yellow-100 p-4">
              <p className="text-xs text-gray-500 mb-1">Articles vendus</p>
              <p className="text-2xl font-bold">{totalVendus > 0 ? totalVendus : '—'}</p>
            </div>
          </div>

          {/* Catégories du menu */}
          <div className="space-y-4 mb-6">
            {menuCourant.categories.map((cat, idx) => {
              const platsCategorie = recettes.filter(r => cat.recetteIds.includes(r.id));
              const ventsCat = platsCategorie.map(p => {
                const v = getVentesPourPlat(p.nom);
                return { ...p, vendus: v.reduce((s, x) => s + x.quantity, 0), caReel: v.reduce((s, x) => s + x.ttc, 0) };
              });
              const totalVendusCat = ventsCat.reduce((s, p) => s + p.vendus, 0);
              return (
                <div key={idx} className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
                  <div className="bg-yellow-50 px-4 py-3 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-700">{cat.nom}</h2>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">{platsCategorie.length} plats {totalVendusCat > 0 ? `· ${totalVendusCat} vendus` : ''}</span>
                      <button onClick={() => {
                        setMenuEdit(menuCourant.id);
                        setCatNom(cat.nom);
                        setCatRecetteIds(new Set(cat.recetteIds));
                        setEditingCatIdx(idx);
                        setFilterCatEdit('all');
                      }} className="text-xs text-gray-400 hover:text-yellow-500">Modifier</button>
                      <button onClick={() => handleSupprimerCategorie(menuCourant.id, idx)} className="text-xs text-gray-400 hover:text-yellow-500">Supprimer</button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-gray-400 text-xs uppercase border-b border-yellow-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Plat</th>
                        <th className="px-4 py-2 text-right">Prix</th>
                        <th className="px-4 py-2 text-right">Food cost</th>
                        <th className="px-4 py-2 text-right">Vendus</th>
                        <th className="px-4 py-2 text-right">CA réel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-yellow-50">
                      {ventsCat.sort((a, b) => b.vendus - a.vendus).map((plat, i) => {
                        const pHT = plat.prixVente / 1.1;
                        const fc = pHT > 0 ? (plat.coutCalcule / pHT) * 100 : 0;
                        return (
                          <tr key={i} className="hover:bg-yellow-50 transition-colors">
                            <td className="px-4 py-3 font-medium">{plat.nom}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{plat.prixVente.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-semibold ${fc > 32 ? 'text-yellow-500' : 'text-gray-700'}`}>{fc > 0 ? fc.toFixed(1) + '%' : '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {plat.vendus > 0 ? <span className="font-semibold">{plat.vendus}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {plat.caReel > 0 ? <span className="font-semibold text-yellow-600">{plat.caReel.toFixed(0)} €</span> : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Ajouter une catégorie */}
          {menuEdit === menuCourant.id ? (
            <div className="bg-white rounded-xl border border-yellow-100 p-6">
              <h2 className="font-semibold text-gray-700 mb-4">{editingCatIdx !== null ? 'Modifier la catégorie' : 'Ajouter une catégorie'}</h2>
              <div className="flex gap-3 mb-4 flex-wrap">
                <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                  value={catNom} onChange={e => setCatNom(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                  value={filterCatEdit} onChange={e => setFilterCatEdit(e.target.value)}>
                  <option value="all">Toutes catégories</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <span className="text-sm text-gray-400 self-center">{catRecetteIds.size} recettes sélectionnées</span>
                <button onClick={handleSauvegarderCategorie} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Enregistrer</button>
                <button onClick={() => { setMenuEdit(''); setCatRecetteIds(new Set()); setEditingCatIdx(null); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {recettesFiltrees.map(r => (
                  <label key={r.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${catRecetteIds.has(r.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 hover:border-yellow-200'}`}>
                    <input type="checkbox" checked={catRecetteIds.has(r.id)} onChange={e => {
                      const s = new Set(catRecetteIds);
                      e.target.checked ? s.add(r.id) : s.delete(r.id);
                      setCatRecetteIds(s);
                    }} className="accent-yellow-400" />
                    <div>
                      <p className="text-sm font-medium">{r.nom}</p>
                      <p className="text-xs text-gray-400">{r.categorie} · {r.prixVente?.toFixed(2)} €</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <button onClick={() => { setMenuEdit(menuCourant.id); setCatNom('Croger'); setCatRecetteIds(new Set()); setEditingCatIdx(null); setFilterCatEdit('all'); }}
              className="w-full border-2 border-dashed border-yellow-200 rounded-xl py-4 text-yellow-400 hover:border-yellow-400 font-semibold text-sm transition-colors">
              + Ajouter une catégorie
            </button>
          )}
        </>
      )}
    </div>
  );
}