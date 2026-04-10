    'use client';

    import { useState, useEffect, useRef } from 'react';
    import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
    import { db } from '@/lib/firebase';
    import { ProduitFournisseur, Unite, Categorie } from '@/lib/types';
    import { INGREDIENTS } from '@/lib/ingredient';

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
    const [histoId, setHistoId] = useState<string | null>(null);
    const [editInlineId, setEditInlineId] = useState<string | null>(null);
    const [editInlineForm, setEditInlineForm] = useState({ nom: '', prix: '', unite: 'kg' as Unite, categorie: 'épicerie' as Categorie, rendement: '100', quantite: '1' });
    const [showMatching, setShowMatching] = useState(false);
    const [searchMatch, setSearchMatch] = useState('');
    const [matchingItems, setMatchingItems] = useState<{
        ingredientIds: string[];
        ingredientNom: string;
        ingredientChoisi: string;
        recetteIds: string[];
        done: boolean;
    }[]>([]);
    const [ingredientsMap, setNomsXLMap] = useState<Map<string, string[]>>(new Map());
    const [ingredientParProduit, setNomsXLParIngredient] = useState<Record<string, string>>({});
    const [matchingMap, setMatchingMap] = useState<Map<string, string[]>>(new Map());

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

    const handleOpenMatching = async () => {
        const recSnap = await getDocs(collection(db, 'recettes'));
        const recettes = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const map = new Map<string, string[]>();
        for (const r of recettes) {
          for (const ing of (r.ingredients || [])) {
            if (ing.nomIngredient) {
              if (!map.has(ing.nomIngredient)) map.set(ing.nomIngredient, []);
              map.get(ing.nomIngredient)!.push(r.id);
            }
          }
          if (r.categorie === 'Préparations') {
            if (!map.has(r.nom)) map.set(r.nom, []);
            map.get(r.nom)!.push(r.id);
          }
        }
        setMatchingMap(map);
        const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
        const nomsXL = Array.from(map.keys());
        // Grouper par ingredient : un ingredient → plusieurs ingredientIds possibles
        const ingredientToItems = new Map<string, { ingredientIds: string[]; ingredientNom: string }>();
        for (const ing of ingredients) {
        const match = nomsXL.find(nom => normalize(ing.nom).includes(normalize(nom)) || normalize(nom).includes(normalize(ing.nom.split(' ')[0])));
        if (!match) continue;
        if (!ingredientToItems.has(match)) ingredientToItems.set(match, { ingredientIds: [], ingredientNom: match });
        ingredientToItems.get(match)!.ingredientIds.push(ing.id);
        }
        const items = Array.from(map.entries()).map(([ingredient, recetteIds]) => {
        const existing = ingredientToItems.get(ingredient);
        const dejaMatche = existing?.ingredientIds?.some(id => {
          const ing = ingredients.find(i => i.id === id);
          return ing && (ing as any).ingredient === ingredient;
        }) || false;
        return {
            ingredientIds: existing?.ingredientIds || [],
            ingredientNom: ingredient,
            ingredientChoisi: ingredient,
            recetteIds,
            done: dejaMatche,
        };
        });
        setMatchingItems(items);
        setShowMatching(true);
    };

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
        fetchIngredients();
    };

    const [filterCategorie, setFilterCategorie] = useState<string>('all');
    const [filterNonLie, setFilterNonLie] = useState(false);

    const handleDelete = async (id: string) => {
        if (!confirm('Supprimer cet ingrédient ?')) return;
        await deleteDoc(doc(db, 'produitsFournisseurs', id));
        fetchIngredients();
    };

    const filtered = ingredients
    .filter(i => i.nom.toLowerCase().includes(search.toLowerCase()))
    .filter(i => filterCategorie === 'all' || i.categorie === filterCategorie)
    .filter(i => !filterNonLie || !ingredientParProduit[i.id])
    .sort((a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom));

    if (showMatching) {
        const total = matchingItems.length;
        const done = matchingItems.filter(i => i.done).length;
        const ingredientsFiltres = ingredients
        .filter(ing => ing.nom.toLowerCase().includes(searchMatch.toLowerCase()))
        .filter(ing => matchingItems.some(m => m.ingredientIds.includes(ing.id) && !m.done))
        .sort((a, b) => a.nom.localeCompare(b.nom));
        return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-2xl font-bold">Matching produits fournisseur ↔ ingrédients</h1>
                <p className="text-sm text-gray-400 mt-1">{total} à matcher · {done} validés</p>
            </div>
            <button onClick={() => setShowMatching(false)} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">Fermer</button>
            </div>
            <input className="border border-yellow-200 rounded-lg px-3 py-2 text-sm mb-4 w-64 focus:outline-none focus:border-yellow-400" placeholder="Rechercher produit fournisseur..." value={searchMatch} onChange={e => setSearchMatch(e.target.value)} />
            <div className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-yellow-50 text-gray-500 text-xs uppercase">
                <tr>
                    <th className="px-4 py-2 text-left">Produit fournisseur</th>
                    <th className="px-4 py-2 text-left">Ingrédient</th>
                    <th className="px-4 py-2 text-right">Recettes</th>
                    <th className="px-4 py-2 text-center">Action</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-yellow-50">
                {ingredientsFiltres.map(ing => {
                    const item = matchingItems.find(m => m.ingredientIds.includes(ing.id));
                    if (!item || item.done) return null;
                    const realIdx = matchingItems.indexOf(item);
                    return (
                    <tr key={ing.id} className={`transition-colors ${item.ingredientChoisi ? 'bg-yellow-50' : 'bg-white'}`}>
                        <td className="px-4 py-2 font-medium text-sm">{ing.nom}</td>
                        <td className="px-4 py-2">
                        <select className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-full"
                            value={item.ingredientChoisi}
                            onChange={e => {
                            const nomChoisi = e.target.value;
                            setMatchingItems(prev => prev.map((m, i) => i === realIdx
                                ? { ...m, ingredientChoisi: nomChoisi, recetteIds: matchingMap.get(nomChoisi) || [] }
                                : m
                            ));
                            }}>
                            <option value="">— Non lié —</option>
                            {Array.from(matchingMap.keys()).sort().map(nom => <option key={nom} value={nom}>{nom}</option>)}
                        </select>
                        </td>
                        <td className="px-4 py-2 text-right text-gray-400 text-xs">{item.recetteIds.length} recette{item.recetteIds.length > 1 ? 's' : ''}</td>
                        <td className="px-4 py-2 text-center">
                        <button disabled={!item.ingredientChoisi} onClick={async () => {
                            if (!item.ingredientChoisi) return;
                            const recSnap = await getDocs(collection(db, 'recettes'));
                            for (const recDoc of recSnap.docs) {
                            const data = recDoc.data();
                            const ings = data.ingredients || [];
                            const hasMatch = ings.some((i: any) => i.nomIngredient === item.ingredientChoisi);
                            if (!hasMatch) continue;
                            const newIngs = ings.map((i: any) => {
                                if (i.nomIngredient !== item.ingredientChoisi) return i;
                                const existingIds = i.ingredientIds || (i.ingredientId ? [i.ingredientId] : []);
                                const mergedIds = [...new Set([...existingIds, ing.id])];
                                return { ingredientIds: mergedIds, grammage: i.grammage, nomIngredient: i.nomIngredient };
                            });
                            await updateDoc(doc(db, 'recettes', recDoc.id), { ingredients: newIngs });
                            }
                            await updateDoc(doc(db, 'produitsFournisseurs', ing.id), { ingredient: item.ingredientChoisi });
                            setMatchingItems(prev => prev.map((m, i) => i === realIdx ? { ...m, done: true } : m));
                        }}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${item.ingredientChoisi ? 'bg-green-500 border-green-500 text-white hover:bg-green-600' : 'border-gray-200 text-gray-300'}`}>
                            ✓
                        </button>
                        </td>
                    </tr>
                    );
                })}
                </tbody>
            </table>
            </div>
        </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Produits fournisseur</h1>
            <div className="flex gap-3">
            <button onClick={() => { setShowForm(!showForm); setForm(emptyForm); }} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                + Ajouter manuellement
            </button>
            <button onClick={() => pdfRef.current?.click()} disabled={importing} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                {importing ? importProgress || 'Import en cours...' : 'Importer factures Foodflow'}
            </button>
            <button onClick={handleOpenMatching} className="border border-yellow-400 text-yellow-600 hover:bg-yellow-50 font-semibold rounded-lg px-4 py-2 text-sm">
                Matcher recettes
            </button>
            <button onClick={() => millietRef.current?.click()} disabled={importing} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                {importing ? importProgress || 'Import en cours...' : 'Importer Milliet'}
            </button>
            <button onClick={() => lbaRef.current?.click()} disabled={importing} className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
                {importing ? importProgress || 'Import en cours...' : 'Importer LBA'}
            </button>
            <button onClick={() => fileRef.current?.click()} className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
                Importer Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportXL} />
            <input ref={pdfRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportPDF} />
            <input ref={millietRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportMilliet} />
            <input ref={lbaRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleImportLBA} />
            </div>
        </div>

        {showForm && (
            <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">Nouvel ingrédient</h2>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Nom" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} />
                <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" placeholder="Prix (€)" type="number" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} />
                <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.unite} onChange={e => setForm({ ...form, unite: e.target.value as Unite })}>
                {UNITES.map(u => <option key={u}>{u}</option>)}
                </select>
                <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm" value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value as Categorie })}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-20" placeholder="Quantité" type="number" step="0.01" min="0.01" value={form.quantite} onChange={e => setForm({ ...form, quantite: e.target.value })} title="Nb de pièces, kg ou L dans le colis" />
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
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Nom</span><input className="border border-yellow-200 rounded px-2 py-1 text-sm w-full" value={editInlineForm.nom} onChange={e => setEditInlineForm({ ...editInlineForm, nom: e.target.value })} /></div> : ing.nom}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                        {isEditing ? <div><span className="text-xs text-gray-400 block mb-1">Catégorie</span><select className="border border-yellow-200 rounded px-2 py-1 text-sm" value={editInlineForm.categorie} onChange={e => setEditInlineForm({ ...editInlineForm, categorie: e.target.value as Categorie })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div> : ing.categorie}
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
                          fetchIngredients();
                        }}>
                        <option value="">— Non lié —</option>
                        {Array.from(ingredientsMap.keys()).sort().map(nom => <option key={nom} value={nom}>{nom}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                        {(ing as any).fournisseur || (ing as any).foodflowCode ? 'Foodflow' : (ing as any).millietCode ? 'Milliet' : (ing as any).lbaCode ? 'LBA' : '—'}
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
                        {isEditing ? (
                          <>
                            <button onClick={handleSaveInline} className="text-green-500 hover:text-green-600 font-bold text-sm" title="Sauvegarder">✓</button>
                            <button onClick={() => setEditInlineId(null)} className="text-gray-400 hover:text-gray-600 font-bold text-sm" title="Annuler">✕</button>
                          </>
                        ) : (
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