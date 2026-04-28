'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cachedGetDocs, invalidateCache } from '@/lib/firestoreCache';
import { Recette } from '@/lib/types';
import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';

export default function MappingCaissePage() {
  const [ventesData, setVentesData] = useState<{ nom: string; menuNom: string; prixUnit: number }[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [mappings, setMappings] = useState<{ id: string; caisse: string; recette: string; original: string; recetteNom: string }[]>([]);
  const [caisseCategories, setCaisseCategories] = useState<Record<string, { nom: string; parent: string; cat: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingAll, setLoadingAll] = useState(false);
  const [chargedAll, setChargedAll] = useState(false);
  const [search, setSearch] = useState('');
  const [filterNonMappé, setFilterNonMappé] = useState(true);
  const [filterCat, setFilterCat] = useState('all');
  const [saving, setSaving] = useState<string | null>(null);

  // Date 12 mois en arrière (YYYY-MM-DD)
  const dateDebut12m = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  }, []);

  // Dédupe les ventes en (nom, menuNom, prixUnit), garde le menuNom le plus récent
  const dedupeVentes = (docs: any[]) => {
    const nomsMap = new Map<string, { nom: string; menuNom: string; prixUnit: number }>();
    for (const data of docs) {
      const nom = data.nom;
      if (nom && !nomsMap.has(nom)) {
        const pu = data.quantity > 0 ? data.ttc / data.quantity : data.ttc || 0;
        nomsMap.set(nom, { nom, menuNom: data.menuNom || '', prixUnit: Math.round(pu * 100) / 100 });
      }
    }
    return Array.from(nomsMap.values());
  };

  // Load initial : ventes des 12 derniers mois uniquement
  const fetchAll = async (fresh = false) => {
    if (fresh) invalidateCache('recettes', 'caisseMapCustom');
    const [vSnap, rSnap, mSnap, catDoc] = await Promise.all([
      getDocs(query(collection(db, 'ventes'), where('jour', '>=', dateDebut12m))),
      cachedGetDocs('recettes'),
      cachedGetDocs('caisseMapCustom'),
      getDoc(doc(db, 'config', 'caisseCategories')),
    ]);

    setVentesData(dedupeVentes(vSnap.docs.map(d => d.data())));
    setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));

    const maps = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    setMappings(maps);
    for (const m of maps) {
      if (m.caisse && m.recette) CAISSE_MAP[m.caisse] = m.recette;
    }

    if (catDoc.exists()) setCaisseCategories(catDoc.data() as any);
    setLoading(false);
  };

  // Load full : ventes de tous les temps (au clic du bouton)
  const handleLoadAll = async () => {
    setLoadingAll(true);
    const vSnap = await getDocs(collection(db, 'ventes'));
    setVentesData(dedupeVentes(vSnap.docs.map(d => d.data())));
    setChargedAll(true);
    setLoadingAll(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const recetteNoms = useMemo(() =>
    recettes.map(r => r.nom).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    [recettes]
  );

  // Trouver la catégorie Popina d'un nom de touche
  const getCatPopina = (nom: string): string => {
    // Chercher par nom exact d'abord
    for (const val of Object.values(caisseCategories)) {
      if (val.nom.trim() === nom.trim()) {
        const p = val.parent;
        if (p.includes('Croissant Burger')) return 'Plats';
        return p;
      }
    }
    const key = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_');
    const entry = caisseCategories[key];
    if (entry) {
      // Simplifier le parent
      const p = entry.parent;
      if (p.includes('Croissant Burger')) return 'Plats';
      return p;
    }
    return '';
  };

  const touches = useMemo(() => {
    return ventesData.map(v => {
      const caisseKey = normalizeCaisse(v.nom);
      const mapping = mappings.find(m => m.caisse === caisseKey);
      let recetteNom: string | null = null;
      if (mapping) {
        for (const r of recettes) {
          const rKey = normalizeCaisse(r.nom).replace(/\s+(ete|hiver)$/, '');
          if (rKey === mapping.recette) { recetteNom = r.nom; break; }
        }
        if (!recetteNom) recetteNom = mapping.recetteNom || mapping.recette;
      }
      const catPopina = getCatPopina(v.nom);
      return { nom: v.nom, caisseKey, mappedTo: mapping?.recette || null, mappingId: mapping?.id || null, recetteNom, catPopina, menuNom: v.menuNom, prixUnit: v.prixUnit };
    }).sort((a, b) => a.catPopina.localeCompare(b.catPopina) || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesData, mappings, recettes, caisseCategories]);

  // Catégories Popina uniques pour le filtre
  const catsPopina = useMemo(() => {
    const s = new Set(touches.map(t => t.catPopina).filter(Boolean));
    return Array.from(s).sort();
  }, [touches]);

  const filtered = useMemo(() => {
    let list = touches;
    if (filterNonMappé) list = list.filter(t => !t.mappedTo);
    if (filterCat !== 'all') list = list.filter(t => t.catPopina === filterCat);
    if (search) {
      const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter(t =>
        t.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s) ||
        (t.recetteNom && t.recetteNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s))
      );
    }
    return list;
  }, [touches, filterNonMappé, filterCat, search]);

  const nbMappés = touches.filter(t => t.mappedTo).length;

  // Refetch uniquement les mappings (pas les ventes — pas besoin)
  const refetchMappings = async () => {
    invalidateCache('caisseMapCustom');
    const mSnap = await cachedGetDocs('caisseMapCustom');
    const maps = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    setMappings(maps);
  };

  const handleMap = async (venteNom: string, recetteNom: string) => {
    if (!recetteNom) return;
    setSaving(venteNom);
    const caisseKey = normalizeCaisse(venteNom);
    const recetteKey = normalizeCaisse(recetteNom).replace(/\s+(ete|hiver)$/, '');

    const existing = mappings.find(m => m.caisse === caisseKey);
    if (existing) await deleteDoc(doc(db, 'caisseMapCustom', existing.id));

    await addDoc(collection(db, 'caisseMapCustom'), {
      caisse: caisseKey, recette: recetteKey, original: venteNom, recetteNom,
    });
    CAISSE_MAP[caisseKey] = recetteKey;
    setSaving(null);
    refetchMappings();
  };

  const handleUnmap = async (mappingId: string, caisseKey: string) => {
    await deleteDoc(doc(db, 'caisseMapCustom', mappingId));
    delete CAISSE_MAP[caisseKey];
    refetchMappings();
  };

  if (loading) return <div className="max-w-6xl mx-auto p-6"><p className="text-gray-400">Chargement...</p></div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mapping caisse</h1>
          <p className="text-sm text-gray-400 mt-1">
            {nbMappés}/{touches.length} touches attribuées
            {!chargedAll && <span className="ml-2 text-gray-300">· 12 derniers mois</span>}
          </p>
        </div>
        {!chargedAll && (
          <button onClick={handleLoadAll} disabled={loadingAll}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {loadingAll ? 'Chargement…' : 'Voir tout l\'historique'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          {catsPopina.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterNonMappé} onChange={e => setFilterNonMappé(e.target.checked)} className="accent-yellow-400" />
          Non attribués seulement
        </label>
      </div>

      <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-3 text-left w-[28%]">Touche caisse</th>
              <th className="px-2 py-3 text-right w-[7%]">Prix</th>
              <th className="px-2 py-3 text-left w-[12%]">Catégorie</th>
              <th className="px-2 py-3 text-left w-[8%]">Menu</th>
              <th className="px-2 py-3 text-left w-[37%]">Recette</th>
              <th className="px-2 py-3 w-[8%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-yellow-50">
            {filtered.map(item => (
              <tr key={item.nom} className={`transition-colors ${item.mappedTo ? 'hover:bg-yellow-50' : 'bg-orange-50/30 hover:bg-orange-50/50'}`}>
                <td className="px-3 py-3 font-medium">{item.nom}</td>
                <td className="px-2 py-3 text-right text-xs font-mono text-gray-500">{item.prixUnit > 0 ? item.prixUnit.toFixed(2) + ' €' : '—'}</td>
                <td className="px-2 py-3 text-xs text-gray-500">{item.catPopina || '—'}</td>
                <td className="px-2 py-3 text-xs text-gray-400">{item.menuNom || '—'}</td>
                <td className="px-2 py-3">
                  {item.mappedTo ? (
                    <span className="text-green-700 font-medium">{item.recetteNom}</span>
                  ) : (
                    <select
                      className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-2 py-1 text-sm w-full"
                      disabled={saving === item.nom}
                      value=""
                      onChange={e => handleMap(item.nom, e.target.value)}
                    >
                      <option value="">— Choisir une recette —</option>
                      {recetteNoms.map(nom => (
                        <option key={nom} value={nom}>{nom}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-2 py-3 text-right">
                  {item.mappedTo && item.mappingId && (
                    <button onClick={() => handleUnmap(item.mappingId!, item.caisseKey)} className="text-gray-400 hover:text-red-500 text-xs">Retirer</button>
                  )}
                  {saving === item.nom && <span className="text-xs text-gray-400">...</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                {filterNonMappé ? 'Toutes les touches sont attribuées !' : 'Aucune touche trouvée'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
