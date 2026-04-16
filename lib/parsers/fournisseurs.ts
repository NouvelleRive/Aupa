// Parsers PDF côté Node pour les factures fournisseurs.
// Versions purify de ceux de app/produits-fournisseurs/page.tsx — prennent un
// Buffer et retournent les lignes parsées, sans écrire dans Firestore.

export type LigneFacture = {
  code: string;
  nom: string;
  prix: number;        // prix unitaire HT
  date: string;        // ISO
  qte: number;         // quantité totale (unités)
  unite?: string;      // optionnel (Foodflow le retourne)
};

export type LigneAssembleurs = {
  nom: string;
  ingredient: string;  // ingrédient mappé (Vin rouge, Vin blanc...)
  prix: number;
  qte: number;         // nombre de fûts (chaque fût = 20L)
  date: string;
};

// Pdfjs Node-compat. On l'importe dynamiquement pour éviter le bundling client.
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

type PdfItem = { str: string; x: number; y: number };

// Ouvre un PDF et retourne, pour chaque page, les rows triées de haut en bas
// (chaque row = liste de strings triées de gauche à droite).
async function extractRows(buffer: Buffer): Promise<{ rows: string[][]; firstPageDate: string }> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;

  let firstPageDate = new Date().toISOString();
  const allRows: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items: PdfItem[] = (content.items as any[])
      .map((it: any) => ({
        str: (it.str || '').trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
      }))
      .filter((it) => it.str);

    if (i === 1) {
      for (const it of items) {
        const m = it.str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          firstPageDate = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString();
          break;
        }
      }
    }

    // Grouper par Y (±3px)
    const rows = new Map<number, PdfItem[]>();
    for (const it of items) {
      let attached = false;
      for (const [ky, arr] of rows) {
        if (Math.abs(it.y - ky) <= 3) { arr.push(it); attached = true; break; }
      }
      if (!attached) rows.set(it.y, [it]);
    }

    const sorted = Array.from(rows.entries())
      .sort(([a], [b]) => b - a)
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x).map((it) => it.str));

    allRows.push(...sorted);
  }

  return { rows: allRows, firstPageDate };
}

// ============================================================================
// FOODFLOW — codes FF-xxxx ou FM-xxxx
// ============================================================================
export async function parseFoodflowPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;

  let firstPageDate = new Date().toISOString();
  const lignes: LigneFacture[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items: { str: string; x: number; y: number }[] = (content.items as any[])
      .map((it: any) => ({
        str: (it.str || '').trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
      }))
      .filter((it) => it.str);

    // Extraire la date depuis la première page
    if (i === 1) {
      for (const it of items) {
        const m = it.str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m) {
          firstPageDate = new Date(`${m[3]}-${m[2]}-${m[1]}`).toISOString();
          break;
        }
      }
    }

    // Grouper par Y (±3px) pour avoir les lignes du tableau
    const rowMap = new Map<number, typeof items>();
    for (const it of items) {
      let attached = false;
      for (const [ky, arr] of rowMap) {
        if (Math.abs(it.y - ky) <= 3) { arr.push(it); attached = true; break; }
      }
      if (!attached) rowMap.set(it.y, [it]);
    }

    // Trier les rows de haut en bas, items de gauche à droite
    const rows = Array.from(rowMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x));

    for (const row of rows) {
      // Chercher un code FF/FM au début de la row
      const firstItem = row[0]?.str || '';
      const codeMatch = firstItem.match(/^(FF-\d+|FM-\d+)(?:\s+(.*))?$/);
      if (!codeMatch) continue;

      const code = codeMatch[1];
      const nomStart = codeMatch[2] || '';

      // Reconstruire tout le texte de la row
      const allText = row.map(r => r.str).join(' ');

      // Extraire le total HT (dernier montant en €)
      const euroMatches = allText.match(/(\d+[.,]\d+)\s*€/g);
      if (!euroMatches || euroMatches.length === 0) continue;
      const totalStr = euroMatches[euroMatches.length - 1];
      const total = parseFloat(totalStr.replace(/\s/g, '').replace(',', '.').replace('€', ''));

      // Extraire la quantité — premier nombre après le nom
      // La qté est dans la colonne QUANTITÉ (x~380-390) ou collée avec le prix
      let qte = 1;
      let prix = 0;
      let unite = 'p';

      // Chercher les items numériques dans la row (x > 350 = zone données)
      for (const item of row) {
        if (item.x < 350) continue;
        const s = item.str.replace(',', '.');

        // "12,00" ou "5,00" (qté seule)
        const qteOnly = s.match(/^(\d+\.\d+)$/);
        if (qteOnly) {
          qte = parseFloat(qteOnly[1]);
          continue;
        }

        // "2,00 10,06 € TVA vente 5.5%" (qté + prix collés)
        const qtePrix = s.match(/^(\d+[.,]\d+)\s+(\d+[.,]\d+)\s*€/);
        if (qtePrix) {
          qte = parseFloat(qtePrix[1].replace(',', '.'));
          prix = parseFloat(qtePrix[2].replace(',', '.'));
          continue;
        }

        // "0,98 € TVA vente 5.5%" (prix unitaire)
        const prixMatch = s.match(/^(\d+[.,]\d+)\s*€/);
        if (prixMatch && prix === 0) {
          prix = parseFloat(prixMatch[1].replace(',', '.'));
          continue;
        }
      }

      // Si on a un total mais pas de prix, calculer le prix unitaire
      if (total > 0 && prix === 0 && qte > 0) {
        prix = total / qte;
      }
      // Si on a un prix mais que le total ne colle pas, utiliser le total
      if (total > 0 && qte > 0 && Math.abs(prix * qte - total) > 0.1) {
        prix = total / qte;
      }

      // Extraire le nom : texte entre le code et la zone numérique
      const nomParts: string[] = [];
      if (nomStart) nomParts.push(nomStart);
      for (const item of row) {
        if (item.x <= 29 || item.x >= 350) continue; // skip code et données
        nomParts.push(item.str);
      }
      const nom = nomParts.join(' ').trim();

      if (total > 0 && nom && nom !== 'Fidélité') {
        lignes.push({ code, nom, prix, date: firstPageDate, qte, unite });
      }
    }
  }

  return lignes;
}

