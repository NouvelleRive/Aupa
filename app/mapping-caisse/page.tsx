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
  const [saving, setSaving] = useState(false);

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

  // Pour chaque recette, trouver les touches caisse attribuées
  const recettesAvecTouches = useMemo(() => {
    return recettes
      .sort((a, b) => (a.categorie || '').localeCompare(b.categorie || '') || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }))
      .map(r => {
        const rKey = normalizeCaisse(r.nom).replace(/\s+(ete|hiver)$/, '');
        const touches = mappings
          .filter(m => m.recette === rKey)
          .map(m => ({ mappingId: m.id, original: m.original, caisse: m.caisse }));
        // Aussi chercher les touches non mappées qui correspondent exactement
        return { ...r, rKey, touches };
      });
  }, [recettes, mappings]);

  // Touches caisse non attribuées
  const touchesNonAttribuées = useMemo(() => {
    const mappedKeys = new Set(mappings.map(m => m.caisse));
    return ventesNoms
      .filter(nom => !mappedKeys.has(normalizeCaisse(nom)))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  }, [ventesNoms, mappings]);

  const nbMappés = mappings.length;
  const nbTotal = ventesNoms.length;

  const filtered = useMemo(() => {
    if (!search) return recettesAvecTouches;
    const s = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return recettesAvecTouches.filter(r =>
      r.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s) ||
      r.touches.some(t => t.original.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(s))
    );
  }, [recettesAvecTouches, search]);

  const handleMap = async (recetteNom: string, venteNom: string) => {
    if (!venteNom) return;
    setSaving(true);
    const caisseKey = normalizeCaisse(venteNom);
    const recetteKey = normalizeCaisse(recetteNom).replace(/\s+(ete|hiver)$/, '');
    await addDoc(collection(db, 'caisseMapCustom'), {
      caisse: caisseKey, recette: recetteKey, original: venteNom, recetteNom,
    });
    CAISSE_MAP[caisseKey] = recetteKey;
    setSaving(false);
    fetchAll();
  };

  const handleUnmap = async (mappingId: string, caisseKey: string) => {
    await deleteDoc(doc(db, 'caisseMapCustom', mappingId));
    delete CAISSE_MAP[caisseKey];
    fetchAll();
  };

  if (loading) return <div className="max-w-6xl mx-auto p-6"><p className="text-gray-400">Chargement...</p></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mapping caisse</h1>
          <p className="text-sm text-gray-400 mt-1">{nbMappés} attribuées · {touchesNonAttribuées.length} non attribuées · {nbTotal} touches total</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-64"
          placeholder="Rechercher une recette ou touche..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left w-[30%]">Recette</th>
              <th className="px-4 py-3 text-left w-[10%]">Catégorie</th>
              <th className="px-4 py-3 text-left w-[35%]">Touches caisse attribuées</th>
              <th className="px-4 py-3 text-left w-[25%]">Ajouter touche</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-yellow-50">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-yellow-50 transition-colors">
                <td className="px-4 py-3 font-medium">{r.nom}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.categorie}</td>
                <td className="px-4 py-3">
                  {r.touches.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.touches.map(t => (
                        <span key={t.mappingId} className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1">
                          {t.original}
                          <button onClick={() => handleUnmap(t.mappingId, t.caisse)} className="text-green-400 hover:text-red-500 ml-0.5">✕</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-300 text-xs">Aucune</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-2 py-1 text-xs w-full"
                    disabled={saving}
                    value=""
                    onChange={e => handleMap(r.nom, e.target.value)}
                  >
                    <option value="">— Ajouter —</option>
                    {touchesNonAttribuées.map(nom => (
                      <option key={nom} value={nom}>{nom}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
