import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
const EMAIL = process.env.FOODFLOW_EMAIL!;
const PASSWORD = process.env.FOODFLOW_PASSWORD!;
if (!EMAIL || !PASSWORD) { console.error('FOODFLOW_EMAIL et FOODFLOW_PASSWORD requis'); process.exit(1); }

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);
const PDF_DIR = path.join(__dirname, '../tmp-foodflow-pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

type LigneFacture = { code: string; nom: string; prix: number; date: string; qte: number; unite?: string };

async function loadPdfjs() { return await import('pdfjs-dist/legacy/build/pdf.mjs'); }

async function parseFoodflowPDF(buffer: Buffer): Promise<LigneFacture[]> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), disableFontFace: true, useSystemFonts: false }).promise;
  let firstPageDate = new Date().toISOString().slice(0, 10);
  const allItems: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .map((it: any) => ({ str: (it.str || '').trim(), x: Math.round(it.transform[4]), y: Math.round(it.transform[5]) }))
      .filter((it: any) => it.str);
    if (i === 1) {
      for (const it of items) {
        const m = it.str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) { firstPageDate = `${m[3]}-${m[2]}-${m[1]}`; break; }
      }
    }
    const rows = new Map<number, typeof items>();
    for (const it of items) {
      let attached = false;
      for (const [ky, arr] of rows) { if (Math.abs(it.y - ky) <= 3) { arr.push(it); attached = true; break; } }
      if (!attached) rows.set(it.y, [it]);
    }
    for (const [, arr] of Array.from(rows.entries()).sort(([a], [b]) => b - a)) {
      allItems.push(...arr.sort((a, b) => a.x - b.x).map(it => it.str));
    }
  }
  const lignes: LigneFacture[] = [];
  for (let j = 0; j < allItems.length; j++) {
    const codeMatch = allItems[j].match(/^(FF-\d+|FM-\d+)$/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    let qte = 1, unite = 'p', prix = 0, qteIdx = -1;
    const nomParts: string[] = [];
    for (let k = j + 1; k < Math.min(j + 15, allItems.length); k++) {
      const qteMatch = allItems[k].match(/^(\d+[.,]\d+)\s*(kg|p|L|l)$/);
      if (qteMatch) { qte = parseFloat(qteMatch[1].replace(',', '.')); unite = qteMatch[2] === 'l' ? 'L' : qteMatch[2]; qteIdx = k; break; }
      nomParts.push(allItems[k]);
    }
    const nomComplet = nomParts.join(' ').trim();
    if (qteIdx >= 0) {
      for (let k = qteIdx + 1; k < Math.min(qteIdx + 5, allItems.length); k++) {
        const prixMatch = allItems[k].replace(',', '.').match(/^(-?\d+\.?\d*)\s*€/);
        if (prixMatch) { prix = parseFloat(prixMatch[1]); break; }
      }
    }
    if (prix !== 0 && nomComplet && nomComplet !== 'Fidélité') {
      lignes.push({ code, nom: nomComplet, prix, date: firstPageDate, qte, unite });
    }
  }
  return lignes;
}

async function upsertLignes(lignes: LigneFacture[]) {
  if (lignes.length === 0) return { created: 0, updated: 0, achatsCreated: 0 };
  lignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const existingSnap = await db.collection('produitsFournisseurs').get();
  const existing = existingSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  function detectUnite(nom: string) {
    const n = nom.toLowerCase();
    if (/\d+kg/.test(n)) return 'kg'; if (/\d+g[^r]/.test(n)) return 'g';
    if (/\d+l\b/.test(n)) return 'L'; if (n.includes('cl')) return 'cL'; return 'pièce';
  }
  function detectCategorie(nom: string) {
    const n = nom.toLowerCase();
    if (/poulet|porc|steak|jambon|veau|boeuf|échine|bourguignon|confit/.test(n)) return 'viande';
    if (/saumon|thon|cabillaud/.test(n)) return 'poisson';
    if (/lait|feta|cheddar|emmental|comté|fromage|oeuf|chèvre|beurre|crème/.test(n)) return 'laitage';
    if (/tomate|salade|carotte|poivron|champignon|avocat|menthe|patate|oignon|ail/.test(n)) return 'légume';
    if (/citron|orange|banane|pomme/.test(n)) return 'fruit'; return 'épicerie salée';
  }
  let created = 0, updated = 0;
  const parCode = new Map<string, LigneFacture[]>();
  for (const l of lignes) { if (!parCode.has(l.code)) parCode.set(l.code, []); parCode.get(l.code)!.push(l); }
  const pfIdParCode = new Map<string, string>();
  for (const [code, group] of parCode.entries()) {
    const derniere = group[group.length - 1];
    const match = existing.find((ing: any) => ing.foodflowCode === code);
    if (match) {
      pfIdParCode.set(code, match.id);
      const histExist = match.historiquesPrix || [];
      const datesExist = new Set(histExist.map((h: any) => h.date));
      const nouveaux = group.map(l => ({ date: l.date, prix: l.prix })).filter(h => !datesExist.has(h.date));
      if (nouveaux.length > 0) {
        await db.doc(`produitsFournisseurs/${match.id}`).update({
          prix: derniere.prix, historiquesPrix: [...histExist, ...nouveaux], updatedAt: nouveaux[nouveaux.length - 1].date,
        });
      }
      updated++;
    } else {
      const u = derniere.unite ? (derniere.unite === 'p' ? 'pièce' : derniere.unite) : detectUnite(derniere.nom);
      const mq = derniere.nom.match(/[xX]\s?(\d+)/);
      const q = derniere.unite ? derniere.qte : (mq ? parseInt(mq[1]) : 1);
      const ref = await db.collection('produitsFournisseurs').add({
        nom: derniere.nom, prix: derniere.prix, unite: u, categorie: detectCategorie(derniere.nom),
        rendement: 1, quantite: q, fournisseur: 'Foodflow', foodflowCode: code,
        historiquesPrix: group.map(l => ({ date: l.date, prix: l.prix })), updatedAt: derniere.date,
      });
      pfIdParCode.set(code, ref.id);
      created++;
    }
  }
  const achatsSnap = await db.collection('achats').get();
  const achatsExist = new Set(achatsSnap.docs.map(d => { const x = d.data(); return `${x.pfId}|${x.date}|${x.qte}`; }));
  let achatsCreated = 0;
  for (const l of lignes) {
    const pfId = pfIdParCode.get(l.code); if (!pfId) continue;
    const key = `${pfId}|${l.date}|${l.qte}`;
    if (achatsExist.has(key)) continue;
    await db.collection('achats').add({
      pfId, code: l.code, nom: l.nom, qte: l.qte, prixUnitaire: l.prix,
      total: l.prix * l.qte, date: l.date, fournisseur: 'Foodflow',
    });
    achatsExist.add(key); achatsCreated++;
  }
  return { created, updated, achatsCreated };
}

