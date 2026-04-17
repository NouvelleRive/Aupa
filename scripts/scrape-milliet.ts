import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);
const PDF_DIR = path.join(__dirname, '../tmp-milliet-pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

// Réutiliser le parser Milliet existant
async function loadPdfjs() { return await import('pdfjs-dist/legacy/build/pdf.mjs'); }

type LigneFacture = { code: string; nom: string; prix: number; date: string; qte: number; unite?: string };

async function extractRows(buffer: Buffer) {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: false }).promise;
  let firstPageDate = new Date().toISOString().slice(0, 10);
  const rows: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as any[]).filter(it => it.str.trim());

    if (i === 1) {
      const allText = items.map(it => it.str).join(' ');
      const dateMatch = allText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (dateMatch) firstPageDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }

    const byY = new Map<number, { x: number; str: string }[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5]);
      const bucket = [...byY.keys()].find(k => Math.abs(k - y) < 3) ?? y;
      if (!byY.has(bucket)) byY.set(bucket, []);
      byY.get(bucket)!.push({ x: it.transform[4], str: it.str.trim() });
    }
    for (const [, cells] of [...byY.entries()].sort((a, b) => b[0] - a[0])) {
      rows.push(cells.sort((a, b) => a.x - b.x).map(c => c.str));
    }
  }
  return { rows, firstPageDate };
}

async function parseMillietPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const { rows, firstPageDate } = await extractRows(buffer);
  const lignes: LigneFacture[] = [];

  for (const row of rows) {
    const articleIdx = row.findIndex(s => /^\d{3,5}$/.test(s));
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

// Upsert Firestore (firebase-admin version)
async function upsertLignes(lignes: LigneFacture[]) {
  if (lignes.length === 0) return { created: 0, updated: 0, achatsCreated: 0 };

  lignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const existingSnap = await db.collection('produitsFournisseurs').get();
  const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  let created = 0, updated = 0;
  const parCode = new Map<string, LigneFacture[]>();
  for (const l of lignes) {
    if (!parCode.has(l.code)) parCode.set(l.code, []);
    parCode.get(l.code)!.push(l);
  }

  const pfIdParCode = new Map<string, string>();
  for (const [code, group] of parCode.entries()) {
    const derniere = group[group.length - 1];
    const match = existing.find((p: any) => p.millietCode === code);
    if (match) {
      pfIdParCode.set(code, match.id);
      const histExist = match.historiquesPrix || [];
      const datesExist = new Set(histExist.map((h: any) => h.date));
      const nouveaux = group.map(l => ({ date: l.date, prix: l.prix })).filter(h => !datesExist.has(h.date));
      if (nouveaux.length > 0) {
        await db.collection('produitsFournisseurs').doc(match.id).update({
          prix: derniere.prix,
          historiquesPrix: [...histExist, ...nouveaux],
          updatedAt: nouveaux[nouveaux.length - 1].date,
        });
      }
      updated++;
    } else {
      const ref = await db.collection('produitsFournisseurs').add({
        nom: derniere.nom,
        prix: derniere.prix,
        unite: 'pièce',
        categorie: 'boisson',
        rendement: 1,
        quantite: derniere.qte,
        fournisseur: 'Milliet',
        millietCode: code,
        historiquesPrix: group.map(l => ({ date: l.date, prix: l.prix })),
        updatedAt: derniere.date,
      });
      pfIdParCode.set(code, ref.id);
      created++;
    }
  }

  // Achats
  const achatsSnap = await db.collection('achats').get();
  const achatsExist = new Set(achatsSnap.docs.map(d => {
    const data = d.data();
    return `${data.pfId}|${data.date}|${data.qte}`;
  }));
  let achatsCreated = 0;
  for (const l of lignes) {
    const pfId = pfIdParCode.get(l.code);
    if (!pfId) continue;
    const key = `${pfId}|${l.date}|${l.qte}`;
    if (achatsExist.has(key)) continue;
    await db.collection('achats').add({
      pfId, code: l.code, nom: l.nom,
      qte: l.qte, prixUnitaire: l.prix, total: l.prix * l.qte,
      date: l.date, fournisseur: 'Milliet',
    });
    achatsCreated++;
  }

  return { created, updated, achatsCreated };
}

// ============================================================================
// SCRAPING
// ============================================================================
async function main() {
  console.log('Lancement scraper Milliet...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Login via ACCÈS CLIENT sur catalogue.milliet.fr
  await page.goto('https://catalogue.milliet.fr/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const accesBtn = page.locator('a, button', { hasText: /ACC[ÈE]S CLIENT/i }).first();
  if (await accesBtn.isVisible()) {
    await accesBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }

  console.log('URL login:', page.url());
  await page.fill('#TextBoxUser', '30013');
  await page.fill('#TextBoxPassword', 'TNE9431');
  await page.click('#ButtonLogin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté, URL:', page.url());

  // Screenshot de l'espace client
  await page.screenshot({ path: path.join(PDF_DIR, 'espace-client.png'), fullPage: true });

  // Chercher le lien Mes commandes
  const commandesLink = page.locator('a', { hasText: /commandes/i }).first();
  if (await commandesLink.isVisible()) {
    await commandesLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  }
  console.log('URL commandes:', page.url());

  await page.screenshot({ path: path.join(PDF_DIR, 'espace-commandes.png'), fullPage: true });

  let allLignes: LigneFacture[] = [];
  let pdfCount = 0;
  let errors: string[] = [];

  // Extraire les liens N° Facture (pattern: 1-25XXXXXX)
  const factureLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => /1-\d{8}/.test(a.textContent?.trim() || ''))
      .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }));
  });

  console.log(`${factureLinks.length} factures trouvées`);

  for (let i = 0; i < factureLinks.length; i++) {
    const link = factureLinks[i];
    process.stdout.write(`[${i + 1}/${factureLinks.length}] ${link.text}...`);

    try {
      // Le lien déclenche un téléchargement direct
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.locator(`a:has-text("${link.text}")`).click(),
      ]);

      const filePath = path.join(PDF_DIR, `milliet-${link.text}.pdf`);
      await download.saveAs(filePath);
      const buf = fs.readFileSync(filePath);
      const lignes = await parseMillietPDF(buf);
      allLignes.push(...lignes);
      pdfCount++;
      console.log(` ${lignes.length} produits${lignes.length > 0 ? ' (' + lignes[0].date + ')' : ''}`);
      await page.waitForTimeout(500);
    } catch (e: any) {
      console.log(` erreur: ${e.message.slice(0, 50)}`);
      errors.push(`${link.text}: ${e.message.slice(0, 60)}`);
    }
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`PDFs: ${pdfCount}`);
  console.log(`Lignes: ${allLignes.length}`);
  console.log(`Erreurs: ${errors.length}`);
  if (errors.length > 0) console.log('Exemples:\n  ' + errors.slice(0, 5).join('\n  '));

  if (allLignes.length > 0) {
    const dates = [...new Set(allLignes.map(l => l.date))].sort();
    console.log(`Période: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log('\nImport Firestore...');
    const r = await upsertLignes(allLignes);
    console.log(`Créés: ${r.created}, MAJ: ${r.updated}, Achats: ${r.achatsCreated}`);
  }
  console.log('Done!');
}

main().catch(console.error);
