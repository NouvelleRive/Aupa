    'use client';

    import { useState, useEffect, useRef } from 'react';
    import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
    import { db } from '@/lib/firebase';
    import { Recette } from '@/lib/types';
    import { MenuDoc, MenuCategorie, MenuRecette } from '@/lib/menuTypes';

    interface VenteLine {
    nom: string;
    quantity: number;
    ttc: number;
    menuNom: string;
    mois: string;
    }

    import { CATEGORIES } from '@/lib/categories';
    import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';
    import { recalculerTousLesCouts } from '@/lib/recalculCouts';

    const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
    const caisse = normalizeCaisse(nomPopina);
    const recette = normalizeCaisse(nomMenu).replace(/\s+(ete|hiver)$/, '');
    const mapped = CAISSE_MAP[caisse];
    if (!mapped) return false;
    return mapped === recette;
    };

    export default function MenusPage() {
    const [menus, setMenus] = useState<MenuDoc[]>([]);
    const [recettes, setRecettes] = useState<Recette[]>([]);
    const [ventes, setVentes] = useState<VenteLine[]>([]);
    const [menuActif, setMenuActif] = useState<string>('');
    const [moisActif, setMoisActif] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [importing, setImporting] = useState(false);
    const [updating, setUpdating] = useState(false);

    const [showCreerMenu, setShowCreerMenu] = useState(false);
    const [nouveauNom, setNouveauNom] = useState('');
    const [nouveauDateDebut, setNouveauDateDebut] = useState('');
    const [nouveauDateFin, setNouveauDateFin] = useState('');
    const [dupliquerDepuis, setDupliquerDepuis] = useState<string>('');

    const [menuEdit, setMenuEdit] = useState<string>('');
    const [catNom, setCatNom] = useState('Croger');
    const [catRecettes, setCatRecettes] = useState<Map<string, string>>(new Map()); // id -> prixVente string
    const [filterCatEdit, setFilterCatEdit] = useState('all');
    const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);
    const [showAddCat, setShowAddCat] = useState(false);
    const [editDates, setEditDates] = useState(false);
    const [editDateDebut, setEditDateDebut] = useState('');
    const [editDateFin, setEditDateFin] = useState('');

    const fileRef = useRef<HTMLInputElement>(null);

    const fetchAll = async () => {
        const [mSnap, rSnap, vSnap] = await Promise.all([
        getDocs(collection(db, 'menus')),
        getDocs(collection(db, 'recettes')),
        getDocs(collection(db, 'ventes')),
        ]);
        const ms = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuDoc));
        const saisonOrdre = (nom: string) => {
          const m = nom.match(/(ETE|HIVER)(\d+)/i);
          if (!m) return nom;
          const annee = parseInt(m[2]);
          const saison = m[1].toUpperCase() === 'ETE' ? 0 : 1;
          return `${annee}-${saison}`;
        };
        ms.sort((a, b) => saisonOrdre(a.nom).localeCompare(saisonOrdre(b.nom)));
        ms.forEach(m => {
            m.categories = (m.categories || []).map((c: any) => {
                if (c.recetteIds && !c.recettes) {
                return { nom: c.nom, recettes: c.recetteIds.map((id: string) => ({ id, prixVente: 0 })) };
                }
                return c;
            });
            });
        setMenus(ms);
        setRecettes(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
        setVentes(vSnap.docs.map(d => d.data() as VenteLine));
        if (ms.length > 0 && !menuActif) setMenuActif(ms[0].id);
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);

    const handleCreerMenu = async () => {
        if (!nouveauNom.trim()) return;
        const nom = nouveauNom.toUpperCase().trim();
        const saison = nom.startsWith('ETE') ? 'été' : 'hiver';
        const annee = parseInt('20' + nom.replace('ETE', '').replace('HIVER', ''));
        const sourceMenu = dupliquerDepuis ? menus.find(m => m.id === dupliquerDepuis) : null;
        const categories = sourceMenu ? sourceMenu.categories.map(c => ({ nom: c.nom, recettes: c.recettes.map(r => ({ ...r })) })) : [];
        const newDoc = await addDoc(collection(db, 'menus'), {
        nom, saison, annee,
        dateDebut: nouveauDateDebut,
        dateFin: nouveauDateFin,
        categories, actif: true,
        createdAt: new Date().toISOString(),
        });
        setShowCreerMenu(false);
        setNouveauNom('');
        setNouveauDateDebut('');
        setNouveauDateFin('');
        setDupliquerDepuis('');
        await fetchAll();
        setMenuActif(newDoc.id);
    };

    const handleSauvegarderCategorie = async () => {
        const menu = menus.find(m => m.id === menuEdit);
        if (!menu) return;
        const recettesArray: MenuRecette[] = [...catRecettes.entries()].map(([id, prix]) => ({
        id, prixVente: parseFloat(prix) || 0
        }));
        const newCat: MenuCategorie = { nom: catNom, recettes: recettesArray };
        let newCats = [...menu.categories];
        if (editingCatIdx !== null) {
        newCats[editingCatIdx] = newCat;
        } else {
        newCats.push(newCat);
        }
        await updateDoc(doc(db, 'menus', menuEdit), { categories: newCats });
        setMenuEdit('');
        setCatRecettes(new Map());
        setEditingCatIdx(null);
        await fetchAll();
    };

    const handleSupprimerCategorie = async (menuId: string, idx: number) => {
        const menu = menus.find(m => m.id === menuId);
        if (!menu) return;
        const newCats = menu.categories.filter((_, i) => i !== idx);
        await updateDoc(doc(db, 'menus', menuId), { categories: newCats });
        await fetchAll();
    };

    const handleImportPopina = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);

        const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
        let mois = '';
        if (dateMatch) mois = `${dateMatch[1]}-${dateMatch[2]}`;

        const menuTrouve = menus.find(m => {
        if (!m.dateDebut || !m.dateFin || !mois) return false;
        const d = mois + '-01';
        return d >= m.dateDebut && d <= m.dateFin;
        });

        if (!menuTrouve) {
        alert(`❌ Aucun menu ne correspond au mois ${mois}. Crée d'abord le menu avec les bonnes dates.`);
        setImporting(false);
        e.target.value = '';
        return;
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
        const ttc = row['total ttc'] || row['TTC'] || 0;
        if (!nom || quantity <= 0) continue;
        await addDoc(collection(db, 'ventes'), { nom, quantity, ttc, menuNom: menuTrouve.nom, mois });
        count++;
        }

        setImporting(false);
        alert(`✅ ${count} lignes importées → ${menuTrouve.nom} / ${mois}`);
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

    const tousLesIds = menuCourant?.categories.flatMap(c => (c.recettes || []).map(r => r.id)) || [];
    const toutesRecettesCarte = recettes.filter(r => tousLesIds.includes(r.id));

    const ventesMenuActuel = ventes.filter(v => v.menuNom === menuCourant?.nom && (moisActif === 'all' || v.mois === moisActif));
    const caReel = ventesMenuActuel.reduce((s, v) => s + v.ttc, 0);
    const totalVendus = ventesMenuActuel.reduce((s, v) => s + v.quantity, 0);

    const allMenuRecettes = menuCourant?.categories.flatMap(c => c.recettes || []) || [];
    const recettesAvecCout = allMenuRecettes.filter(mr => {
        if (mr.prixVente <= 0) return false;
        const r = recettes.find(x => x.id === mr.id);
        return r && r.coutCalcule > 0;
    });
    const foodCostMoyen = recettesAvecCout.length > 0
        ? recettesAvecCout.reduce((s, mr) => {
            const r = recettes.find(x => x.id === mr.id)!;
            return s + (r.coutCalcule / (mr.prixVente / 1.1)) * 100;
        }, 0) / recettesAvecCout.length
        : 0;

    const recettesFiltrees = recettes.filter(r => filterCatEdit === 'all' || r.categorie === filterCatEdit);

    if (loading) return <p className="text-gray-400 p-6">Chargement...</p>;

    return (
        <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Menus</h1>
            <div className="flex gap-3">
            <button disabled={updating} onClick={async () => { setUpdating(true); await recalculerTousLesCouts(); await fetchAll(); setUpdating(false); }}
                className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                {updating ? 'Mise à jour...' : 'Mettre à jour'}
            </button>
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

        {showCreerMenu && (
            <div className="bg-white rounded-xl border border-yellow-100 p-4 mb-6 flex gap-3 items-center flex-wrap">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-32"
                placeholder="Ex: HIVER24" value={nouveauNom}
                onChange={e => setNouveauNom(e.target.value.toUpperCase())} />
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-36"
                placeholder="Début (2024-11-01)" value={nouveauDateDebut}
                onChange={e => setNouveauDateDebut(e.target.value)} />
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-36"
                placeholder="Fin (2025-04-30)" value={nouveauDateFin}
                onChange={e => setNouveauDateFin(e.target.value)} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                value={dupliquerDepuis} onChange={e => setDupliquerDepuis(e.target.value)}>
                <option value="">Dupliquer à partir de</option>
                {menus.map(m => <option key={m.id} value={m.id}>Dupliquer {m.nom}</option>)}
            </select>
            <button onClick={handleCreerMenu} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Créer</button>
            <button onClick={() => setShowCreerMenu(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
        )}

        <div className="flex gap-2 mb-6 flex-wrap">
            {menus.map(m => (
            <button key={m.id} onClick={() => { setMenuActif(m.id); setMoisActif('all'); setMenuEdit(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${menuActif === m.id ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-gray-200 text-gray-600 hover:border-yellow-300'}`}>
                <div>{m.nom}</div>
                {m.dateDebut && <div className="text-xs font-normal opacity-60">{m.dateDebut} → {m.dateFin}</div>}
            </button>
            ))}
        </div>

        {!menuCourant ? (
            <p className="text-gray-400 text-center py-12">Crée un menu pour commencer.</p>
        ) : (
            <>
            <div className="flex items-center gap-3 mb-4">
              {editDates ? (
                <>
                  <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-1 text-sm w-36" type="date" value={editDateDebut} onChange={e => setEditDateDebut(e.target.value)} />
                  <span className="text-gray-400 text-sm">→</span>
                  <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-1 text-sm w-36" type="date" value={editDateFin} onChange={e => setEditDateFin(e.target.value)} />
                  <button onClick={async () => {
                    await updateDoc(doc(db, 'menus', menuCourant.id), { dateDebut: editDateDebut, dateFin: editDateFin });
                    setEditDates(false);
                    await fetchAll();
                  }} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-3 py-1 text-sm">OK</button>
                  <button onClick={() => setEditDates(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
                </>
              ) : (
                <button onClick={() => { setEditDates(true); setEditDateDebut(menuCourant.dateDebut || ''); setEditDateFin(menuCourant.dateFin || ''); }}
                  className="text-xs text-gray-400 hover:text-yellow-500 border border-gray-200 rounded-lg px-3 py-1">
                  {menuCourant.dateDebut ? `${menuCourant.dateDebut} → ${menuCourant.dateFin}` : 'Ajouter dates de validité'}
                </button>
              )}
            </div>
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

            <div className="space-y-4 mb-6">
                {menuCourant.categories.map((cat, idx) => {
                const isEditing = menuEdit === menuCourant.id && editingCatIdx === idx;
                const platsCategorie = (cat.recettes || []).map(mr => {
                    const r = recettes.find(x => x.id === mr.id);
                    return r ? { ...r, prixVente: mr.prixVente } : null;
                }).filter(Boolean) as (Recette & { prixVente: number })[];

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
                        {!isEditing && <button onClick={() => {
                            setMenuEdit(menuCourant.id);
                            setCatNom(cat.nom);
                            const m = new Map<string, string>();
                            cat.recettes.forEach(r => m.set(r.id, String(r.prixVente)));
                            setCatRecettes(m);
                            setEditingCatIdx(idx);
                            setFilterCatEdit('all');
                        }} className="text-xs text-gray-400 hover:text-yellow-500">Modifier</button>}
                        {!isEditing && <button onClick={() => handleSupprimerCategorie(menuCourant.id, idx)} className="text-xs text-gray-400 hover:text-yellow-500">Supprimer</button>}
                        </div>
                    </div>
                    {isEditing ? (
                        <div className="p-4">
                        <div className="flex gap-3 mb-4 flex-wrap items-center">
                            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                            value={catNom} onChange={e => setCatNom(e.target.value)}>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                            value={filterCatEdit} onChange={e => setFilterCatEdit(e.target.value)}>
                            <option value="all">Toutes catégories</option>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <span className="text-sm text-gray-400">{catRecettes.size} sélectionnées</span>
                            <button onClick={handleSauvegarderCategorie} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Enregistrer</button>
                            <button onClick={() => { setMenuEdit(''); setCatRecettes(new Map()); setEditingCatIdx(null); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>
                        </div>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {recettesFiltrees.map(r => (
                            <div key={r.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${catRecettes.has(r.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 hover:border-yellow-200'}`}>
                                <input type="checkbox" checked={catRecettes.has(r.id)} onChange={e => {
                                const m = new Map(catRecettes);
                                if (e.target.checked) { m.set(r.id, ''); } else { m.delete(r.id); }
                                setCatRecettes(m);
                                }} className="accent-yellow-400" />
                                <div className="flex-1">
                                <p className="text-sm font-medium">{r.nom}</p>
                                <p className="text-xs text-gray-400">{r.categorie}</p>
                                </div>
                                {catRecettes.has(r.id) && (
                                <input type="number" placeholder="Prix €"
                                    className="border border-yellow-200 rounded-lg px-2 py-1 text-sm w-24 focus:border-yellow-400 focus:outline-none"
                                    value={catRecettes.get(r.id) || ''}
                                    onChange={e => { const m = new Map(catRecettes); m.set(r.id, e.target.value); setCatRecettes(m); }}
                                />
                                )}
                            </div>
                            ))}
                        </div>
                        </div>
                    ) : (
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
                    )}
                    </div>
                );
                })}
            </div>

            {showAddCat ? (
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                    <div className="flex gap-3 mb-4 flex-wrap items-center">
                        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                            value={catNom} onChange={e => setCatNom(e.target.value)}>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                            value={filterCatEdit} onChange={e => setFilterCatEdit(e.target.value)}>
                            <option value="all">Toutes catégories</option>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <span className="text-sm text-gray-400">{catRecettes.size} sélectionnées</span>
                        <button onClick={async () => { await handleSauvegarderCategorie(); setShowAddCat(false); }} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Enregistrer</button>
                        <button onClick={() => { setShowAddCat(false); setCatRecettes(new Map()); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {recettesFiltrees.map(r => (
                            <div key={r.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${catRecettes.has(r.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 hover:border-yellow-200'}`}>
                                <input type="checkbox" checked={catRecettes.has(r.id)} onChange={e => {
                                    const m = new Map(catRecettes);
                                    if (e.target.checked) { m.set(r.id, ''); } else { m.delete(r.id); }
                                    setCatRecettes(m);
                                }} className="accent-yellow-400" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium">{r.nom}</p>
                                    <p className="text-xs text-gray-400">{r.categorie}</p>
                                </div>
                                {catRecettes.has(r.id) && (
                                    <input type="number" placeholder="Prix €"
                                        className="border border-yellow-200 rounded-lg px-2 py-1 text-sm w-24 focus:border-yellow-400 focus:outline-none"
                                        value={catRecettes.get(r.id) || ''}
                                        onChange={e => { const m = new Map(catRecettes); m.set(r.id, e.target.value); setCatRecettes(m); }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <button onClick={() => { setShowAddCat(true); setMenuEdit(menuCourant.id); setCatNom('Croger'); setCatRecettes(new Map()); setEditingCatIdx(null); setFilterCatEdit('all'); }}
                    className="w-full border-2 border-dashed border-yellow-200 rounded-xl py-4 text-yellow-400 hover:border-yellow-400 font-semibold text-sm transition-colors">
                    + Ajouter une catégorie
                </button>
            )}
            </>
        )}
        </div>
    );
    }