// ============================================================================
// MILLIET — codes 3-5 chiffres, format tableau colonné
// ============================================================================
export async function parseMillietPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const { rows, firstPageDate } = await extractRows(buffer);
  const lignes: LigneFacture[] = [];

  for (const row of rows) {
    const articleIdx = row.findIndex((s) => /^\d{3,5}$/.test(s));
    if (articleIdx < 0) continue;
    const code = row[articleIdx];

    const colisMatch = row[0]?.match(/^(\d+)$/);
    const colis = colisMatch ? parseInt(colisMatch[1]) : 1;
    const condMatch = row[1]?.match(/^x(\d+)$/i);
    const cond = condMatch ? parseInt(condMatch[1]) : 1;
    const qte = colis * cond;

    const nomParts = row.slice(3, articleIdx);
    const nom = nomParts.join(' ');
    if (!nom) continue;

    const afterArticle = row.slice(articleIdx + 1);
    const tvaRates = new Set([5.5, 20, 5.50, 20.00]);
    const numbers: number[] = [];
    for (let idx = 0; idx < afterArticle.length; idx++) {
      const s = afterArticle[idx].replace(/\s/g, '').replace(',', '.');
      if (!/^\d+\.?\d*$/.test(s)) continue;
      const n = parseFloat(s);
      const next = afterArticle[idx + 1] || '';
      if (tvaRates.has(n) && (next === '%' || next.includes('%'))) continue;
      numbers.push(n);
    }
    if (numbers.length < 1) continue;
    const totalHT = numbers[numbers.length - 1];
    const prixUnitaire = totalHT / (qte || 1);

    lignes.push({ code, nom, prix: prixUnitaire, date: firstPageDate, qte });
  }
  return lignes;
}

