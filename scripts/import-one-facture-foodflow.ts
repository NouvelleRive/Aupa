// Télécharge UNE facture Foodflow, la parse et importe dans Firestore
import { chromium } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import * as fs from 'fs';

config({ path: '.env.local' });

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);

// Réutilise le parser existant
import { parseFoodflowPDF } from '../lib/parsers/fournisseurs';
import { upsertLignesFournisseur } from '../lib/parsers/upsertFournisseur';

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
  console.log('Connecté');

  // Aller sur les commandes
  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Ouvrir le détail de la 1ère commande (chevron >)
  const chevrons = await page.$$('button:has(svg.lucide-chevron-right)');
  if (chevrons.length === 0) { console.log('Pas de chevron trouvé'); await browser.close(); return; }

  console.log('Ouverture du détail de la 1ère commande...');
  await chevrons[0].click();
  await page.waitForTimeout(3000);

  // Cliquer "Télécharger la facture"
  const factureLink = await page.$('a:has-text("Télécharger la facture")');
  if (!factureLink) { console.log('"Télécharger la facture" non trouvé'); await browser.close(); return; }

  const popupPromise = context.waitForEvent('page', { timeout: 10000 });
  await factureLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded').catch(() => {});

  const pdfUrl = popup.url();
  console.log('URL facture:', pdfUrl);

  // Télécharger le PDF
  const resp = await page.request.get(pdfUrl);
  const buf = Buffer.from(await resp.body());
  console.log('PDF:', buf.length, 'bytes');
  await popup.close().catch(() => {});
  await browser.close();

  // Parser avec le parser existant
  console.log('\nParsing...');
  const lignes = await parseFoodflowPDF(buf);
  console.log(`${lignes.length} lignes parsées`);
  for (const l of lignes) {
    console.log(`  ${l.code} ${l.nom.slice(0, 40).padEnd(40)} qté=${l.qte} prix=${l.prix}€ total=${(l.prix * l.qte).toFixed(2)}€`);
  }

  if (lignes.length === 0) {
    console.log('Rien à importer');
    return;
  }

  // Import dans Firestore via upsert existant
  console.log('\nImport Firestore...');
  const result = await upsertLignesFournisseur('Foodflow', lignes);
  console.log(`Créés: ${result.created}, MAJ: ${result.updated}, Achats: ${result.achatsCreated}`);
  console.log('Done!');
}

main().catch(console.error);