// ============================================================================
// SCRAPING — non-headless avec interception des popups
// ============================================================================
async function main() {
  console.log('Lancement (non-headless, ne pas fermer la fenêtre !)...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Login
  await page.goto('https://foodflow.com/shop/mon-compte');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const btn = await page.$('text=Se connecter');
  if (btn) { await btn.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2000); }
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté');

  // Réduire la fenêtre pour ne pas gêner
  await page.evaluate(() => window.resizeTo(400, 300));

  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const bodyText = await page.textContent('body') || '';
  const totalMatch = bodyText.match(/sur (\d+) résultats/);
  const totalResults = totalMatch ? parseInt(totalMatch[1]) : 689;
  const totalPages = Math.ceil(totalResults / 10);
  console.log(`${totalResults} commandes sur ${totalPages} pages`);

  let allLignes: LigneFacture[] = [];
  let pdfCount = 0;
  let errors: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (pageNum > 1) {
      await page.evaluate((num) => {
        const buttons = document.querySelectorAll('button, a');
        for (const b of buttons) {
          if (b.textContent?.trim() === String(num)) { (b as HTMLElement).click(); return; }
        }
        // Bouton suivant (>)
        for (const b of buttons) {
          if ((b.getAttribute('aria-label') || b.textContent || '').includes('next') || b.textContent?.trim() === '>') {
            (b as HTMLElement).click(); return;
          }
        }
      }, pageNum);
      await page.waitForTimeout(2500);
    }

    const downloadBtns = await page.$$('button:has(svg.lucide-download)');
    const numOrders = Math.floor(downloadBtns.length / 2);

    // Télécharger les FACTURES (index impair: 1, 3, 5...)
    for (let i = 1; i < downloadBtns.length; i += 2) {
      try {
        const popupPromise = context.waitForEvent('page', { timeout: 10000 });
        await downloadBtns[i].click();
        const popup = await popupPromise;

        await popup.waitForLoadState('domcontentloaded');
        const pdfUrl = popup.url();
        await popup.close();

        if (pdfUrl.includes('odoo') && pdfUrl.includes('pdf')) {
          const resp = await page.request.get(pdfUrl);
          const buf = Buffer.from(await resp.body());

          if (buf.length > 500) {
            fs.writeFileSync(path.join(PDF_DIR, `foodflow-${pdfCount + 1}.pdf`), buf);
            const lignes = await parseFoodflowPDF(buf);
            if (lignes.length > 0) {
              allLignes.push(...lignes);
              if (pdfCount % 10 === 0) {
                console.log(`  [${pageNum}/${totalPages}] #${pdfCount + 1} ${lignes[0].date} — ${lignes.length} produits`);
              }
            }
            pdfCount++;
          }
        }
        await page.waitForTimeout(300);
      } catch (e: any) {
        errors.push(`P${pageNum}#${i}: ${e.message.slice(0, 60)}`);
      }
    }

    if (pageNum % 10 === 0) {
      console.log(`--- Page ${pageNum}/${totalPages} — ${pdfCount} PDFs, ${allLignes.length} lignes ---`);
    }
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`PDFs: ${pdfCount}`);
  console.log(`Lignes: ${allLignes.length}`);
  console.log(`Erreurs: ${errors.length}`);
  if (errors.length > 0) console.log('Exemples:\n  ' + errors.slice(0, 5).join('\n  '));

  const dates = [...new Set(allLignes.map(l => l.date))].sort();
  if (dates.length > 0) console.log(`Période: ${dates[0]} → ${dates[dates.length - 1]}`);

  if (allLignes.length > 0) {
    console.log('\nImport Firestore...');
    const r = await upsertLignes(allLignes);
    console.log(`Créés: ${r.created}, MAJ: ${r.updated}, Achats: ${r.achatsCreated}`);
  }
  console.log('Done!');
}

main().catch(console.error);
