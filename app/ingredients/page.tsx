'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Ingredient, Unite, Categorie } from '@/lib/types';

const UNITES: Unite[] = ['kg', 'g', 'L', 'cL', 'pièce', 'lot'];
const CATEGORIES: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie', 'boisson', 'autre'];
const emptyForm = { nom: '', prix: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie, rendement: '100' };

const detectUnite = (nom: string): Unite => {
  const n = nom.toLowerCase();
  if (n.includes('1kg') || n.includes('2kg') || n.includes('5kg') || n.includes('/kg') || n.match(/\d+kg/)) return 'kg';
  if (n.includes('500g') || n.includes('150g') || n.includes('125g') || n.match(/\d+g[^r]/)) return 'g';
  if (n.includes('1l') || n.includes('5l') || n.includes('1.5l') || n.match(/\d+l$/)) return 'L';
  if (n.includes('cl')) return 'cL';
  if (n.includes('botte') || n.includes('pièce') || n.includes('x90') || n.includes('x50') || n.includes('x6') || n.includes('x8')) return 'pièce';
  if (n.includes('lot')) return 'lot';
  return 'pièce';
};

const detectCategorie = (nom: string): Categorie => {
  const n = nom.toLowerCase();
  if (n.includes('poulet') || n.includes('porc') || n.includes('steak') || n.includes('jambon') || n.includes('veau') || n.includes('boeuf')) return 'viande';
  if (n.includes('saumon') || n.includes('thon') || n.includes('cabillaud')) return 'poisson';
  if (n.includes('lait') || n.includes('feta') || n.includes('cheddar') || n.includes('emmental') || n.includes('tomme') || n.includes('fromage') || n.includes('oeuf')) return 'laitage';
  if (n.includes('tomate') || n.includes('salade') || n.includes('carotte') || n.includes('poivron') || n.includes('champignon') || n.includes('avocat') || n.includes('menthe') || n.includes('ciboulette') || n.includes('persil') || n.includes('coriandre') || n.includes('romarin') || n.includes('patate') || n.includes('butternut') || n.includes('panais') || n.includes('pdt') || n.includes('pousse')) return 'légume';
  if (n.includes('citron') || n.includes('orange') || n.includes('banane')) return 'fruit';
  if (n.includes('huile') || n.includes('ketchup') || n.includes('vinaigre') || n.includes('riz') || n.includes('ail') || n.includes('amande') || n.includes('cacahuète') || n.includes('concentré') || n.includes('polpa') || n.includes('jus de veau')) return 'épicerie';
  if (n.includes('bière') || n.includes('vin') || n.includes('jus')) return 'boisson';
  return 'épicerie';
};

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [histoId, setHistoId] = useState<string | null>(null);

  const fetchIngredients = async () => {
    const snap = await getDocs(collection(db, 'ingredients'));
    setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Ingredient)));
    setLoading(false);
  };

  useEffect(() => { fetchIngredients(); }, []);

  const parsePDF = async (file: File, pdfjsLib: any): Promise<{ code: string; nom: string; prix: number; date: string }[]> => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const lignes: { code: string; nom: string; prix: number; date: string }[] = [];

    // Extraire la date depuis le nom du fichier ou la première page
    const page1 = await pdf.getPage(1);
    const content1 = await page1.getTextContent();
    const items1 = content1.items.map((item: any) => item.str.trim()).filter(Boolean);
    let dateFacture = new Date().toISOString();
    for (const item of items1) {
      const m = item.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) {
        dateFacture = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString();
        break;
      }
    }

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.map((item: any) => item.str.trim()).filter(Boolean);
      for (let j = 0; j < items.length; j++) {
        const match = items[j].match(/^(FF-\d+)\s+(.+)$/);
        if (match) {
          const prixStr = items[j + 2] || '';
          const prixMatch = prixStr.replace(',', '.').match(/^(\d+\.\d+)/);
          if (prixMatch) {
            const prix = parseFloat(prixMatch[1]);
            if (prix > 0) lignes.push({ code: match[1], nom: match[2], prix, date: dateFacture });
          }
        }
      }
    }
    return lignes;
  };

  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setImporting(true);

    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

    // Trier par date de modification (la plus ancienne en premier)
    files.sort((a, b) => a.lastModified - b.lastModified);

    // Parser tous les PDFs
    const toutesLignes: { code: string; nom: string; prix: number; date: string }[] = [];
    for (let f = 0; f < files.length; f++) {
      setImportProgress(`Lecture facture ${f + 1}/${files.length}...`);
      const lignes = await parsePDF(files[f], pdfjsLib);
      toutesLignes.push(...lignes);
    }

    // Trier par date pour que le prix le plus récent écrase le précédent
    toutesLignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setImportProgress('Mise à jour Firestore...');
    const existingSnap = await getDocs(collection(db, 'ingredients'));
    const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    let created = 0;
    let updated = 0;

    // Grouper par code pour construire l'historique complet
    const parCode = new Map<string, { code: string; nom: string; prix: number; date: string }[]>();
    for (const ligne of toutesLignes) {
      if (!parCode.has(ligne.code)) parCode.set(ligne.code, []);
      parCode.get(ligne.code)!.push(ligne);
    }

    for (const [code, lignes] of parCode.entries()) {
      const derniere = lignes[lignes.length - 1];
      const match = existing.find((ing: any) => ing.foodflowCode === code);
      if (match) {
        const historiqueExistant = match.historiquesPrix || [];
        const datesExistantes = new Set(historiqueExistant.map((h: any) => h.date));
        const nouveauxHistorique = lignes
          .map(l => ({ date: l.date, prix: l.prix }))
          .filter(h => !datesExistantes.has(h.date));
        if (nouveauxHistorique.length > 0) {
          await updateDoc(doc(db, 'ingredients', match.id), {
            prix: derniere.prix,
            historiquesPrix: [...historiqueExistant, ...nouveauxHistorique],
            updatedAt: nouveauxHistorique[nouveauxHistorique.length - 1].date,
          });
        }
        updated++;
      } else {
        await addDoc(collection(db, 'ingredients'), {
          nom: derniere.nom,
          prix: derniere.prix,
          unite: detectUnite(derniere.nom),
          categorie: detectCategorie(derniere.nom),
          rendement: 1,
          foodflowCode: code,
          historiquesPrix: lignes.map(l => ({ date: l.date, prix: l.prix })),
          updatedAt: derniere.date,
        });
        created++;
      }
    }

    setImporting(false);
    setImportProgress('');
    alert(`✅ ${created} ingrédients créés, ${updated} mis à jour !`);
    fetchIngredients();
    e.target.value = '';
  };

  const handleImportXL = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ingredientsMap = new Map<string, { prix: number; unite: string }>();
    wb.SheetNames.forEach(sheetName => {
      const ws = wb.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      rows.forEach(row => {
        const nom = row[0]; const prix = row[1]; const unite = row[2];
        if (typeof nom === 'string' && nom.trim().length > 1 && typeof prix === 'number' && prix > 0 && typeof unite === 'string' && ['kg', 'g', 'L', 'cL', 'pièce', 'lot', 'l', 'p', 'unité'].includes(unite.trim())) {
          const nomClean = nom.trim();
          if (!ingredientsMap.has(nomClean)) {
            const uniteNorm = unite.trim() === 'l' ? 'L' : unite.trim() === 'p' ? 'pièce' : unite.trim() === 'unité' ? 'pièce' : unite.trim() as Unite;
            ingredientsMap.set(nomClean, { prix, unite: uniteNorm });
          }
        }
      });
    });
    let count = 0;
    for (const [nom, { prix, unite }] of ingredientsMap.entries()) {
      await addDoc(collection(db, 'ingredients'), { nom, prix, unite, categorie: 'épicerie', rendement: 1, historiquesPrix: [{ date: new Date().toISOString(), prix }], updatedAt: new Date().toISOString() });
      count++;
    }
    alert(`${count} ingrédients importés !`);
    fetchIngredients();
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!form.nom || !form.prix) return;
    const data = { nom: form.nom, prix: parseFloat(form.prix), unite: form.unite, categorie: form.categorie, rendement: parseFloat(form.rendement) / 100, historiquesPrix: [{ date: new Date().toISOString(), prix: parseFloat(form.prix) }], updatedAt: new Date().toISOString() };
    if (editId) { await updateDoc(doc(db, 'ingredients', editId), data); setEditId(null); }
    else { await addDoc(collection(db, 'ingredients'), data); }
    setForm(emptyForm); setShowForm(false); fetchIngredients();
  };

  const handleEdit = (ing: Ingredient) => {
    setEditId(ing.id);
    setForm({ nom: ing.nom, prix: String(ing.prix), unite: ing.unite, categorie: ing.categorie, rendement: String(Math.round(ing.rendement * 100)) });
    setShowForm(true);
  };

  const [filterCategorie, setFilterCategorie] = useState<string>('all');

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cet ingrédient ?')) return;
    await deleteDoc(doc(db, 'ingredients', id));
    fetchIngredients();
  };

  const filtered = ingredients
  .filter(i => i.nom.toLowerCase().includes(search.toLowerCase()))
  .filter(i => filterCategorie === 'all' || i.categorie === filterCategorie)
  .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Ingrédients</h1>
        <div className="flex gap-3">
          <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyForm); }} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            + Ajouter manuellement
          </button>
          <button onClick={() => pdfRef.current?.click()} disabled={importing} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {importing ? importProgress || 'Import en cours...' : 'Importer factures Foodflow'}
          </button>
          <button onClick={() => fileRef.current?.click()} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
            Importer Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportXL} />
          <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportPDF} />
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">{editId ? 'Modifier' : 'Nouvel ingrédient'}</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Prix (€)" type="number" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value as Unite })}>
              {UNITES.map(u => <option key={u}>{u}</option>)}
            </select>
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-full" placeholder="Rendement" type="number" min="1" max="100" value={form.rendement} onChange={e => setForm({ ...form, rendement: e.target.value })} />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">{editId ? 'Enregistrer' : 'Ajouter'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">Annuler</button>
          </div>
        </div>
      )}

      <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4 w-64" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />

      <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4" value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
        <option value="all">Toutes catégories</option>
        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>

      {loading ? <p className="text-gray-400">Chargement...</p> : (
        <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix achat</th>
                <th className="px-4 py-3 text-left">Unité</th>
                <th className="px-4 py-3 text-right">Rendement</th>
                <th className="px-4 py-3 text-right">Prix réel</th>
                <th className="px-4 py-3 text-left">Dernière MAJ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-yellow-50">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-yellow-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{ing.nom}</td>
                  <td className="px-4 py-3 text-gray-500">{ing.categorie}</td>
                  <td className="px-4 py-3 text-right">{ing.prix.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-gray-500">{ing.unite}</td>
                  <td className="px-4 py-3 text-right">{Math.round(ing.rendement * 100)}%</td>
                  <td className="px-4 py-3 text-right font-semibold text-yellow-600">{(ing.prix / ing.rendement).toFixed(2)} €</td>
                  <td className="px-4 py-3 text-sm">
                    {(() => {
                      const date = new Date(ing.updatedAt);
                      const jours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                      const label = date.toLocaleDateString('fr-FR');
                      return <span className={jours > 30 ? 'text-red-500 font-semibold' : 'text-gray-400'}>{label}{jours > 30 ? ' ⚠️' : ''}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const hist = (ing.historiquesPrix || []).slice().sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                      const last = hist[hist.length - 1];
                      const prev = hist[hist.length - 2];
                      const trend = prev && last ? (last.prix > prev.prix ? '↑' : last.prix < prev.prix ? '↓' : '→') : null;
                      const trendColor = trend === '↑' ? 'text-red-500' : trend === '↓' ? 'text-green-500' : 'text-gray-400';
                      return trend ? (
                        <button onClick={() => setHistoId(histoId === ing.id ? null : ing.id)}
                          className={`font-bold text-sm ${trendColor} hover:opacity-70 mr-2`} title="Voir historique">
                          {trend}
                        </button>
                      ) : <span className="mr-6"></span>;
                    })()}
                    <button onClick={() => handleEdit(ing)} className="text-gray-400 hover:text-yellow-500" title="Modifier">✏️</button><button onClick={() => handleDelete(ing.id)} className="text-gray-400 hover:text-red-500" title="Supprimer">🗑️</button>
                  </td>
                </tr>
              ))}
              {histoId && filtered.find(i => i.id === histoId) && (
                <tr key={histoId + '-histo'}>
                  <td colSpan={8} className="px-4 py-3 bg-yellow-50">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">Historique des prix — {filtered.find(i => i.id === histoId)?.nom}</p>
                    <div className="flex gap-4 flex-wrap">
                      {(filtered.find(i => i.id === histoId)?.historiquesPrix || []).slice().sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((h: any, i: number) => (
                        <div key={i} className="text-xs text-gray-600">
                          <span className="text-gray-400">{new Date(h.date).toLocaleDateString('fr-FR')}</span> → <span className="font-semibold">{h.prix.toFixed(2)} €</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucun ingrédient</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}