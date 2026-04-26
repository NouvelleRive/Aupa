'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface PanierItem {
  id: string;
  pfId: string;
  pfNom: string;
  fournisseur: string;
  url?: string;
  prix: number;
  quantite: number;
  ingredientNom: string;
  ingredientId?: string;
  addedAt?: string;
}

const FOURNISSEURS_COULEURS: Record<string, { bg: string; border: string; text: string; btn: string }> = {
  Foodflow: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', btn: 'bg-green-600 hover:bg-green-700' },
  Foodomarket: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', btn: 'bg-teal-600 hover:bg-teal-700' },
  Rungis: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', btn: 'bg-red-600 hover:bg-red-700' },
};

const FOURNISSEURS_ORDRE = ['Foodflow', 'Rungis', 'Foodomarket'];

export default function PanierPage() {
  const [items, setItems] = useState<PanierItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const snap = await getDocs(collection(db, 'panier'));
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() } as PanierItem));
    setItems(arr);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateQte = async (id: string, qte: number) => {
    if (qte <= 0) {
      await deleteDoc(doc(db, 'panier', id));
      setItems(prev => prev.filter(i => i.id !== id));
      return;
    }
    await updateDoc(doc(db, 'panier', id), { quantite: qte });
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantite: qte } : i));
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, 'panier', id));
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const viderFournisseur = async (f: string) => {
    if (!confirm(`Vider le panier ${f} ?`)) return;
    const toDelete = items.filter(i => i.fournisseur === f);
    await Promise.all(toDelete.map(i => deleteDoc(doc(db, 'panier', i.id))));
    setItems(prev => prev.filter(i => i.fournisseur !== f));
  };

  const ouvrirTout = (f: string) => {
    const urls = items.filter(i => i.fournisseur === f && i.url).map(i => i.url!);
    if (urls.length === 0) {
      alert(`Aucune URL produit pour ${f}`);
      return;
    }
    urls.forEach(url => window.open(url, '_blank', 'noopener,noreferrer'));
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Chargement...</div>;

  const groupes = FOURNISSEURS_ORDRE.map(f => ({
    fournisseur: f,
    items: items.filter(i => i.fournisseur === f),
  }));
  const autres = items.filter(i => !FOURNISSEURS_ORDRE.includes(i.fournisseur));
  if (autres.length > 0) {
    const setAutres = new Set(autres.map(i => i.fournisseur));
    setAutres.forEach(f => groupes.push({ fournisseur: f, items: autres.filter(i => i.fournisseur === f) }));
  }

  const totalGlobal = items.reduce((s, i) => s + i.prix * i.quantite, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Panier</h1>
        <div className="bg-white rounded-lg px-3 sm:px-4 py-2 border border-gray-200 text-sm">
          <span className="text-gray-500">Total : </span>
          <span className="font-semibold text-gray-800">{totalGlobal.toFixed(2)} €</span>
          <span className="text-gray-400 ml-2">({items.length} produit{items.length > 1 ? 's' : ''})</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center text-gray-400">
          Panier vide. Ajoute des produits depuis le <a href="/comparatif-fournisseurs" className="text-yellow-500 hover:underline">comparatif fournisseurs</a>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {groupes.filter(g => g.items.length > 0).map(g => {
            const couleur = FOURNISSEURS_COULEURS[g.fournisseur] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', btn: 'bg-gray-600 hover:bg-gray-700' };
            const total = g.items.reduce((s, i) => s + i.prix * i.quantite, 0);
            return (
              <div key={g.fournisseur} className={`${couleur.bg} ${couleur.border} border-2 rounded-xl shadow-sm p-3 sm:p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className={`text-lg font-bold ${couleur.text}`}>{g.fournisseur}</h2>
                  <span className="text-xs text-gray-500">{g.items.length} prod.</span>
                </div>

                <div className="space-y-2 mb-3">
                  {g.items.map(item => (
                    <div key={item.id} className="bg-white rounded-lg p-2 border border-gray-100">
                      <div className="text-xs text-gray-500 truncate">{item.ingredientNom}</div>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block text-sm font-medium text-gray-800 hover:text-yellow-600 hover:underline truncate" title={item.pfNom}>
                          {item.pfNom}
                        </a>
                      ) : (
                        <div className="text-sm font-medium text-gray-800 truncate" title={item.pfNom}>{item.pfNom}</div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateQte(item.id, item.quantite - 1)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 w-7 h-7 rounded font-bold"
                            aria-label="Diminuer"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.quantite}
                            onChange={e => {
                              const v = parseInt(e.target.value);
                              if (!isNaN(v) && v >= 0) updateQte(item.id, v);
                            }}
                            className="w-12 text-center border border-gray-200 rounded px-1 py-1 text-sm"
                          />
                          <button
                            onClick={() => updateQte(item.id, item.quantite + 1)}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 w-7 h-7 rounded font-bold"
                            aria-label="Augmenter"
                          >+</button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-gray-700">{(item.prix * item.quantite).toFixed(2)} €</span>
                          <button
                            onClick={() => remove(item.id)}
                            className="text-gray-300 hover:text-red-500 text-lg leading-none"
                            aria-label="Retirer"
                          >×</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm mb-3 pt-2 border-t border-gray-200">
                  <span className="text-gray-600">Total</span>
                  <span className={`font-bold ${couleur.text}`}>{total.toFixed(2)} €</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => ouvrirTout(g.fournisseur)}
                    className={`flex-1 ${couleur.btn} text-white rounded-lg px-3 py-2 text-sm font-semibold`}
                  >
                    Ouvrir dans {g.fournisseur}
                  </button>
                  <button
                    onClick={() => viderFournisseur(g.fournisseur)}
                    className="bg-white hover:bg-gray-100 text-gray-500 rounded-lg px-3 py-2 text-sm border border-gray-200"
                    aria-label="Vider"
                  >Vider</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
