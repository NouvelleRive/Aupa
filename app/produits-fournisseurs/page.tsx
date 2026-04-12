    'use client';

    import { useState, useEffect, useRef } from 'react';
    import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
    import { db } from '@/lib/firebase';
    import { ProduitFournisseur, Unite, Categorie } from '@/lib/types';
    import { INGREDIENTS } from '@/lib/ingredient';
    import { recalculerTousLesCouts } from '@/lib/recalculCouts';

    const UNITES: Unite[] = ['kg', 'g', 'L', 'cL', 'pièce', 'lot'];
    const CATEGORIES: Categorie[] = ['viande', 'poisson', 'légume', 'fruit', 'laitage', 'épicerie', 'boisson', 'consommable', 'autre'];
    const emptyForm = { nom: '', prix: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie, rendement: '100', quantite: '1' };

    const detectUnite = (nom: string): Unite => {
    const n = nom.toLowerCase();
    if (n.includes('1kg') || n.includes('2kg') || n.includes('5kg') || n.includes('/kg') || n.match(/\d+kg/)) return 'kg';
    if (n.includes('500g') || n.includes('150g') || n.includes('125g') || n.match(/\d+g[^r]/)) return 'g';
    if (n.includes('1l') || n.includes('5l') || n.includes('1.5l') || n.match(/\d+l$/)) return 'L';
    if (n.includes('cl')) return 'cL';
    if (n.includes('botte') || n.includes('pièce') || n.match(/x\s?\d+/)) return 'pièce';
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

    export default function ProduitsFournisseursPage() {
    const [ingredients, setIngredients] = useState<ProduitFournisseur[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const pdfRef = useRef<HTMLInputElement>(null);
    const millietRef = useRef<HTMLInputElement>(null);
    const lbaRef = useRef<HTMLInputElement>(null);
    const assembleursRef = useRef<HTMLInputElement>(null);
    const [histoId, setHistoId] = useState<string | null>(null);
    const [editInlineId, setEditInlineId] = useState<string | null>(null);
    const [editInlineForm, setEditInlineForm] = useState({ nom: '', prix: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie, rendement: '100', quantite: '1' });
    const [ingredientsMap, setNomsXLMap] = useState<Map<string, string[]>>(new Map());
    const [ingredientParProduit, setNomsXLParIngredient] = useState<Record<string, string>>({});

    const fetchIngredients = async () => {
        const [snap, recSnap] = await Promise.all([
        getDocs(collection(db, 'produitsFournisseurs')),
        getDocs(collection(db, 'recettes')),
        ]);
        setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProduitFournisseur)));
        const map: Record<string, string> = {};
        for (const r of recSnap.docs) {
        for (const ing of (r.data().ingredients || [])) {
            if (ing.ingredientIds) {
            for (const id of ing.ingredientIds) {
                if (!map[id]) map[id] = ing.nomIngredient || '';
            }
            }
            if (ing.ingredientId && ing.nomIngredient) {
            map[ing.ingredientId] = ing.nomIngredient;
            }
        }
        }
        
        for (const d of snap.docs) {
          const data = d.data();
          if (data.ingredient && !map[d.id]) map[d.id] = data.ingredient;
        }
        setNomsXLParIngredient(map);
        const xlMap = new Map<string, string[]>();
        for (const nom of INGREDIENTS) {
          xlMap.set(nom, []);
        }
        for (const r of recSnap.docs) {
          const data = r.data();
          for (const ing of (data.ingredients || [])) {
            if (ing.nomIngredient && xlMap.has(ing.nomIngredient)) {
              xlMap.get(ing.nomIngredient)!.push(r.id);
            }
          }
        }
        setNomsXLMap(xlMap);
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
            const codeMatch = items[j].match(/^(FF-\d+)$/);
        if (codeMatch) {
        const code = codeMatch[1];
        let nom = items[j + 1] || '';
        let nomComplet = nom;
        for (let k = j + 2; k < j + 5; k++) {
            if (!items[k] || items[k].match(/^\d/)) break;
            nomComplet += ' ' + items[k];
        }
        let prix = 0;
        for (let k = j + 2; k < Math.min(j + 7, items.length); k++) {
            const prixMatch = items[k].replace(',', '.').match(/^(\d+\.?\d*)\s*€/);
            if (prixMatch) {
            prix = parseFloat(prixMatch[1]);
            break;
            }
        }
        if (prix > 0 && nom) {
            lignes.push({ code, nom: nomComplet, prix, date: dateFacture });
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
        const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
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
            await updateDoc(doc(db, 'produitsFournisseurs', match.id), {
                prix: derniere.prix,
                historiquesPrix: [...historiqueExistant, ...nouveauxHistorique],
                updatedAt: nouveauxHistorique[nouveauxHistorique.length - 1].date,
            });
            }
            updated++;
        } else {
            const uniteDetectee = detectUnite(derniere.nom);
            const matchQte = derniere.nom.match(/[xX]\s?(\d+)/);
            const quantite = matchQte ? parseInt(matchQte[1]) : 1;
            await addDoc(collection(db, 'produitsFournisseurs'), {
            nom: derniere.nom,
            prix: derniere.prix,
            unite: uniteDetectee,
            categorie: detectCategorie(derniere.nom),
            rendement: 1,
            quantite,
            fournisseur: 'Foodflow',
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
        await recalculerTousLesCouts();
        fetchIngredients();
        e.target.value = '';
    };

    const parseMillietPDF = async (file: File, pdfjsLib: any): Promise<{ code: string; nom: string; prix: number; date: string; qte: number }[]> => {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const lignes: { code: string; nom: string; prix: number; date: string; qte: number }[] = [];

        // Extraire la date de facture
        let dateFacture = new Date().toISOString();
        const page1 = await pdf.getPage(1);
        const content1 = await page1.getTextContent();
        for (const item of content1.items as any[]) {
        const m = item.str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) { dateFacture = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString(); break; }
        }

        for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = (content.items as any[]).map((it: any) => ({
            str: it.str.trim(),
            x: Math.round(it.transform[4]),
            y: Math.round(it.transform[5]),
        })).filter((it: any) => it.str);

        // Grouper par ligne (même Y ±3px)
        const rows = new Map<number, typeof items>();
        for (const it of items) {
            let foundY = false;
            for (const [ky] of rows) {
            if (Math.abs(it.y - ky) <= 3) { rows.get(ky)!.push(it); foundY = true; break; }
            }
            if (!foundY) rows.set(it.y, [it]);
        }

        // Trier les lignes de haut en bas, et les items de gauche à droite
        const sortedRows = Array.from(rows.entries())
            .sort(([a], [b]) => b - a)
            .map(([, items]) => items.sort((a, b) => a.x - b.x).map(it => it.str));

        for (const row of sortedRows) {
            // Chercher le N° Article (nombre 3-5 chiffres, pas une date, pas un prix)
            const articleIdx = row.findIndex(s => /^\d{3,5}$/.test(s));
            if (articleIdx < 0) continue;
            const code = row[articleIdx];

            // Quantité : premier élément de la ligne (colis)
            const colisMatch = row[0]?.match(/^(\d+)$/);
            const colis = colisMatch ? parseInt(colisMatch[1]) : 1;
            // Conditionnement : x1, x5, x6, x12, x20...
            const condMatch = row[1]?.match(/^x(\d+)$/i);
            const cond = condMatch ? parseInt(condMatch[1]) : 1;
            const qte = colis * cond;

            // Nom du produit : entre le code unité (3e col) et le N° article
            const nomParts = row.slice(3, articleIdx);
            const nom = nomParts.join(' ');
            if (!nom) continue;

            // Filtrer les nombres après le N° article
            // Exclure les taux TVA (5.50, 20.00) et le % qui pourrait être séparé
            const afterArticle = row.slice(articleIdx + 1);
            const tvaRates = new Set([5.5, 20, 5.50, 20.00]);
            const numbers: number[] = [];
            for (let idx = 0; idx < afterArticle.length; idx++) {
            const s = afterArticle[idx].replace(/\s/g, '').replace(',', '.');
            if (!/^\d+\.?\d*$/.test(s)) continue;
            const n = parseFloat(s);
            // Exclure si c'est un taux TVA (suivi ou non de %)
            const next = afterArticle[idx + 1] || '';
            if (tvaRates.has(n) && (next === '%' || next.includes('%'))) continue;
            numbers.push(n);
            }

            // Le TOTAL HT est le dernier nombre valide
            if (numbers.length < 1) continue;
            const totalHT = numbers[numbers.length - 1];

            // Prix unitaire = total / qte
            const prixUnitaire = totalHT / (qte || 1);

            lignes.push({ code, nom, prix: prixUnitaire, date: dateFacture, qte });
        }
        }
        return lignes;
    };

    const handleImportMilliet = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setImporting(true);

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

        files.sort((a, b) => a.lastModified - b.lastModified);

        const toutesLignes: { code: string; nom: string; prix: number; date: string; qte: number }[] = [];
        for (let f = 0; f < files.length; f++) {
        setImportProgress(`Lecture facture Milliet ${f + 1}/${files.length}...`);
        const lignes = await parseMillietPDF(files[f], pdfjsLib);
        toutesLignes.push(...lignes);
        }

        toutesLignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setImportProgress('Mise à jour Firestore...');
        const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
        const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        let created = 0;
        let updated = 0;

        const parCode = new Map<string, typeof toutesLignes>();
        for (const ligne of toutesLignes) {
        if (!parCode.has(ligne.code)) parCode.set(ligne.code, []);
        parCode.get(ligne.code)!.push(ligne);
        }

        for (const [code, lignes] of parCode.entries()) {
        const derniere = lignes[lignes.length - 1];
        const match = existing.find((ing: any) => ing.millietCode === code);
        if (match) {
            const historiqueExistant = match.historiquesPrix || [];
            const datesExistantes = new Set(historiqueExistant.map((h: any) => h.date));
            const nouveauxHistorique = lignes
            .map(l => ({ date: l.date, prix: l.prix }))
            .filter(h => !datesExistantes.has(h.date));
            if (nouveauxHistorique.length > 0) {
            await updateDoc(doc(db, 'produitsFournisseurs', match.id), {
                prix: derniere.prix,
                historiquesPrix: [...historiqueExistant, ...nouveauxHistorique],
                updatedAt: nouveauxHistorique[nouveauxHistorique.length - 1].date,
            });
            }
            updated++;
        } else {
            const uniteDetectee = detectUnite(derniere.nom);
            const matchQte = derniere.nom.match(/[xX]\s?(\d+)/);
            const quantite = matchQte ? parseInt(matchQte[1]) : 1;
            await addDoc(collection(db, 'produitsFournisseurs'), {
            nom: derniere.nom,
            prix: derniere.prix,
            unite: uniteDetectee,
            categorie: 'boisson' as Categorie,
            rendement: 1,
            quantite,
            fournisseur: 'Milliet',
            millietCode: code,
            historiquesPrix: lignes.map(l => ({ date: l.date, prix: l.prix })),
            updatedAt: derniere.date,
            });
            created++;
        }
        }

        setImporting(false);
        setImportProgress('');
        alert(`✅ Milliet : ${created} produits créés, ${updated} mis à jour !`);
        await recalculerTousLesCouts();
        fetchIngredients();
        e.target.value = '';
    };

    const parseLBAPDF = async (file: File, pdfjsLib: any): Promise<{ code: string; nom: string; prix: number; date: string }[]> => {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const lignes: { code: string; nom: string; prix: number; date: string }[] = [];

        // Extraire la date de facture
        let dateFacture = new Date().toISOString();
        const page1 = await pdf.getPage(1);
        const content1 = await page1.getTextContent();
        for (const item of content1.items as any[]) {
        const m = item.str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) { dateFacture = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString(); break; }
        }

        for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = (content.items as any[]).map((it: any) => ({
            str: it.str.trim(),
            x: Math.round(it.transform[4]),
            y: Math.round(it.transform[5]),
        })).filter((it: any) => it.str);

        // Grouper par ligne (même Y ±3px)
        const rows = new Map<number, typeof items>();
        for (const it of items) {
            let foundY = false;
            for (const [ky] of rows) {
            if (Math.abs(it.y - ky) <= 3) { rows.get(ky)!.push(it); foundY = true; break; }
            }
            if (!foundY) rows.set(it.y, [it]);
        }

        const sortedRows = Array.from(rows.entries())
            .sort(([a], [b]) => b - a)
            .map(([, items]) => items.sort((a, b) => a.x - b.x).map(it => it.str));

        let stopParsing = false;
        for (const row of sortedRows) {
            const joined = row.join(' ');
            // Arrêter au bloc déconsigne
            if (joined.toLowerCase().includes('ci-dessous') || joined.toLowerCase().includes('déconsigne sur facture')) {
            stopParsing = true;
            continue;
            }
            if (stopParsing) continue;

            // Le CODE LBA est un nombre de 4 chiffres en début de ligne
            if (!/^\d{4}$/.test(row[0])) continue;
            const code = row[0];

            // Trouver les champs numériques et textuels
            // Structure: CODE DESIGNATION CDT COLIS COLS PX.U.BT REM% PX.U.NET MT.NT.HT TVA ...
            // CDT = FUT, UNITE, CAISSE, CARTON, PACK
            const cdtValues = ['FUT', 'UNITE', 'CAISSE', 'CARTON', 'PACK', 'PAK'];
            const cdtIdx = row.findIndex((s, idx) => idx > 0 && cdtValues.includes(s.toUpperCase()));

            // Nom = entre CODE et CDT (ou tout le texte non-numérique)
            let nom = '';
            const nomEnd = cdtIdx > 0 ? cdtIdx : row.length;
            for (let j = 1; j < nomEnd; j++) {
            if (/^\d/.test(row[j])) break;
            nom += (nom ? ' ' : '') + row[j];
            }
            if (!nom) continue;
            // Ajouter le CDT au nom pour contexte
            if (cdtIdx > 0) nom += ' ' + row[cdtIdx];

            // Extraire les nombres après le CDT
            const numStart = cdtIdx > 0 ? cdtIdx + 1 : 2;
            const nums: number[] = [];
            for (let j = numStart; j < row.length; j++) {
            const s = row[j].replace(/\s/g, '').replace(',', '.').replace('%', '');
            if (/^\d+\.?\d*$/.test(s)) nums.push(parseFloat(s));
            }

            // nums: [COLIS, COLS, PX.U.BT, REM%, PX.U.NET, MT.NT.HT, TVA, ...]
            // PX.U.NET est le prix unitaire HT post-remise (par litre, kg, pièce)
            // MT.NT.HT est juste avant la TVA, PX.U.NET est juste avant MT.NT.HT
            if (nums.length < 3) continue;

            // Trouver l'index de la TVA (5.50 ou 20.00)
            let tvaIdx = -1;
            for (let j = 0; j < nums.length; j++) {
            if ((nums[j] === 20 || nums[j] === 5.5) && j >= 2) { tvaIdx = j; break; }
            }
            if (tvaIdx < 2) continue;

            // PX.U.NET = 2 positions avant la TVA, MT.NT.HT = 1 position avant
            const pxUNet = nums[tvaIdx - 2];
            if (pxUNet <= 0) continue;

            // MT.DROITS.UNIT = juste après la TVA (accises alcool, 0 si absent)
            const droits = (tvaIdx + 1 < nums.length) ? nums[tvaIdx + 1] : 0;
            // Prix réel = prix net + droits unitaires
            const prixReel = pxUNet + droits;

            lignes.push({ code, nom, prix: prixReel, date: dateFacture });
        }
        }
        return lignes;
    };

    const handleImportLBA = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setImporting(true);

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

        files.sort((a, b) => a.lastModified - b.lastModified);

        const toutesLignes: { code: string; nom: string; prix: number; date: string }[] = [];
        for (let f = 0; f < files.length; f++) {
        setImportProgress(`Lecture facture LBA ${f + 1}/${files.length}...`);
        const lignes = await parseLBAPDF(files[f], pdfjsLib);
        toutesLignes.push(...lignes);
        }

        toutesLignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setImportProgress('Mise à jour Firestore...');
        const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
        const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        let created = 0;
        let updated = 0;

        const parCode = new Map<string, typeof toutesLignes>();
        for (const ligne of toutesLignes) {
        if (!parCode.has(ligne.code)) parCode.set(ligne.code, []);
        parCode.get(ligne.code)!.push(ligne);
        }

        for (const [code, lignes] of parCode.entries()) {
        const derniere = lignes[lignes.length - 1];
        const match = existing.find((ing: any) => ing.lbaCode === code);
        if (match) {
            const historiqueExistant = match.historiquesPrix || [];
            const datesExistantes = new Set(historiqueExistant.map((h: any) => h.date));
            const nouveauxHistorique = lignes
            .map(l => ({ date: l.date, prix: l.prix }))
            .filter(h => !datesExistantes.has(h.date));
            if (nouveauxHistorique.length > 0) {
            await updateDoc(doc(db, 'produitsFournisseurs', match.id), {
                prix: derniere.prix,
                historiquesPrix: [...historiqueExistant, ...nouveauxHistorique],
                updatedAt: nouveauxHistorique[nouveauxHistorique.length - 1].date,
            });
            }
            updated++;
        } else {
            const uniteDetectee = detectUnite(derniere.nom);
            const matchQte = derniere.nom.match(/[xX]\s?(\d+)/);
            const quantite = matchQte ? parseInt(matchQte[1]) : 1;
            await addDoc(collection(db, 'produitsFournisseurs'), {
            nom: derniere.nom,
            prix: derniere.prix,
            unite: uniteDetectee,
            categorie: 'boisson' as Categorie,
            rendement: 1,
            quantite,
            fournisseur: 'LBA',
            lbaCode: code,
            historiquesPrix: lignes.map(l => ({ date: l.date, prix: l.prix })),
            updatedAt: derniere.date,
            });
            created++;
        }
        }

        setImporting(false);
        setImportProgress('');
        alert(`✅ LBA : ${created} produits créés, ${updated} mis à jour !`);
        await recalculerTousLesCouts();
        fetchIngredients();
        e.target.value = '';
    };

    // Mapping produit Les Assembleurs → ingrédient (chaque fût = 20L)
    const ASSEMBLEURS_MAP: Record<string, string> = {
      'chardonnay': 'Vin blanc',
      'cotes-du-rhone rouge': 'Vin rouge',
      'cotes du rhone rouge': 'Vin rouge',
      'frizzante': 'Frizzante',
      'rose': 'Vin rosé',
    };

    const parseAssembleursPDF = async (file: File, pdfjsLib: any): Promise<{ nom: string; ingredient: string; prix: number; qte: number; date: string }[]> => {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const lignes: { nom: string; ingredient: string; prix: number; qte: number; date: string }[] = [];

        const page1 = await pdf.getPage(1);
        const content1 = await page1.getTextContent();
        const items1 = content1.items.map((item: any) => item.str.trim()).filter(Boolean);

        let dateFacture = new Date().toISOString();
        for (const item of items1) {
          const m = item.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (m) { dateFacture = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString(); break; }
        }

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const items = content.items.map((item: any) => item.str.trim()).filter(Boolean);

          for (let j = 0; j < items.length; j++) {
            const nomLigne = items[j];
            const nomLower = nomLigne.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const matchedKey = Object.keys(ASSEMBLEURS_MAP).find(k => nomLower.includes(k));
            if (!matchedKey) continue;

            // Chercher qté et montant HT dans les items suivants
            let qte = 0;
            let prix = 0;
            for (let k = j + 1; k < Math.min(j + 6, items.length); k++) {
              const val = items[k].replace(',', '.').replace(/\s/g, '');
              const num = parseFloat(val);
              if (isNaN(num)) continue;
              if (qte === 0) { qte = num; }
              else if (val.includes('€') || (num > qte && prix === 0)) { prix = num; break; }
            }

            if (prix > 0 && qte > 0) {
              lignes.push({
                nom: nomLigne,
                ingredient: ASSEMBLEURS_MAP[matchedKey],
                prix,
                qte, // nombre de fûts
                date: dateFacture,
              });
            }
          }
        }
        return lignes;
    };

    const handleImportAssembleurs = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setImporting(true);

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();

        const toutesLignes: { nom: string; ingredient: string; prix: number; qte: number; date: string }[] = [];
        for (let f = 0; f < files.length; f++) {
          setImportProgress(`Lecture facture Assembleurs ${f + 1}/${files.length}...`);
          const lignes = await parseAssembleursPDF(files[f], pdfjsLib);
          toutesLignes.push(...lignes);
        }

        toutesLignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        setImportProgress('Mise à jour Firestore...');
        const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
        const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        let created = 0;
        let updated = 0;

        // Récupérer les ingrédients pour lier par ingredientId
        const ingSnap = await getDocs(collection(db, 'ingredients'));
        const ingMap: Record<string, string> = {};
        for (const d of ingSnap.docs) ingMap[d.data().nom] = d.id;

        for (const ligne of toutesLignes) {
          const quantiteLitres = ligne.qte * 20; // chaque fût = 20L
          const ingredientId = ingMap[ligne.ingredient] || null;
          const match = existing.find((p: any) => p.fournisseur === 'Les Assembleurs' && p.ingredient === ligne.ingredient);

          if (match) {
            const historiqueExistant = match.historiquesPrix || [];
            const datesExistantes = new Set(historiqueExistant.map((h: any) => h.date));
            const updateData: any = {
              nom: ligne.nom,
              prix: ligne.prix,
              quantite: quantiteLitres,
              updatedAt: ligne.date,
            };
            if (!datesExistantes.has(ligne.date)) {
              updateData.historiquesPrix = [...historiqueExistant, { date: ligne.date, prix: ligne.prix }];
            }
            if (ingredientId && !match.ingredientId) updateData.ingredientId = ingredientId;
            await updateDoc(doc(db, 'produitsFournisseurs', match.id), updateData);
            updated++;
          } else {
            const data: any = {
              nom: ligne.nom,
              ingredient: ligne.ingredient,
              prix: ligne.prix,
              quantite: quantiteLitres,
              unite: 'L',
              categorie: 'boisson',
              rendement: 1,
              fournisseur: 'Les Assembleurs',
              historiquesPrix: [{ date: ligne.date, prix: ligne.prix }],
              updatedAt: ligne.date,
            };
            if (ingredientId) data.ingredientId = ingredientId;
            await addDoc(collection(db, 'produitsFournisseurs'), data);
            created++;
          }
        }

        setImporting(false);
        setImportProgress('');
        alert(`✅ Les Assembleurs : ${created} produits créés, ${updated} mis à jour !`);
        await recalculerTousLesCouts();
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
        await addDoc(collection(db, 'produitsFournisseurs'), { nom, prix, unite, categorie: 'épicerie', rendement: 1, historiquesPrix: [{ date: new Date().toISOString(), prix }], updatedAt: new Date().toISOString() });
        count++;
        }
        alert(`${count} ingrédients importés !`);
        fetchIngredients();
        e.target.value = '';
    };

    const handleSubmit = async () => {
        if (!form.nom || !form.prix) return;
        const quantite = parseFloat(form.quantite) || 1;
        const data: any = { nom: form.nom, prix: parseFloat(form.prix), unite: form.unite, categorie: form.categorie, rendement: parseFloat(form.rendement) / 100, quantite, historiquesPrix: [{ date: new Date().toISOString(), prix: parseFloat(form.prix) }], updatedAt: new Date().toISOString() };
        await addDoc(collection(db, 'produitsFournisseurs'), data);
        setForm(emptyForm); setShowForm(false); fetchIngredients();
    };

    const handleEdit = (ing: ProduitFournisseur) => {
        const q = (ing as any).quantite || (ing as any).nbKg || (ing as any).nbPieces || 1;
        setEditInlineId(ing.id);
        setEditInlineForm({ nom: ing.nom, prix: String(ing.prix), unite: ing.unite, categorie: ing.categorie, rendement: String(Math.round(ing.rendement * 100)), quantite: String(q) });
    };

    const handleSaveInline = async () => {
        if (!editInlineId || !editInlineForm.nom || !editInlineForm.prix) return;
        const quantite = parseFloat(editInlineForm.quantite) || 1;
        await updateDoc(doc(db, 'produitsFournisseurs', editInlineId), {
            nom: editInlineForm.nom, prix: parseFloat(editInlineForm.prix), unite: editInlineForm.unite,
            categorie: editInlineForm.categorie, rendement: parseFloat(editInlineForm.rendement) / 100,
            quantite, updatedAt: new Date().toISOString(),
        });
        setEditInlineId(null);
        await recalculerTousLesCouts();
        fetchIngredients();
    };

    const [filterCategorie, setFilterCategorie] = useState<string>('all');
    const [filterFournisseur, setFilterFournisseur] = useState<string>('all');
    const [filterNonLie, setFilterNonLie] = useState(false);

    const handleDelete = async (id: string) => {
        if (!confirm('Supprimer cet ingrédient ?')) return;
        await deleteDoc(doc(db, 'produitsFournisseurs', id));
        fetchIngredients();
    };

    const filtered = ingredients
    .filter(i => i.nom.toLowerCase().includes(search.toLowerCase()))
    .filter(i => filterCategorie === 'all' || i.categorie === filterCategorie)
    .filter(i => {
      if (filterFournisseur === 'all') return true;
      const f = (i as any).fournisseur || ((i as any).foodflowCode ? 'Foodflow' : (i as any).millietCode ? 'Milliet' : (i as any).lbaCode ? 'LBA' : '');
      return f === filterFournisseur;
    })
    .filter(i => !filterNonLie || !ingredientParProduit[i.id])
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

    return (
        <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Produits fournisseur</h1>
            <div className="flex gap-3">
            <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); }} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                + Ajouter manuellement
            </button>
            <div className="relative">
              <select
                disabled={importing}
                className="border border-yellow-400 text-yellow-600 hover:bg-yellow-50 font-semibold rounded-lg px-4 py-2 text-sm appearance-none cursor-pointer pr-8"
                value=""
                onChange={e => {
                  const v = e.target.value;
                  if (v === 'foodflow') pdfRef.current?.click();
                  else if (v === 'milliet') millietRef.current?.click();
                  else if (v === 'lba') lbaRef.current?.click();
                  else if (v === 'assembleurs') assembleursRef.current?.click();
                  else if (v === 'excel') fileRef.current?.click();
                  e.target.value = '';
                }}
              >
                <option value="">{importing ? importProgress || 'Import en cours...' : 'Importer facture ▾'}</option>
                <option value="foodflow">Foodflow (PDF)</option>
                <option value="milliet">Milliet (PDF)</option>
                <option value="lba">LBA (PDF)</option>
                <option value="assembleurs">Les Assembleurs (PDF)</option>
                <option value="excel">Excel</option>
              </select>
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportXL} />
            <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportPDF} />
            <input ref={millietRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportMilliet} />
            <input ref={lbaRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportLBA} />
            <input ref={assembleursRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportAssembleurs} />
            </div>
        </div>

        {showForm && (
            <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">Nouvel ingrédient</h2>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Nom</label>
                  <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Catégorie</label>
                  <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Unité</label>
                  <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value as Unite })}>
                  {UNITES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Prix (€)</label>
                  <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Prix" type="number" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Quantité</label>
                  <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Qté" type="number" step="0.01" min="0.01" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} title="Nb de pièces, kg ou L dans le colis" />
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={handleSubmit} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">Ajouter</button>
                <button onClick={() => { setShowForm(false); setForm(emptyForm); }} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">Annuler</button>
            </div>
            </div>
        )}

        <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4 w-64" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />

        <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4" value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
            <option value="all">Toutes catégories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>

            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm mb-4" value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)}>
            <option value="all">Tous fournisseurs</option>
            <option value="Foodflow">Foodflow</option>
            <option value="Milliet">Milliet</option>
            <option value="LBA">LBA</option>
            <option value="Lidl">Lidl</option>
            <option value="Les Assembleurs">Les Assembleurs</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-2">
            <input type="checkbox" checked={filterNonLie} onChange={e => setFilterNonLie(e.target.checked)} className="accent-yellow-400" />
            Non liés seulement
            </label>

        {loading ? <p className="text-gray-400">Chargement...</p> : (
            <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
                <tr>
                    <th className="px-4 py-3 text-left">Produit fournisseur</th>
                    <th className="px-4 py-3 text-left">Catégorie</th>
                    <th className="px-4 py-3 text-left">Ingrédient</th>
                    <th className="px-4 py-3 text-left">Fournisseur</th>
                    <th className="px-4 py-3 text-right">Prix achat</th>
                    <th className="px-4 py-3 text-left">Unité</th>
                    <th className="px-4 py-3 text-right">Nb pièces/kg/L</th>
                    <th className="px-4 py-3 text-right">Prix réel</th>
                    <th className="px-4 py-3 text-left">Dernière MAJ</th>
                    <th className="px-4 py-3"></th>
                </tr>
                </thead>
                <tbody className="divide-y divide-yellow-50">
                {filtered.map(ing => {
                    const isEditing = editInlineId === ing.id;
                    return (
                    <tr key={ing.id} className={`transition-colors ${isEditing ? 'bg-yellow-50' : 'hover:bg-yellow-50'}`}>
                    <td className="px-4 py-3 font-medium">
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Nom</span><input className="border border-yellow-200 rounded px-2 py-1 text-sm w-full" value={editInlineForm.nom} onChange={e => setEditInlineForm({ ...editInlineForm, nom: e.target.value })} /><div className="flex gap-2 mt-2"><button onClick={handleSaveInline} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded px-3 py-1 text-xs">Enregistrer</button><button onClick={() => setEditInlineId(null)} className="border border-gray-200 rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-50">Annuler</button></div></div> : ing.nom}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                        <select className="bg-transparent text-sm cursor-pointer hover:text-yellow-600" value={ing.categorie} onChange={async e => { await updateDoc(doc(db, 'produitsFournisseurs', ing.id), { categorie: e.target.value }); fetchIngredients(); }}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <select className="border border-gray-200 rounded px-2 py-1 text-xs w-full max-w-[160px]"
                        value={ingredientParProduit[ing.id] || ''}
                        onChange={async e => {
                          const nomChoisi = e.target.value;
                          if (!nomChoisi) return;
                          const recSnap = await getDocs(collection(db, 'recettes'));
                          for (const recDoc of recSnap.docs) {
                            const data = recDoc.data();
                            const ings = data.ingredients || [];
                            const hasMatch = ings.some((i: any) => i.nomIngredient === nomChoisi);
                            if (!hasMatch) continue;
                            const newIngs = ings.map((i: any) => {
                              if (i.nomIngredient !== nomChoisi) return i;
                              const existingIds = i.ingredientIds || (i.ingredientId ? [i.ingredientId] : []);
                              const mergedIds = [...new Set([...existingIds, ing.id])];
                              return { ingredientIds: mergedIds, grammage: i.grammage, nomIngredient: i.nomIngredient };
                            });
                            await updateDoc(doc(db, 'recettes', recDoc.id), { ingredients: newIngs });
                          }
                          await updateDoc(doc(db, 'produitsFournisseurs', ing.id), { ingredient: nomChoisi });
                          await recalculerTousLesCouts();
                          fetchIngredients();
                        }}>
                        <option value="">— Non lié —</option>
                        {Array.from(ingredientsMap.keys()).sort().map(nom => <option key={nom} value={nom}>{nom}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                        {(ing as any).fournisseur || ((ing as any).foodflowCode ? 'Foodflow' : (ing as any).millietCode ? 'Milliet' : (ing as any).lbaCode ? 'LBA' : '—')}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Prix (€)</span><input className="border border-yellow-200 rounded px-2 py-1 text-sm w-20 text-right" type="number" value={editInlineForm.prix} onChange={e => setEditInlineForm({ ...editInlineForm, prix: e.target.value })} /></div> : <>{ing.prix.toFixed(2)} €</>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Unité</span><select className="border border-yellow-200 rounded px-2 py-1 text-sm" value={editInlineForm.unite} onChange={e => setEditInlineForm({ ...editInlineForm, unite: e.target.value as Unite })}>{UNITES.map(u => <option key={u}>{u}</option>)}</select></div> : ing.unite}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Quantité</span><input className="border border-yellow-200 rounded px-2 py-1 text-sm w-16 text-right" type="number" step="0.01" min="0.01" value={editInlineForm.quantite} onChange={e => setEditInlineForm({ ...editInlineForm, quantite: e.target.value })} /></div> : <>{(() => { const q = (ing as any).quantite || (ing as any).nbKg || (ing as any).nbPieces || 1; return q !== 1 ? q : <span className="text-gray-300">1</span>; })()}</>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-yellow-600">
                        {(ing.prix / ((ing as any).quantite || (ing as any).nbKg || (ing as any).nbPieces || 1) / ing.rendement).toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-sm">
                        {(() => {
                        const date = new Date(ing.updatedAt);
                        const jours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                        const label = date.toLocaleDateString('fr-FR');
                        return <span className={jours > 30 ? 'text-red-500 font-semibold' : 'text-gray-400'}>{label}{jours > 30 ? ' ⚠️' : ''}</span>;
                        })()}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                        {!isEditing && (() => {
                        const hist = (ing.historiquesPrix || []).slice().sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const last = hist[hist.length - 1];
                        const prev = hist[hist.length - 2];
                        const trend = prev && last ? (last.prix > prev.prix ? '↑' : last.prix < prev.prix ? '↓' : '→') : null;
                        const trendColor = trend === '↑' ? 'text-red-500' : trend === '↓' ? 'text-green-500' : 'text-gray-400';
                        return trend ? (
                            <button onClick={() => setHistoId(histoId === ing.id ? null : ing.id)}
                            className={`font-bold text-sm ${trendColor} hover:opacity-70`} title="Voir historique">
                            {trend}
                            </button>
                        ) : null;
                        })()}
                        {!isEditing && (
                          <>
                            <button onClick={() => handleEdit(ing)} className="text-gray-400 hover:text-yellow-500" title="Modifier">✏️</button>
                            <button onClick={() => handleDelete(ing.id)} className="text-gray-400 hover:text-red-500" title="Supprimer">🗑️</button>
                          </>
                        )}
                        </div>
                    </td>
                    </tr>
                    );
                })}
                {histoId && filtered.find(i => i.id === histoId) && (
                    <tr key={histoId + '-histo'}>
                    <td colSpan={9} className="px-4 py-3 bg-yellow-50">
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
                {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Aucun ingrédient</td></tr>}
                </tbody>
            </table>
            </div>
        )}
        </div>
    );
    }