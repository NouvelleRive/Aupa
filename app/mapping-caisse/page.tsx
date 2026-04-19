'use client';

import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Recette } from '@/lib/types';
import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';

export default function MappingCaissePage() {
  const [ventesNoms, setVentesNoms] = useState<string[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [mappings, setMappings] = useState<{ id: string; caisse: string; recette: string; original: string; recetteNom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterNonMappé, setFilterNonMappé] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchAll = async () => {
    const [vSnap, rSnap, mSnap] = await Promise.all([
      getDocs(collection(db, 'ventes')),
      getDocs(collection(db, 'recettes')),
      getDocs(collection(db, 'caisseMapCustom')),
    ]);

    const nomsSet = new Set<string>();
    for (const d of vSnap.docs) {
      const nom = d.data().nom;
      if (nom) nomsSet.add(nom);
    }
    setVentesNoms(Array.from(nomsSet));
    setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));

    const maps = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    setMappings(maps);
    for (const m of maps) {
      if (m.caisse && m.recette) CAISSE_MAP[m.caisse] = m.recette;
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const recetteNoms = useMemo(() =>
    recettes.map(r => r.nom).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    [recettes]
  );

  // Pour chaque touche caisse, trouver son mapping
  const touches = useMemo(() => {
    return ventesNoms.map(nom => {
      const caisseKey = normalizeCaisse(nom);
      const mapping = mappings.find(m => m.caisse === caisseKey);
      let recetteNom: string | null = null;
      if (mapping) {
        for (const r of recettes) {
          const rKey = normalizeCaisse(r.nom).replace(/\s+(ete|hiver)$/, '');
          if (rKey === mapping.recette) { recetteNom = r.nom; break; }
        }
        if (!recetteNom) recetteNom = mapping.recetteNom || mapping.recette;
      }
      return { nom, caisseKey, mappedTo: mapping?.recette || null, mappingId: mapping?.id || null, recetteNom };
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [ventesNoms, mappings, recettes]);

  const filtered = useMemo(() => {
    let list = touches;
    if (filterNonMappé) list = list.filter(t => !t.mappedTo);
    if (search) {
      const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      list = list.filter(t =>
        t.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s) ||
        (t.recetteNom && t.recetteNom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s))
      );
    }
    return list;
  }, [touches, filterNonMappé, search]);

  const nbMappés = touches.filter(t => t.mappedTo).length;

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
    fetchAll();
  };

  const handleUnmap = async (mappingId: string, caisseKey: string) => {
    await deleteDoc(doc(db, 'caisseMapCustom', mappingId));
    delete CAISSE_MAP[caisseKey];
    fetchAll();
  };

  if (loading) return <div className="max-w-5xl mx-auto p-6"><p className="text-gray-400">Chargement...</p></div>;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mapping caisse</h1>
          <p className="text-sm text-gray-400 mt-1">{nbMappés}/{touches.length} touches attribuées</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterNonMappé} onChange={e => setFilterNonMappé(e.target.checked)} className="accent-yellow-400" />
          Non attribués seulement
        </label>
      </div>

      <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left w-[40%]">Touche caisse</th>
              <th className="px-4 py-3 text-left w-[50%]">Recette</th>
              <th className="px-4 py-3 w-[10%]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-yellow-50">
            {filtered.map(item => (
              <tr key={item.nom} className={`transition-colors ${item.mappedTo ? 'hover:bg-yellow-50' : 'bg-orange-50/30 hover:bg-orange-50/50'}`}>
                <td className="px-4 py-3 font-medium">{item.nom}</td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 text-right">
                  {item.mappedTo && item.mappingId && (
                    <button onClick={() => handleUnmap(item.mappingId!, item.caisseKey)} className="text-gray-400 hover:text-red-500 text-xs">Retirer</button>
                  )}
                  {saving === item.nom && <span className="text-xs text-gray-400">...</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                {filterNonMappé ? 'Toutes les touches sont attribuées !' : 'Aucune touche trouvée'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
