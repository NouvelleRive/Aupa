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
  const { rows, firstPageDate } = await extractRows(buffer);
  const lignes: LigneFacture[] = [];

  // Foodflow utilise un parsing item-par-item plutôt que row-based
  // On reconstruit une liste plate à partir des rows
  const items = rows.flat();

  for (let j = 0; j < items.length; j++) {
    const codeMatch = items[j].match(/^(FF-\d+|FM-\d+)$/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    let qte = 1, unite = 'p', prix = 0, qteIdx = -1;
    const nomParts: string[] = [];
    for (let k = j + 1; k < Math.min(j + 15, items.length); k++) {
      const qteMatch = items[k].match(/^(\d+[.,]\d+)\s*(kg|p|L|l)$/);
      if (qteMatch) {
        qte = parseFloat(qteMatch[1].replace(',', '.'));
        unite = qteMatch[2] === 'l' ? 'L' : qteMatch[2];
        qteIdx = k;
        break;
      }
      nomParts.push(items[k]);
    }
    const nomComplet = nomParts.join(' ').trim();
    if (qteIdx >= 0) {
      for (let k = qteIdx + 1; k < Math.min(qteIdx + 5, items.length); k++) {
        const prixMatch = items[k].replace(',', '.').match(/^(-?\d+\.?\d*)\s*€/);
        if (prixMatch) { prix = parseFloat(prixMatch[1]); break; }
      }
    }
    if (prix !== 0 && nomComplet && nomComplet !== 'Fidélité') {
      lignes.push({ code, nom: nomComplet, prix, date: firstPageDate, qte, unite });
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
