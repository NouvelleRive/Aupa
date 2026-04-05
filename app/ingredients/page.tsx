'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ingredient, Unite, Categorie } from '@/lib/types';

const UNITES: Unite[] = ['kg', 'g', 'L', 'cL', 'pièce', 'lot'];
const CATEGORIES: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie', 'boisson', 'autre'];

const emptyForm = { nom: '', prix: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie, rendement: '100' };

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchIngredients = async () => {
    const snap = await getDocs(collection(db, 'ingredients'));
    setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    setLoading(false);
  };

  useEffect(() => { fetchIngredients(); }, []);

  const handleSubmit = async () => {
    if (!form.nom || !form.prix) return;
    const data = {
      nom: form.nom,
      prix: parseFloat(form.prix),
      unite: form.unite,
      categorie: form.categorie,
      rendement: parseFloat(form.rendement) / 100,
      historiquesPrix: [{ date: new Date().toISOString(), prix: parseFloat(form.prix) }],
      updatedAt: new Date().toISOString(),
    };
    if (editId) {
      await updateDoc(doc(db, 'ingredients', editId), data);
      setEditId(null);
    } else {
      await addDoc(collection(db, 'ingredients'), data);
    }
    setForm(emptyForm);
    fetchIngredients();
  };

  const handleEdit = (ing: Ingredient) => {
    setEditId(ing.id);
    setForm({ nom: ing.nom, prix: String(ing.prix), unite: ing.unite, categorie: ing.categorie, rendement: String(Math.round(ing.rendement * 100)) });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet ingrédient ?')) return;
    await deleteDoc(doc(db, 'ingredients', id));
    fetchIngredients();
  };

  const filtered = ingredients.filter(i => i.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Ingrédients</h1>

      {/* Formulaire */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Modifier' : 'Ajouter un ingrédient'}</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Prix (€)" type="number" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} />
          <select className="border rounded-lg px-3 py-2 text-sm" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value as Unite })}>
            {UNITES.map(u => <option key={u}>{u}</option>)}
          </select>
          <select className="border rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-2 col-span-2 md:col-span-1">
            <input className="border rounded-lg px-3 py-2 text-sm w-full" placeholder="Rendement %" type="number" min="1" max="100" value={form.rendement} onChange={e => setForm({ ...form, rendement: e.target.value })} />
            <span className="text-sm text-gray-400">%</span>
          </div>
          <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm col-span-2 md:col-span-1">
            {editId ? 'Enregistrer' : 'Ajouter'}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm(emptyForm); }} className="border rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>}
        </div>
      </div>

      {/* Recherche */}
      <input className="border rounded-lg px-3 py-2 text-sm mb-4 w-64" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />

      {/* Liste */}
      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix</th>
                <th className="px-4 py-3 text-left">Unité</th>
                <th className="px-4 py-3 text-right">Rendement</th>
                <th className="px-4 py-3 text-right">Prix réel</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{ing.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.categorie}</td>
                  <td className="px-4 py-3 text-right">{ing.prix.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-gray-500">{ing.unite}</td>
                  <td className="px-4 py-3 text-right">{Math.round(ing.rendement * 100)}%</td>
                  <td className="px-4 py-3 text-right font-semibold text-yellow-600">{(ing.prix / ing.rendement).toFixed(2)} €</td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => handleEdit(ing)} className="text-xs text-gray-500 hover:text-yellow-500">Modifier</button>
                    <button onClick={() => handleDelete(ing.id)} className="text-xs text-red-400 hover:text-red-600">Supprimer</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucun ingrédient</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}