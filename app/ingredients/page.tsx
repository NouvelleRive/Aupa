'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ingredient, Unite, Categorie } from '@/lib/types';

const UNITES: Unite[] = ['kg', 'g', 'L', 'cL', 'pièce', 'lot'];
const CATEGORIES: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie', 'boisson', 'autre'];

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ nom: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie });
  const [editId, setEditId] = useState<string | null>(null);
  const [pfNames, setPfNames] = useState<Record<string, string[]>>({});
  const [pfPrix, setPfPrix] = useState<Record<string, number>>({});
  const [recetteNames, setRecetteNames] = useState<Record<string, string[]>>({});

  const fetchAll = async () => {
    const [ingSnap, pfSnap, recSnap] = await Promise.all([
      getDocs(collection(db, 'ingredients')),
      getDocs(collection(db, 'produitsFournisseurs')),
      getDocs(collection(db, 'recettes')),
    ]);

    const ings = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient));
    setIngredients(ings);

    // Collecter les noms des produits fournisseurs liés
    const pf: Record<string, string[]> = {};
    for (const d of pfSnap.docs) {
      const data = d.data();
      const nomIngredient = data.ingredient;
      if (nomIngredient) {
        const ing = ings.find(i => i.nom === nomIngredient);
        if (ing) {
          if (!pf[ing.id]) pf[ing.id] = [];
          const nomProduit = data.nom || data.designation || nomIngredient;
          pf[ing.id].push(nomProduit);
        }
      }
    }
    setPfNames(pf);

    // Calculer le prix/kg par ingrédient (PF le plus récent lié par nom)
    const prix: Record<string, number> = {};
    for (const ing of ings) {
      const pfsDocs = pfSnap.docs.filter(d => d.data().ingredient === ing.nom);
      if (pfsDocs.length > 0) {
        const plusRecent = pfsDocs.sort((a, b) => new Date(b.data().updatedAt).getTime() - new Date(a.data().updatedAt).getTime())[0];
        const data = plusRecent.data();
        prix[ing.id] = data.prix / (data.nbKg || 1) / (data.rendement || 1) / (data.nbPieces || 1);
      }
    }
    setPfPrix(prix);

    // Collecter les noms des recettes liées
    const rc: Record<string, string[]> = {};
    for (const d of recSnap.docs) {
      const data = d.data();
      const lignes = data.ingredients || [];
      const nomRecette = data.nom || d.id;
      const seen = new Set<string>();
      for (const l of lignes) {
        const nomIngredient = l.nomIngredient;
        if (nomIngredient && !seen.has(nomIngredient)) {
          const ing = ings.find(i => i.nom === nomIngredient);
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
    const data = { nom: form.nom, unite: form.unite, categorie: form.categorie };
    if (editId) {
      await updateDoc(doc(db, 'ingredients', editId), data);
      setEditId(null);
    } else {
      await addDoc(collection(db, 'ingredients'), data);
    }
    setForm({ nom: '', unite: 'kg', categorie: 'épicerie' });
    setShowForm(false);
    fetchAll();
  };

  const handleEdit = (ing: Ingredient) => {
    setEditId(ing.id);
    setForm({ nom: ing.nom, unite: ing.unite, categorie: ing.categorie });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet ingrédient canonique ?')) return;
    await deleteDoc(doc(db, 'ingredients', id));
    fetchAll();
  };

  const filtered = ingredients
    .filter(i => i.nom.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ingrédients</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ nom: '', unite: 'kg', categorie: 'épicerie' }); }}
          className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm"
        >
          + Ajouter
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Modifier' : 'Nouvel ingrédient'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <input
              className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm col-span-2"
              placeholder="Nom"
              value={form.nom}
              onChange={e => setForm({ ...form, nom: e.target.value })}
            />
            <select
              className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
              value={form.unite}
              onChange={e => setForm({ ...form, unite: e.target.value as Unite })}
            >
              {UNITES.map(u => <option key={u}>{u}</option>)}
            </select>
            <select
              className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
              value={form.categorie}
              onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
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

      <input
        className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4 w-64"
        placeholder="Rechercher..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {loading ? (
        <p className="text-gray-400">Chargement...</p>
      ) : (
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Unité</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix/kg</th>
                <th className="px-4 py-3 text-left">Produits fournisseurs</th>
                <th className="px-4 py-3 text-left">Recettes liées</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{ing.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.unite}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.categorie}</td>
                  <td className="px-4 py-3 text-right">
                    {pfPrix[ing.id] ? (
                      <span className="font-semibold text-yellow-600">{pfPrix[ing.id].toFixed(2)} €</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {pfNames[ing.id]?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {pfNames[ing.id].map((nom, i) => (
                          <span key={i} className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">{nom}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
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
      )}
    </div>
  );
}
