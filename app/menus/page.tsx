    'use client';

    import { useState, useEffect, useRef } from 'react';
    import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
    import { db } from '@/lib/firebase';
    import { cachedGetDocs, invalidateCache } from '@/lib/firestoreCache';
    import { Recette } from '@/lib/types';
    import { MenuDoc, MenuCategorie, MenuRecette } from '@/lib/menuTypes';

    interface VenteLine {
    nom: string;
    quantity: number;
    ttc: number;
    menuNom: string;
    mois: string;
    jour?: string; // YYYY-MM-DD, présent pour les ventes importées par jour
    }

    // Numéro ISO de semaine — retourne YYYY-Www
    function isoWeek(dateStr: string): string {
      const d = new Date(dateStr + 'T00:00:00Z');
      const day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }

    import { CATEGORIES } from '@/lib/categories';
    import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';
    import { recalculerTousLesCouts } from '@/lib/recalculCouts';

    const similarity = (a: string, b: string): number => {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const matrix: number[][] = [];
    for (let i = 0; i <= a.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= b.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
        matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        }
    }
    return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length);
    };

    const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
    const caisse = normalizeCaisse(nomPopina);
    const recette = normalizeCaisse(nomMenu).replace(/\s+(ete|hiver)$/, '');
    const mapped = CAISSE_MAP[caisse];
    if (mapped) return mapped === recette;
    // Fuzzy fallback
    return similarity(caisse, recette) >= 0.75;
    };

    export default function MenusPage() {
    const [menus, setMenus] = useState<MenuDoc[]>([]);
    const [recettes, setRecettes] = useState<Recette[]>([]);
    const [ventes, setVentes] = useState<VenteLine[]>([]);
    const [menuActif, setMenuActif] = useState<string>('');
    const [moisActif, setMoisActif] = useState<string>('all');
    const [granularite, setGranularite] = useState<'mois' | 'semaine' | 'jour'>('mois');
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
    const [searchRecette, setSearchRecette] = useState('');
    const [editDates, setEditDates] = useState(false);
    const [editDateDebut, setEditDateDebut] = useState('');
    const [editDateFin, setEditDateFin] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [importMenu, setImportMenu] = useState('');
    const [importMois, setImportMois] = useState('');
    const [showImportRecap, setShowImportRecap] = useState(false);
    const [recapText, setRecapText] = useState('');
    const [recapMenu, setRecapMenu] = useState('');

    const fileRef = useRef<HTMLInputElement>(null);

    // Petites collections : menus + recettes + caisseMapCustom (load une seule fois)
    const fetchAll = async () => {
        const [mSnap, rSnap, cmSnap] = await Promise.all([
        cachedGetDocs('menus'),
        cachedGetDocs('recettes'),
        cachedGetDocs('caisseMapCustom'),
        ]);
        for (const d of cmSnap.docs) {
            const data = d.data();
            if (data.caisse && data.recette) CAISSE_MAP[data.caisse] = data.recette;
        }
        const ms = mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuDoc));
        const saisonOrdre = (nom: string) => {
          const m = nom.match(/(ETE|HIVER)(\d+)/i);
          if (!m) return nom;
          const annee = parseInt(m[2]);
          const saison = m[1].toUpperCase() === 'ETE' ? 0 : 1;
          return `${annee}-${saison}`;
        };
        ms.sort((a, b) => saisonOrdre(b.nom).localeCompare(saisonOrdre(a.nom)));
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
        if (ms.length > 0 && !menuActif) setMenuActif(ms[0].id);
        setLoading(false);
    };

    useEffect(() => { fetchAll(); }, []);

    // Ventes : refetch quand on change de menu actif
    // (au lieu de charger 85k ventes au mount, on charge ~1-5k pour le menu courant)
    const fetchVentesMenu = async (menuNom: string) => {
        if (!menuNom) { setVentes([]); return; }
        const snap = await getDocs(query(collection(db, 'ventes'), where('menuNom', '==', menuNom)));
        setVentes(snap.docs.map(d => d.data() as VenteLine));
    };

    useEffect(() => {
        const m = menus.find(x => x.id === menuActif);
        if (m?.nom) fetchVentesMenu(m.nom);
    }, [menuActif, menus]);

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
        invalidateCache('menus');
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
        invalidateCache('menus');
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
        invalidateCache('menus');
        await fetchAll();
    };

    const handleImportPopina = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const menuTrouve = menus.find(m => m.id === importMenu);
        if (!menuTrouve || !importMois) {
        alert('❌ Sélectionne un menu et un mois avant d\'importer.');
        e.target.value = '';
        return;
        }

        setImporting(true);
        const mois = importMois;

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
        if (!nom || quantity <= 0 || nom.toLowerCase().trim() === 'total') continue;
        await addDoc(collection(db, 'ventes'), { nom, quantity, ttc, menuNom: menuTrouve.nom, mois });
        count++;
        }

        setImporting(false);
        alert(`✅ ${count} lignes importées → ${menuTrouve.nom} / ${mois}`);
        const m = menus.find(x => x.id === menuActif);
        if (m?.nom) await fetchVentesMenu(m.nom);
        e.target.value = '';
        setShowImport(false);
    };

    // Catégories Popina à ignorer (ce sont des totaux, pas des items)
    const CATEGORIES_POPINA = new Set([
        'plats', 'bol', 'croger', 'salade', 'boissons froides', 'aperitifs digestifs',
        'biere', 'cocktail', 'maison iced', 'soft eau', 'vin', 'entrees',
        'sides et tapas', 'grignotte', 'side', 'desserts', 'tous', 'boissons chaudes',
        'classic hot drinks', 'crazy hot drinks', 'none', 'supplements', 'au restau',
        'parent category menu png', 'dont menus', 'brunch',
        'aupa croissant burger eat', 'formule midi', 'gouter',
    ]);

    const parseRecapPopina = (text: string): { articles: { nom: string; quantity: number; ttc: number }[]; date: string } => {
        const articles: { nom: string; quantity: number; ttc: number }[] = [];
        // Extraire la date depuis le titre "Rapport de fin de caisse : 12 Avril 2026"
        let dateStr = new Date().toISOString().slice(0, 10);
        const mois = { janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12' };
        const titreMatch = text.match(/Rapport de fin de caisse\s*:\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i);
        if (titreMatch) {
            const jour = titreMatch[1].padStart(2, '0');
            const moisKey = titreMatch[2].toLowerCase() as keyof typeof mois;
            const annee = titreMatch[3];
            if (mois[moisKey]) dateStr = `${annee}-${mois[moisKey]}-${jour}`;
        } else {
            // Fallback: chercher "12/04/2026"
            const dmy = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (dmy) dateStr = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
        }

        // Normaliser : enlever les emojis pour la détection de catégorie, mais garder le nom original
        const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

        // Parser ligne par ligne, s'arrêter à "Total des ventes"
        const lines = text.split('\n');
        for (const line of lines) {
            if (/Total des ventes/i.test(line)) break;
            // Format tab-separated ou multi-espaces : "nom\tqty\tprice €"
            const match = line.match(/^(.+?)\s*\t\s*(\d+)\s*\t\s*([\d,]+)\s*€/);
            if (!match) continue;
            const nom = match[1].trim();
            const quantity = parseInt(match[2]);
            const ttc = parseFloat(match[3].replace(',', '.'));
            if (!nom || quantity <= 0 || ttc <= 0) continue;
            // Skip catégories
            const nomNorm = normalize(nom);
            if (CATEGORIES_POPINA.has(nomNorm)) continue;
            // Skip si le nom contient "planche" + ne match pas un item spécifique (ex: "Sides et Tapas")
            articles.push({ nom, quantity, ttc });
        }
        return { articles, date: dateStr };
    };

    const handleImportRecap = async () => {
        if (!recapText.trim() || !recapMenu) {
            alert('❌ Sélectionne un menu et colle le contenu du mail.');
            return;
        }
        const menuTrouve = menus.find(m => m.id === recapMenu);
        if (!menuTrouve) return;

        setImporting(true);
        const { articles, date } = parseRecapPopina(recapText);
        if (articles.length === 0) {
            alert('❌ Aucun article détecté. Vérifie le format du texte collé.');
            setImporting(false);
            return;
        }

        // Supprimer les ventes existantes pour cette date précise
        const existingSnap = await getDocs(query(collection(db, 'ventes'), where('jour', '==', date)));
        for (const d of existingSnap.docs) await deleteDoc(d.ref);

        const mois = date.slice(0, 7);
        for (const a of articles) {
            await addDoc(collection(db, 'ventes'), {
                nom: a.nom, quantity: a.quantity, ttc: a.ttc,
                menuNom: menuTrouve.nom, mois, jour: date,
            });
        }

        setImporting(false);
        alert(`✅ ${articles.length} articles importés pour le ${date} → ${menuTrouve.nom}`);
        const m = menus.find(x => x.id === menuActif);
        if (m?.nom) await fetchVentesMenu(m.nom);
        setRecapText('');
        setShowImportRecap(false);
    };

    const menuCourant = menus.find(m => m.id === menuActif);
    const ventesDuMenu = ventes.filter(v => v.menuNom === menuCourant?.nom);

    // Buckets selon la granularité choisie
    const bucketKey = (v: VenteLine): string => {
      if (granularite === 'jour') return v.jour || v.mois;
      if (granularite === 'semaine') return v.jour ? isoWeek(v.jour) : v.mois;
      return v.mois;
    };
    const moisDisponibles = [...new Set(ventesDuMenu.map(bucketKey))].sort();
    const ventesMenuActuel = ventesDuMenu.filter(v => moisActif === 'all' || bucketKey(v) === moisActif);

    // Attribuer chaque vente à un seul plat (le meilleur match)
    const allPlatsMenu = menuCourant?.categories.flatMap(c => (c.recettes || []).map(mr => {
        const r = recettes.find(x => x.id === mr.id);
        return r?.nom || '';
    })).filter(Boolean) || [];

    const ventesAttribuees = new Map<string, VenteLine[]>();
    for (const nom of allPlatsMenu) ventesAttribuees.set(nom, []);

    for (const v of ventesMenuActuel) {
        const caisse = normalizeCaisse(v.nom);
        const mapped = CAISSE_MAP[caisse];
        let bestNom = '';
        let bestScore = 0;
        for (const nom of allPlatsMenu) {
            const recette = normalizeCaisse(nom).replace(/\s+(ete|hiver)$/, '');
            if (mapped && mapped === recette) { bestNom = nom; bestScore = 2; break; }
            const s = similarity(caisse, recette);
            if (s > bestScore && s >= 0.75) { bestScore = s; bestNom = nom; }
        }
        if (bestNom) ventesAttribuees.get(bestNom)!.push(v);
    }

    const getVentesPourPlat = (nomPlat: string) => {
        return ventesAttribuees.get(nomPlat) || [];
    };
    const caReel = ventesMenuActuel.reduce((s, v) => s + v.ttc, 0);
    const totalVendus = ventesMenuActuel.reduce((s, v) => s + v.quantity, 0);

    const allMenuRecettes = menuCourant?.categories.flatMap(c => c.recettes || []) || [];
    const platsFood = allMenuRecettes.filter(mr => { const r = recettes.find(x => x.id === mr.id); return r && (!r.type || r.type === 'food'); });
    const platsDrink = allMenuRecettes.filter(mr => { const r = recettes.find(x => x.id === mr.id); return r && r.type === 'boisson'; });

    const calcCostMoyen = (list: typeof allMenuRecettes) => {
        const avecCout = list.filter(mr => { const r = recettes.find(x => x.id === mr.id); return r && r.coutCalcule > 0 && mr.prixVente > 0; });
        if (avecCout.length === 0) return 0;
        return avecCout.reduce((s, mr) => { const r = recettes.find(x => x.id === mr.id)!; return s + (r.coutCalcule / (mr.prixVente / 1.1)) * 100; }, 0) / avecCout.length;
    };
    const foodCostMoyen = calcCostMoyen(platsFood);
    const drinkCostMoyen = calcCostMoyen(platsDrink);

    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const recettesFiltrees = recettes
        .filter(r => filterCatEdit === 'all' || r.categorie === filterCatEdit)
        .filter(r => !searchRecette || normalize(r.nom).includes(normalize(searchRecette)))
        .sort((a, b) => {
            const aChecked = catRecettes.has(a.id) ? 0 : 1;
            const bChecked = catRecettes.has(b.id) ? 0 : 1;
            return aChecked - bChecked || a.nom.localeCompare(b.nom);
        });

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
            <button onClick={async () => {
                const r = await fetch('/api/gmail/sync');
                const data = await r.json();
                if (data.ok) {
                    alert(`✅ ${data.imported} mails traités, ${data.totalArticles} articles importés`);
                    const m = menus.find(x => x.id === menuActif);
                    if (m?.nom) await fetchVentesMenu(m.nom);
                } else {
                    alert(`❌ ${data.error}`);
                    if (data.error?.includes('not connected')) window.location.href = '/api/gmail/auth';
                }
            }} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
                Synchroniser mails
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportPopina} />
            </div>
        </div>

        {showImportRecap && (
            <div className="bg-white rounded-xl border border-yellow-100 p-4 mb-6">
            <div className="flex gap-3 items-center mb-3">
                <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                    value={recapMenu} onChange={e => setRecapMenu(e.target.value)}>
                    <option value="">Menu...</option>
                    {menus.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
                <button onClick={handleImportRecap} disabled={importing || !recapText.trim() || !recapMenu}
                    className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm">
                    {importing ? 'Import...' : 'Importer'}
                </button>
                <button onClick={() => { setShowImportRecap(false); setRecapText(''); }} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
            </div>
            <textarea className="w-full border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-xs font-mono h-64" placeholder="Colle le contenu du mail Popina 'Rapport de fin de caisse' ici..." value={recapText} onChange={e => setRecapText(e.target.value)} />
            </div>
        )}

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

        {showImport && (
            <div className="bg-white rounded-xl border border-yellow-100 p-4 mb-6 flex gap-3 items-center flex-wrap">
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
                value={importMenu} onChange={e => setImportMenu(e.target.value)}>
                <option value="">Menu...</option>
                {menus.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-36"
                type="month" value={importMois} onChange={e => setImportMois(e.target.value)} />
            <button onClick={() => fileRef.current?.click()} disabled={importing || !importMenu || !importMois}
                className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-black font-semibold rounded-lg px-4 py-2 text-sm">
                {importing ? 'Import...' : 'Charger fichier'}
            </button>
            <button onClick={() => setShowImport(false)} className="text-sm text-gray-400 hover:text-gray-600">Annuler</button>
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
                    invalidateCache('menus');
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
            <div className="flex gap-2 mb-3 flex-wrap items-center">
                <span className="text-xs text-gray-500">Voir par :</span>
                {(['mois', 'semaine', 'jour'] as const).map(g => (
                    <button key={g} onClick={() => { setGranularite(g); setMoisActif('all'); }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${granularite === g ? 'bg-black border-black text-white' : 'border-gray-200 text-gray-500'}`}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                ))}
            </div>
            {moisDisponibles.length > 0 && (
                <div className="flex gap-2 mb-6 flex-wrap">
                <button onClick={() => setMoisActif('all')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === 'all' ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
                    Tous{granularite === 'mois' ? ' les mois' : granularite === 'semaine' ? ' (semaines)' : ' (jours)'}
                </button>
                {moisDisponibles.map(m => (
                    <button key={m} onClick={() => setMoisActif(m)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === m ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
                    {m}
                    </button>
                ))}
                </div>
            )}

            <div className="grid grid-cols-3 md:grid-cols-6 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">Plats (food)</p>
                <p className="text-2xl font-bold">{platsFood.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">Boissons</p>
                <p className="text-2xl font-bold">{platsDrink.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">Food cost</p>
                <p className={`text-2xl font-bold ${foodCostMoyen > 32 ? 'text-yellow-500' : ''}`}>{foodCostMoyen > 0 ? foodCostMoyen.toFixed(1) + '%' : '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">Drink cost</p>
                <p className={`text-2xl font-bold ${drinkCostMoyen > 25 ? 'text-yellow-500' : ''}`}>{drinkCostMoyen > 0 ? drinkCostMoyen.toFixed(1) + '%' : '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">CA réel</p>
                <p className="text-2xl font-bold">{caReel > 0 ? caReel.toFixed(0) + ' €' : '—'}</p>
                </div>
                <div className="bg-white rounded-xl border border-yellow-100 p-4">
                <p className="text-xs text-gray-500 mb-1">Articles vendus</p>
                <p className="text-2xl font-bold">{totalVendus > 0 ? totalVendus : '—'}</p>
                </div>
                {(() => {
                  const coutMatTotal = allMenuRecettes.reduce((s, mr) => {
                    const r = recettes.find(x => x.id === mr.id);
                    if (!r || !r.coutCalcule) return s;
                    const v = getVentesPourPlat(r.nom);
                    const vendus = v.reduce((a, x) => a + x.quantity, 0);
                    return s + r.coutCalcule * vendus;
                  }, 0);
                  const caHT = caReel / 1.1;
                  const margeReelle = caHT - coutMatTotal;
                  const margePct = caHT > 0 ? (margeReelle / caHT) * 100 : 0;
                  return (
                    <div className="bg-white rounded-xl border border-yellow-100 p-4 cursor-help"
                      title={`Marge réelle = CA HT (${Math.round(caHT)} €) - Σ(vendus × coût matière par plat) (${Math.round(coutMatTotal)} €)`}>
                      <p className="text-xs text-gray-500 mb-1">Marge réelle</p>
                      <p className={`text-2xl font-bold ${margeReelle > 0 ? 'text-green-600' : margeReelle < 0 ? 'text-red-500' : ''}`}>
                        {caReel > 0 ? Math.round(margeReelle) + ' €' : '—'}
                      </p>
                      {caReel > 0 && <p className="text-xs text-gray-400 mt-1">{margePct.toFixed(1)}% du CA HT</p>}
                    </div>
                  );
                })()}
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
                    const nomsCaisse = [...new Set(v.map(x => x.nom))];
                    return { ...p, vendus: v.reduce((s, x) => s + x.quantity, 0), caReel: v.reduce((s, x) => s + x.ttc, 0), nomsCaisse };
                });
                const totalVendusCat = ventsCat.reduce((s, p) => s + p.vendus, 0);

                // Food cost moyen et marge totale de la catégorie
                const catAvecCout = ventsCat.filter(p => p.coutCalcule > 0 && p.prixVente > 0);
                const catFcMoyen = catAvecCout.length > 0
                  ? catAvecCout.reduce((s, p) => s + (p.coutCalcule / (p.prixVente / 1.1)) * 100, 0) / catAvecCout.length
                  : 0;
                const catMarge = catAvecCout.reduce((s, p) => s + (p.prixVente / 1.1 - p.coutCalcule) * (p.vendus || 0), 0);
                const isFoodCat = !cat.nom.toLowerCase().includes('cocktail') && !cat.nom.toLowerCase().includes('vin') && !cat.nom.toLowerCase().includes('bière') && !cat.nom.toLowerCase().includes('apéritif') && !cat.nom.toLowerCase().includes('soda') && !cat.nom.toLowerCase().includes('chaud') && !cat.nom.toLowerCase().includes('iced');
                const fcSeuil = isFoodCat ? 32 : 20;
                const fcIcon = catFcMoyen > 0 ? (catFcMoyen > fcSeuil ? '🚨' : catFcMoyen > fcSeuil * 0.85 ? '⚠️' : '🔥') : '';

                return (
                    <div key={idx} className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
                    {(() => {
                      const avecPrix = ventsCat.filter(p => p.prixVente > 0);
                      const prixMoyen = avecPrix.length > 0 ? avecPrix.reduce((s, p) => s + p.prixVente, 0) / avecPrix.length : 0;
                      const coutMoyen = catAvecCout.length > 0 ? catAvecCout.reduce((s, p) => s + p.coutCalcule, 0) / catAvecCout.length : 0;
                      const margeMoyenne = catAvecCout.length > 0 ? catAvecCout.reduce((s, p) => s + (p.prixVente / 1.1 - p.coutCalcule), 0) / catAvecCout.length : 0;
                      const caTotal = ventsCat.reduce((s, p) => s + p.caReel, 0);
                      return (
                    <div className="bg-yellow-50 px-4 py-3">
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="font-semibold text-gray-700">{cat.nom}</h2>
                        <span className="text-xs text-gray-400">{platsCategorie.length} plats</span>
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
                      <div className="grid grid-cols-7 text-xs" style={{ gridTemplateColumns: '34% 11% 11% 11% 11% 11% 11%' }}>
                        <span></span>
                        <span className="text-right text-gray-500 font-semibold">{prixMoyen > 0 ? prixMoyen.toFixed(2) + ' €' : ''}</span>
                        <span className="text-right text-gray-500 font-semibold">{coutMoyen > 0 ? coutMoyen.toFixed(2) + ' €' : ''}</span>
                        <span className={`text-right font-semibold ${catFcMoyen > fcSeuil ? 'text-red-500' : catFcMoyen > fcSeuil * 0.85 ? 'text-orange-500' : 'text-green-600'}`}>{catFcMoyen > 0 ? `${fcIcon} ${catFcMoyen.toFixed(1)}%` : ''}</span>
                        <span className="text-right text-green-600 font-semibold">{margeMoyenne > 0 ? margeMoyenne.toFixed(2) + ' €' : ''}</span>
                        <span className="text-right text-gray-700 font-semibold">{totalVendusCat > 0 ? totalVendusCat : ''}</span>
                        <span className="text-right text-yellow-600 font-semibold">{caTotal > 0 ? Math.round(caTotal) + ' €' : ''}</span>
                      </div>
                    </div>
                      );
                    })()}
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
                            <button onClick={() => { setMenuEdit(''); setCatRecettes(new Map()); setEditingCatIdx(null); setSearchRecette(''); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>
                        </div>
                        <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-3 w-64" placeholder="Rechercher une recette..." value={searchRecette} onChange={e => setSearchRecette(e.target.value)} />
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
                            <th className="px-4 py-2 text-left w-[34%]">Plat</th>
                            <th className="px-4 py-2 text-right w-[11%]">Prix</th>
                            <th className="px-4 py-2 text-right w-[11%]">Coût mat.</th>
                            <th className="px-4 py-2 text-right w-[11%]">Food cost</th>
                            <th className="px-4 py-2 text-right w-[11%]">Marge</th>
                            <th className="px-4 py-2 text-right w-[11%]">Vendus</th>
                            <th className="px-4 py-2 text-right w-[11%]">CA réel</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-yellow-50">
                            {(() => {
                            const sortedByVendus = [...ventsCat].sort((a, b) => b.vendus - a.vendus);
                            const nbAvecVentes = sortedByVendus.filter(p => p.vendus > 0).length;
                            const topCount = Math.max(1, Math.ceil(nbAvecVentes * 0.2));
                            const flopCount = Math.max(1, Math.ceil(nbAvecVentes * 0.2));
                            const sortedByFc = ventsCat
                                .map((p, idx) => ({ idx, fc: p.coutCalcule > 0 && p.prixVente > 0 ? (p.coutCalcule / (p.prixVente / 1.1)) * 100 : Infinity }))
                                .filter(x => x.fc !== Infinity)
                                .sort((a, b) => a.fc - b.fc);
                            const topRentaIdx = new Set(sortedByFc.slice(0, Math.max(1, Math.ceil(sortedByFc.length * 0.2))).map(x => sortedByVendus.findIndex(p => p === ventsCat[x.idx])));
                            // Top/flop marge (par valeur absolue de marge unitaire)
                            const sortedByMarge = ventsCat
                                .map((p, idx) => ({ idx, marge: p.coutCalcule > 0 && p.prixVente > 0 ? p.prixVente / 1.1 - p.coutCalcule : -Infinity }))
                                .filter(x => x.marge !== -Infinity)
                                .sort((a, b) => b.marge - a.marge);
                            const topMargeCount = Math.max(1, Math.ceil(sortedByMarge.length * 0.2));
                            const topMargeIdx = new Set(sortedByMarge.slice(0, topMargeCount).map(x => x.idx));
                            const flopMargeIdx = new Set(sortedByMarge.slice(-topMargeCount).map(x => x.idx));
                            return sortedByVendus.map((plat, i) => {
                            const pHT = plat.prixVente / 1.1;
                            const fc = pHT > 0 ? (plat.coutCalcule / pHT) * 100 : 0;
                            const isTopVendu = plat.vendus > 0 && i < topCount;
                            const isFlopVendu = plat.vendus > 0 && i >= nbAvecVentes - flopCount && !isTopVendu;
                            const isTopRenta = topRentaIdx.has(i);
                            const origIdx = ventsCat.indexOf(plat);
                            const isTopMarge = topMargeIdx.has(origIdx);
                            const isFlopMarge = flopMargeIdx.has(origIdx) && !isTopMarge;
                            const isVege = plat.nom.toLowerCase().includes('lait végétal');
                            return (
                                <tr key={i} className={`transition-colors ${isVege ? 'bg-green-50/60 hover:bg-green-100/60' : 'hover:bg-yellow-50'}`}>
                                <td className="px-4 py-3 font-medium">
                                    {plat.nom}
                                    {plat.nomsCaisse.length > 0 && <span className="ml-2 text-xs text-gray-400" title={plat.nomsCaisse.join(', ')}>({plat.nomsCaisse.join(', ')})</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-gray-500">{plat.prixVente.toFixed(2)} €</td>
                                <td className="px-4 py-3 text-right text-gray-500">{plat.coutCalcule > 0 ? plat.coutCalcule.toFixed(2) + ' €' : '—'}</td>
                                <td className="px-4 py-3 text-right">
                                    <span className={`font-semibold ${fc > 32 ? 'text-yellow-500' : 'text-gray-700'}`}>{isTopRenta && '🔥 '}{fc > 0 ? fc.toFixed(1) + '%' : '—'}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {pHT > 0 && plat.coutCalcule > 0 ? <span className="font-semibold text-gray-700">{isTopMarge && '🔥 '}{isFlopMarge && '🥶 '}{(pHT - plat.coutCalcule).toFixed(2)} €</span> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {plat.vendus > 0 ? <span className="font-semibold">{isTopVendu && '🔥 '}{isFlopVendu && '🥶 '}{plat.vendus}</span> : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {plat.caReel > 0 ? <span className="font-semibold text-yellow-600">{plat.caReel.toFixed(0)} €</span> : <span className="text-gray-300">—</span>}
                                </td>
                                </tr>
                            );
                            });
                            })()}
                        </tbody>
                        </table>
                    )}
                    </div>
                );
                })}

                {(() => {
                const allPlatsNoms = menuCourant.categories.flatMap(c => (c.recettes || []).map(mr => {
                    const r = recettes.find(x => x.id === mr.id);
                    return r?.nom || '';
                })).filter(Boolean);
                const ventesNonAttribuees = ventesMenuActuel.filter(v => {
                    return !allPlatsNoms.some(nom => matchPlat(v.nom, nom));
                });
                // Regrouper par nom
                const grouped = new Map<string, { quantity: number; ttc: number }>();
                for (const v of ventesNonAttribuees) {
                    const existing = grouped.get(v.nom) || { quantity: 0, ttc: 0 };
                    grouped.set(v.nom, { quantity: existing.quantity + v.quantity, ttc: existing.ttc + v.ttc });
                }
                const sorted = [...grouped.entries()].sort((a, b) => b[1].quantity - a[1].quantity);
                if (sorted.length === 0) return null;
                return (
                    <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-yellow-100">
                        <h2 className="font-semibold text-gray-700">Non attribué</h2>
                        <span className="text-xs text-gray-400">{sorted.length} articles · {sorted.reduce((s, [, v]) => s + v.quantity, 0)} vendus</span>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="text-gray-400 text-xs uppercase border-b border-yellow-50">
                        <tr>
                            <th className="px-4 py-2 text-left w-[35%]">Nom caisse</th>
                            <th className="px-4 py-2 text-right w-[10%]">Vendus</th>
                            <th className="px-4 py-2 text-right w-[10%]">CA TTC</th>
                            <th className="px-4 py-2 text-left w-[35%]">Attribuer à</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-yellow-50">
                        {sorted.map(([nom, v]) => (
                            <tr key={nom} className="hover:bg-yellow-50 transition-colors">
                            <td className="px-4 py-3 font-medium">{nom}</td>
                            <td className="px-4 py-3 text-right font-semibold">{v.quantity}</td>
                            <td className="px-4 py-3 text-right font-semibold text-yellow-600">{v.ttc.toFixed(0)} €</td>
                            <td className="px-4 py-3">
                                <select className="border border-gray-200 rounded-lg px-2 py-1 text-sm w-full" defaultValue=""
                                onChange={async (e) => {
                                    if (!e.target.value) return;
                                    const recetteNom = e.target.value;
                                    const caisseKey = normalizeCaisse(nom);
                                    const recetteKey = normalizeCaisse(recetteNom).replace(/\s+(ete|hiver)$/, '');
                                    CAISSE_MAP[caisseKey] = recetteKey;
                                    await addDoc(collection(db, 'caisseMapCustom'), { caisse: caisseKey, recette: recetteKey, original: nom, recetteNom });
                                    invalidateCache('caisseMapCustom');
                                    setVentes([...ventes]);
                                }}>
                                <option value="">—</option>
                                {allPlatsNoms.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })).map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                );
                })()}
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
                        <button onClick={async () => { await handleSauvegarderCategorie(); setShowAddCat(false); setSearchRecette(''); }} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Enregistrer</button>
                        <button onClick={() => { setShowAddCat(false); setCatRecettes(new Map()); setSearchRecette(''); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500">Annuler</button>
                    </div>
                    <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-3 w-64" placeholder="Rechercher une recette..." value={searchRecette} onChange={e => setSearchRecette(e.target.value)} />
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