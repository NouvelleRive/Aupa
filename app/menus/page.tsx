'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette } from '@/lib/types';

interface VenteLine {
  nom: string;
  quantity: number;
  ttc: number;
  carte: string;
  mois: string;
}

const CARTES_ORDER = ['HIVER25', 'ETE25', 'HIVER24', 'ETE24', 'HIVER23', 'ETE23'];

const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
  const a = nomPopina.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const b = nomMenu.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mots = b.split(' ').filter(m => m.length > 3);
  return mots.some(m => a.includes(m)) || a.includes(b.split(' ')[0].toLowerCase());
};

export default function MenusPage() {
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [ventes, setVentes] = useState<VenteLine[]>([]);
  const [carteActive, setCarteActive] = useState<string>('HIVER25');
  const [moisActif, setMoisActif] = useState<string>('all');
  const [importing, setImporting] = useState(false);
  const [showCreer, setShowCreer] = useState(false);
  const [nouvelleCarte, setNouvelleCarte] = useState('ETE26');
  const [selectionMenu, setSelectionMenu] = useState<Set<string>>(new Set());
  const [filterCatCreer, setFilterCatCreer] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const CATEGORIES = ['Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols', 'Wine/Beer', 'Cocktails', 'Apéro', 'Softs chaud', 'Softs froid', 'Sodas'];

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'recettes')),
      getDocs(collection(db, 'ventes')),
    ]).then(([rSnap, vSnap]) => {
      setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
      setVentes(vSnap.docs.map(d => d.data() as VenteLine));
      setLoading(false);
    });
  }, []);

  const handleImportPopina = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const dateMatch = file.name.match(/(\d{4})(\d{2})\d{2}/);
    let mois = '2025-01';
    let carte = 'HIVER25';
    if (dateMatch) {
      const annee = dateMatch[1];
      const moisNum = parseInt(dateMatch[2]);
      mois = `${annee}-${String(moisNum).padStart(2, '0')}`;
      const saison = moisNum >= 5 && moisNum <= 10 ? 'ETE' : 'HIVER';
      carte = `${saison}${annee.slice(2)}`;
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
      await addDoc(collection(db, 'ventes'), { nom, quantity, ttc, carte, mois });
      count++;
    }

    setImporting(false);
    alert(`✅ ${count} lignes importées → ${carte} / ${mois}`);
    const vSnap = await getDocs(collection(db, 'ventes'));
    setVentes(vSnap.docs.map(d => d.data() as VenteLine));
    e.target.value = '';
  };

  const handleEnregistrerMenu = async () => {
    if (selectionMenu.size === 0) return;
    for (const id of selectionMenu) {
      await updateDoc(doc(db, 'recettes', id), { carte: nouvelleCarte });
    }
    alert(`✅ ${selectionMenu.size} recettes assignées à ${nouvelleCarte} !`);
    setSelectionMenu(new Set());
    setShowCreer(false);
    const rSnap = await getDocs(collection(db, 'recettes'));
    setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
  };

  const recettesCarte = recettes.filter(r => r.carte === carteActive);

  const getVentesPourPlat = (nomPlat: string) => {
    return ventes.filter(v =>
      v.carte === carteActive &&
      (moisActif === 'all' || v.mois === moisActif) &&
      matchPlat(v.nom, nomPlat)
    );
  };

  const moisDisponibles = [...new Set(ventes.filter(v => v.carte === carteActive).map(v => v.mois))].sort();

  const parCategorie = recettesCarte.reduce((acc, r) => {
    if (!acc[r.categorie]) acc[r.categorie] = [];
    acc[r.categorie].push(r);
    return acc;
  }, {} as Record<string, Recette[]>);

  // KPIs globaux
  const ventesCarteActuelle = ventes.filter(v => v.carte === carteActive && (moisActif === 'all' || v.mois === moisActif));
  const caReel = ventesCarteActuelle.reduce((s, v) => s + v.ttc, 0);
  const totalVendus = ventesCarteActuelle.reduce((s, v) => s + v.quantity, 0);
  const caPotentiel = recettesCarte.filter(r => r.prixVente > 0).reduce((s, r) => s + r.prixVente, 0);
  const foodCostMoyen = recettesCarte.filter(r => r.prixVente > 0).length > 0
    ? recettesCarte.filter(r => r.prixVente > 0).reduce((s, r) => s + (r.coutCalcule / (r.prixVente / 1.1)) * 100, 0) / recettesCarte.filter(r => r.prixVente > 0).length
    : 0;

  const recettesFiltrees = recettes.filter(r => filterCatCreer === 'all' || r.categorie === filterCatCreer);

  if (loading) return <p className="text-gray-400 p-6">Chargement...</p>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Menus Food</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowCreer(!showCreer)}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            + Créer un menu
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {importing ? 'Import...' : 'Importer ventes Popina'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportPopina} />
        </div>
      </div>

      {/* Module créer un menu */}
      {showCreer && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">Assigner des recettes à une carte</h2>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-40"
              placeholder="Carte (ex: ETE26)" value={nouvelleCarte}
              onChange={e => setNouvelleCarte(e.target.value.toUpperCase())} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
              value={filterCatCreer} onChange={e => setFilterCatCreer(e.target.value)}>
              <option value="all">Toutes catégories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <span className="text-sm text-gray-400 self-center">{selectionMenu.size} sélectionnées</span>
            <button onClick={handleEnregistrerMenu}
              className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
              Enregistrer
            </button>
            <button onClick={() => { setShowCreer(false); setSelectionMenu(new Set()); }}
              className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {recettesFiltrees.map(r => (
              <label key={r.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectionMenu.has(r.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 hover:border-yellow-200'}`}>
                <input type="checkbox" checked={selectionMenu.has(r.id)} onChange={e => {
                  const s = new Set(selectionMenu);
                  e.target.checked ? s.add(r.id) : s.delete(r.id);
                  setSelectionMenu(s);
                }} className="accent-yellow-400" />
                <div>
                  <p className="text-sm font-medium">{r.nom}</p>
                  <p className="text-xs text-gray-400">{r.categorie} · {r.prixVente?.toFixed(2)} € · {r.carte}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Onglets cartes */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CARTES_ORDER.filter(c => recettes.some(r => r.carte === c)).map(c => (
          <button key={c} onClick={() => { setCarteActive(c); setMoisActif('all'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${carteActive === c ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-gray-200 text-gray-600 hover:border-yellow-300'}`}>
            {c}
          </button>
        ))}
      </div>

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
          <p className="text-xs text-gray-500 mb-1">Plats sur la carte</p>
          <p className="text-2xl font-bold">{recettesCarte.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Food cost moyen</p>
          <p className={`text-2xl font-bold ${foodCostMoyen > 32 ? 'text-yellow-500' : ''}`}>{foodCostMoyen.toFixed(1)}%</p>
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

      {/* Détail par catégorie */}
      {recettesCarte.length === 0 ? (
        <p className="text-gray-400 text-center py-12">Aucune recette sur cette carte — utilise "+ Créer un menu" pour en assigner.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(parCategorie).map(([categorie, plats]) => {
            const ventsCat = plats.map(p => {
              const v = getVentesPourPlat(p.nom);
              return { ...p, vendus: v.reduce((s, x) => s + x.quantity, 0), caReel: v.reduce((s, x) => s + x.ttc, 0) };
            });
            const totalVendusCat = ventsCat.reduce((s, p) => s + p.vendus, 0);
            return (
              <div key={categorie} className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
                <div className="bg-yellow-50 px-4 py-3 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-700">{categorie}</h2>
                  <span className="text-xs text-gray-400">
                    {plats.length} plats {totalVendusCat > 0 ? `· ${totalVendusCat} vendus` : ''}
                  </span>
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
                            <span className={`font-semibold ${fc > 32 ? 'text-yellow-500' : 'text-gray-700'}`}>
                              {fc > 0 ? fc.toFixed(1) + '%' : '—'}
                            </span>
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
      )}
    </div>
  );
}