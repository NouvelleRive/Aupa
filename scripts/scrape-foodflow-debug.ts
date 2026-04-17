// Script de debug: comprendre l'API GraphQL Foodflow pour télécharger les PDFs
import { chromium } from 'playwright';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });
const EMAIL = process.env.FOODFLOW_EMAIL!;
const PASSWORD = process.env.FOODFLOW_PASSWORD!;

async function main() {
  // Non-headless pour que le popup s'ouvre
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // Intercepter TOUTES les requêtes GraphQL
  page.on('request', async req => {
    if (req.url().includes('graphql')) {
      const body = req.postData();
      if (body && body.includes('generateOrderAccessToken')) {
        console.log('\n=== GraphQL REQUEST ===');
        console.log(JSON.stringify(JSON.parse(body), null, 2));
      }
      if (body && (body.includes('order') || body.includes('Order'))) {
        const parsed = JSON.parse(body);
        if (!parsed.operationName?.includes('generateOrder')) {
          console.log(`\nGraphQL op: ${parsed.operationName}`);
        }
      }
    }
  });

  page.on('response', async resp => {
    if (resp.url().includes('graphql') && resp.url().includes('generateOrderAccessToken')) {
      const json = await resp.json().catch(() => null);
      console.log('\n=== GraphQL RESPONSE ===');
      console.log(JSON.stringify(json, null, 2));
    }
  });

  // Intercepter les popups
  context.on('page', async popup => {
    console.log('\n=== POPUP ===');
    console.log('URL:', popup.url());
    // Extraire le pattern d'URL
    const match = popup.url().match(/\/picking\/pdf\/(\d+)\?access_token=(.+)/);
    if (match) {
      console.log(`  pickingId: ${match[1]}`);
      console.log(`  token: ${match[2]}`);
    }
  });

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

  // Commandes
  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Extraire les données du tableau (IDs des commandes)
  const tableData = await page.evaluate(() => {
    const rows = document.querySelectorAll('tr, [role="row"]');
    const data: any[] = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, [role="cell"]');
      if (cells.length > 0) {
        data.push(Array.from(cells).map(c => c.textContent?.trim()));
      }
    });
    return data;
  });
  console.log('\nDonnées tableau:');
  for (const row of tableData.slice(0, 3)) console.log('  ', JSON.stringify(row));

  // Aussi extraire les props React / data attributes des boutons
  const btnData = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    const data: any[] = [];
    btns.forEach(b => {
      const svg = b.querySelector('svg.lucide-download');
      if (svg) {
        // Remonter pour trouver le contexte (row, etc)
        let parent = b.parentElement;
        let orderId = '';
        while (parent && !orderId) {
          // Chercher un data attribute ou un texte d'ID commande
          const text = parent.textContent || '';
          const match = text.match(/S\d{6}/);
          if (match) orderId = match[0];
          const attrs = Array.from(parent.attributes || []).map((a: any) => `${a.name}=${a.value}`);
          if (attrs.some(a => a.includes('order') || a.includes('S4'))) {
            data.push({ orderId, attrs });
            break;
          }
          parent = parent.parentElement;
        }
        data.push({ orderId, tag: b.closest('tr, div[class*="row"]')?.tagName });
      }
    });
    return data;
  });
  console.log('\nBoutons download context:', JSON.stringify(btnData.slice(0, 6), null, 2));

  // Cliquer sur le 1er bouton BL et capturer tout
  console.log('\n--- Clic sur le 1er BL ---');
  const downloadBtns = await page.$$('button:has(svg.lucide-download)');
  if (downloadBtns.length > 0) {
    await downloadBtns[0].click();
    await page.waitForTimeout(5000);
  }

  // Cliquer sur le 2ème bouton (FACTURE) aussi pour comparer
  console.log('\n--- Clic sur la 1ère FACTURE ---');
  if (downloadBtns.length > 1) {
    await downloadBtns[1].click();
    await page.waitForTimeout(5000);
  }

  await browser.close();
  console.log('\nDone');
}

main().catch(console.error);
