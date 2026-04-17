import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
config({ path: '.env.local' });

const PDF_DIR = path.join(__dirname, '../tmp-foodflow-pdfs');

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.goto('https://foodflow.com/shop/mon-compte');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const btn = await page.$('text=Se connecter');
  if (btn) { await btn.click(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(2000); }
  await page.fill('input[name="email"]', process.env.FOODFLOW_EMAIL!);
  await page.fill('input[name="password"]', process.env.FOODFLOW_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté');

  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Ouvrir le détail de la 1ère commande via chevron
  const chevrons = await page.$$('button:has(svg.lucide-chevron-right)');
  await chevrons[0].click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // Cliquer "Télécharger la facture" (le lien <a>)
  const factureLink = await page.$('a:has-text("Télécharger la facture")');
  if (!factureLink) { console.log('Lien facture non trouvé'); await browser.close(); return; }

  const popupPromise = context.waitForEvent('page', { timeout: 10000 });
  await factureLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => {});

  const pdfUrl = popup.url();
  console.log('URL facture:', pdfUrl);

  // Télécharger
  const resp = await page.request.get(pdfUrl);
  const buf = Buffer.from(await resp.body());
  fs.writeFileSync(path.join(PDF_DIR, 'test-vraie-facture.pdf'), buf);
  console.log('Taille:', buf.length, 'bytes');
  await popup.close().catch(() => {});

  // Parser pour vérifier le contenu
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, useSystemFonts: false }).promise;
  console.log('Pages:', pdf.numPages);
  const p1 = await pdf.getPage(1);
  const content = await p1.getTextContent();
  const items = (content.items as any[]).map((it: any) => it.str).filter(Boolean);
  console.log('Premiers items:');
  for (let i = 0; i < Math.min(30, items.length); i++) console.log(`  ${i}: ${items[i]}`);

  // Aussi tester: cliquer "Télécharger le bon de livraison" pour comparer
  const blLink = await page.$('button:has-text("Télécharger le bon de livraison")');
  if (blLink) {
    const popupBL = await Promise.all([context.waitForEvent('page', { timeout: 10000 }), blLink.click()]).then(([p]) => p);
    await popupBL.waitForLoadState('domcontentloaded').catch(() => {});
    console.log('\nURL BL:', popupBL.url());
    await popupBL.close().catch(() => {});
  }

  await browser.close();
}

main().catch(console.error);