// ============================================================================
// LBA — codes 4 chiffres, format colonné avec CDT (FUT/UNITE/CAISSE/...)
// ============================================================================
export async function parseLBAPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const { rows, firstPageDate } = await extractRows(buffer);
  const lignes: LigneFacture[] = [];

  let stopParsing = false;
  for (const row of rows) {
    const joined = row.join(' ');
    if (joined.toLowerCase().includes('ci-dessous') || joined.toLowerCase().includes('déconsigne sur facture')) {
      stopParsing = true;
      continue;
    }
    if (stopParsing) continue;

    if (!/^\d{4}$/.test(row[0])) continue;
    const code = row[0];

    const cdtValues = ['FUT', 'UNITE', 'CAISSE', 'CARTON', 'PACK', 'PAK'];
    const cdtIdx = row.findIndex((s, idx) => idx > 0 && cdtValues.includes(s.toUpperCase()));

    let nom = '';
    const nomEnd = cdtIdx > 0 ? cdtIdx : row.length;
    for (let j = 1; j < nomEnd; j++) {
      if (/^\d/.test(row[j])) break;
      nom += (nom ? ' ' : '') + row[j];
    }
    if (!nom) continue;
    if (cdtIdx > 0) nom += ' ' + row[cdtIdx];

    const numStart = cdtIdx > 0 ? cdtIdx + 1 : 2;
    const nums: number[] = [];
    for (let j = numStart; j < row.length; j++) {
      const s = row[j].replace(/\s/g, '').replace(',', '.').replace('%', '');
      if (/^\d+\.?\d*$/.test(s)) nums.push(parseFloat(s));
    }

    const cols = nums[1] || 1;
    if (nums.length < 3) continue;

    let tvaIdx = -1;
    for (let j = 0; j < nums.length; j++) {
      if ((nums[j] === 20 || nums[j] === 5.5) && j >= 2) { tvaIdx = j; break; }
    }
    if (tvaIdx < 2) continue;

    const pxUNet = nums[tvaIdx - 2];
    if (pxUNet <= 0) continue;
    const droits = (tvaIdx + 1 < nums.length) ? nums[tvaIdx + 1] : 0;
    const prixReel = pxUNet + droits;

    lignes.push({ code, nom, prix: prixReel, date: firstPageDate, qte: cols });
  }
  return lignes;
}

// ============================================================================
// MPF — refs format "DEN 03 - Nom produit ..."
// ============================================================================
export async function parseMPFPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const { rows, firstPageDate } = await extractRows(buffer);
  const lignes: LigneFacture[] = [];

  for (const row of rows) {
    const joined = row.join(' ');
    const refMatch = joined.match(/^([A-Z]{3,4}\s\d{2})\s*-\s*(.+?)\s+(\d+)\s+(\d+[.,]\d+)\s*€\s+(\d+[.,]\d+)\s*€/);
    if (!refMatch) continue;
    const code = refMatch[1].replace(/\s/g, '');
    const nom = refMatch[2].trim();
    const colis = parseInt(refMatch[3]);
    const prixUnit = parseFloat(refMatch[4].replace(',', '.'));
    const montant = parseFloat(refMatch[5].replace(',', '.'));
    if (montant <= 0 || colis <= 0) continue;
    lignes.push({ code, nom: `${code} ${nom}`, prix: prixUnit, qte: colis, date: firstPageDate });
  }
  return lignes;
}

// ============================================================================
// LES ASSEMBLEURS — mapping par mots-clés vers ingrédients connus
// ============================================================================
const ASSEMBLEURS_MAP: Record<string, string> = {
  'chardonnay': 'Vin blanc',
  'cotes-du-rhone rouge': 'Vin rouge',
  'cotes du rhone rouge': 'Vin rouge',
  'frizzante': 'Frizzante',
  'rose': 'Vin rosé',
};

export async function parseAssembleursPDF(buffer: Buffer): Promise<LigneAssembleurs[]> {
  const { rows, firstPageDate } = await extractRows(buffer);
  const items = rows.flat();
  const lignes: LigneAssembleurs[] = [];

  for (let j = 0; j < items.length; j++) {
    const nomLigne = items[j];
    const nomLower = nomLigne.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchedKey = Object.keys(ASSEMBLEURS_MAP).find((k) => nomLower.includes(k));
    if (!matchedKey) continue;

    let qte = 0, prix = 0;
    for (let k = j + 1; k < Math.min(j + 6, items.length); k++) {
      const val = items[k].replace(',', '.').replace(/\s/g, '');
      const num = parseFloat(val);
      if (isNaN(num)) continue;
      if (qte === 0) qte = num;
      else if (val.includes('€') || (num > qte && prix === 0)) { prix = num; break; }
    }

    if (prix > 0 && qte > 0) {
      lignes.push({
        nom: nomLigne,
        ingredient: ASSEMBLEURS_MAP[matchedKey],
        prix,
        qte,
        date: firstPageDate,
      });
    }
  }
  return lignes;
}
