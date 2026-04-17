import { chromium } from 'playwright';
import { config } from 'dotenv';
import { parseFoodflowPDF } from '../lib/parsers/fournisseurs';
import { upsertLignesFournisseur } from '../lib/parsers/upsertFournisseur';

config({ path: '.env.local' });

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
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

  // Commandes → chevron → Télécharger la facture
  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const chevrons = await page.$$('button:has(svg.lucide-chevron-right)');
  if (chevrons.length === 0) { console.log('Pas de chevron'); await browser.close(); return; }

  await chevrons[0].click();
  await page.waitForTimeout(3000);

  const link = await page.$('a:has-text("Télécharger la facture")');
  if (!link) { console.log('"Télécharger la facture" non trouvé'); await browser.close(); return; }

  const popup = await Promise.all([context.waitForEvent('page', { timeout: 10000 }), link.click()]).then(([p]) => p);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});

  const resp = await page.request.get(popup.url());
  const buf = Buffer.from(await resp.body());
  await popup.close().catch(() => {});
  await browser.close();

  console.log('PDF:', buf.length, 'bytes');

  // Parser et import
  const lignes = await parseFoodflowPDF(buf);
  console.log(`${lignes.length} lignes parsées`);
  let total = 0;
  for (const l of lignes) {
    const t = l.prix * l.qte;
    total += t;
    console.log(`  ${l.code} ${l.nom.slice(0, 40).padEnd(40)} ${l.qte} × ${l.prix}€ = ${t.toFixed(2)}€`);
  }
  console.log(`Total: ${total.toFixed(2)}€`);

  if (lignes.length > 0) {
    console.log('\nImport Firestore...');
    const result = await upsertLignesFournisseur('Foodflow', lignes);
    console.log(`Créés: ${result.created}, MAJ: ${result.updated}, Achats: ${result.achatsCreated}`);
  }
}

main().catch(console.error);
