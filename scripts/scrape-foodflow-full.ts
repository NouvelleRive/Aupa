// Scrape TOUTES les factures Foodflow et importe dans Firestore
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { parseFoodflowPDF } from '../lib/parsers/fournisseurs';
import { upsertLignesFournisseur } from '../lib/parsers/upsertFournisseur';

config({ path: '.env.local' });

const EMAIL = process.env.FOODFLOW_EMAIL!;
const PASSWORD = process.env.FOODFLOW_PASSWORD!;

async function main() {
  console.log('Lancement (ne pas fermer la fenêtre)...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
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

  await page.goto('https://foodflow.com/shop/mon-compte/commandes');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const bodyText = await page.textContent('body') || '';
  const totalMatch = bodyText.match(/sur (\d+) résultats/);
  const totalResults = totalMatch ? parseInt(totalMatch[1]) : 689;
  const totalPages = Math.ceil(totalResults / 10);
  console.log(`${totalResults} commandes sur ${totalPages} pages\n`);

  let totalLignes = 0;
  let totalAchats = 0;
  let factures = 0;
  let errors: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (pageNum > 1) {
      // Revenir sur la page commandes si on n'y est plus
      if (!page.url().includes('commandes')) {
        await page.goto('https://foodflow.com/shop/mon-compte/commandes');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }

      // Pagination
      await page.evaluate((num) => {
        const buttons = document.querySelectorAll('button, a');
        for (const b of buttons) {
          if (b.textContent?.trim() === String(num)) { (b as HTMLElement).click(); return; }
        }
        for (const b of buttons) {
          if ((b.getAttribute('aria-label') || b.textContent || '').includes('next') || b.textContent?.trim() === '>') {
            (b as HTMLElement).click(); return;
          }
        }
      }, pageNum);
      await page.waitForTimeout(2500);
    }

    // Compter les chevrons (1 par commande qui a un détail)
    const chevrons = await page.$$('button:has(svg.lucide-chevron-right)');
    const numOrders = chevrons.length;

    for (let i = 0; i < numOrders; i++) {
      try {
        // Re-chercher les chevrons car le DOM change après chaque clic
        const currentChevrons = await page.$$('button:has(svg.lucide-chevron-right)');
        if (i >= currentChevrons.length) break;

        // Ouvrir le détail
        await currentChevrons[i].click();
        await page.waitForTimeout(2000);

        // Chercher "Télécharger la facture"
        const factureLink = await page.$('a:has-text("Télécharger la facture")');
        if (!factureLink) {
          // Fermer le panel en cliquant ailleurs ou en appuyant Escape
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        // Cliquer et récupérer le popup
        const popup = await Promise.all([
          context.waitForEvent('page', { timeout: 10000 }),
          factureLink.click(),
        ]).then(([p]) => p);

        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        const pdfUrl = popup.url();

        // Télécharger le PDF
        const resp = await page.request.get(pdfUrl);
        const buf = Buffer.from(await resp.body());
        await popup.close().catch(() => {});

        if (buf.length < 500) {
          errors.push(`P${pageNum}#${i}: PDF trop petit (${buf.length}b)`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          continue;
        }

        // Parser
        const lignes = await parseFoodflowPDF(buf);
        if (lignes.length > 0) {
          const result = await upsertLignesFournisseur('Foodflow', lignes);
          totalLignes += lignes.length;
          totalAchats += result.achatsCreated;
          factures++;
        }

        // Fermer le panel
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      } catch (e: any) {
        errors.push(`P${pageNum}#${i}: ${e.message.slice(0, 60)}`);
        // Essayer de revenir à un état propre
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    if (pageNum % 5 === 0 || pageNum === totalPages) {
      console.log(`Page ${pageNum}/${totalPages} — ${factures} factures, ${totalLignes} lignes, ${totalAchats} achats`);
    }
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`Factures: ${factures}`);
  console.log(`Lignes: ${totalLignes}`);
  console.log(`Achats créés: ${totalAchats}`);
  console.log(`Erreurs: ${errors.length}`);
  if (errors.length > 0) console.log('Exemples:\n  ' + errors.slice(0, 10).join('\n  '));
  console.log('Done!');
}

main().catch(console.error);
