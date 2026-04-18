// Scrape toutes les factures LBA depuis le site web et upsert dans Firestore
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { upsertLignesFournisseur } from '../lib/parsers/upsertFournisseur';
import type { LigneFacture } from '../lib/parsers/fournisseurs';

config({ path: '.env.local' });
const EMAIL = process.env.LBA_EMAIL!;
const PASSWORD = process.env.LBA_PASSWORD!;

// Extraire la contenance du nom (33CL, 1L, 1.5L, 20L, 1KG...)
function detectUnite(nom: string): string | undefined {
  const clMatch = nom.match(/(\d+)\s*CL/i);
  const lMatch = nom.match(/(\d+[.,]?\d*)\s*L(?:\b|$)/i);
  const kgMatch = nom.match(/(\d+[.,]?\d*)\s*KG/i);
  if (clMatch) return `${clMatch[1]}cL`;
  if (lMatch) return `${lMatch[1].replace(',', '.')}L`;
  if (kgMatch) return `${kgMatch[1].replace(',', '.')}kg`;
  return undefined;
}

const MOIS: Record<string, string> = {
  janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04',
  mai: '05', juin: '06', juillet: '07', août: '08', aout: '08',
  septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12',
};

function parseDate(text: string): string {
  const m = text.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (m && MOIS[m[2].toLowerCase()]) {
    return `${m[3]}-${MOIS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}T00:00:00.000Z`;
  }
  return new Date().toISOString();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login
  console.log('1. Login...');
  await page.goto('https://www.lba-boissons.fr/');
  await page.waitForLoadState('networkidle');
  await page.click('text=Connexion');
  await page.waitForTimeout(2000);
  await page.fill('input[name="email"][type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button:has-text("Se connecter")');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('  Connecté');

  // 2. Historique — récupérer la liste des factures
  console.log('2. Historique...');
  await page.goto('https://www.lba-boissons.fr/profil/mes-commandes', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);
  // Attendre que le tableau soit rendu
  await page.waitForSelector('table tr', { timeout: 15000 }).catch(() => console.log('  (timeout waiting for table)'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'tmp-lba-debug.png', fullPage: true });
  console.log('  URL:', page.url());
  console.log('  Screenshot: tmp-lba-debug.png');

  const factures = await page.$$eval('table tr', (rows) => {
    const result: { id: string; date: string }[] = [];
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 3) continue;
      const text = cells[1]?.textContent?.trim() || '';
      const dateText = cells[2]?.textContent?.trim() || '';
      const match = text.match(/Facture n°\s*(\d+)/);
      if (!match) continue;
      result.push({ id: match[1], date: dateText });
    }
    return result;
  });

  console.log(`  ${factures.length} factures trouvées`);

  let totalCreated = 0, totalUpdated = 0, totalAchats = 0;

  // 3. Pour chaque facture, scraper le détail
  for (const facture of factures) {
    console.log(`\n--- Facture ${facture.id} (${facture.date}) ---`);
    const dateISO = parseDate(facture.date);

    await page.goto(`https://www.lba-boissons.fr/profil/commande/${facture.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForSelector('tr[data-role="order-line"]', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Extraire les lignes depuis le HTML
    const lignesRaw = await page.$$eval('tr[data-role="order-line"]', (rows) => {
      return rows.map(row => {
        const qteAttr = row.getAttribute('data-quantity');
        const qte = parseInt(qteAttr || '0');

        // Code article depuis le lien /article/XXXX-nom
        const link = row.querySelector('td a[href*="/article/"]') as HTMLAnchorElement | null;
        const href = link?.href || '';
        const codeMatch = href.match(/\/article\/(\d+)-/);
        const code = codeMatch ? codeMatch[1] : '';

        // Nom
        const nom = link?.textContent?.trim() || '';

        // Conditionnement
        const packSpan = row.querySelector('.order-product-line-packaging span');
        const packText = packSpan?.textContent?.trim() || '';
        const condMatch = packText.match(/(\d+)\s*unit/i);
        const cond = condMatch ? parseInt(condMatch[1]) : 1;

        // Prix unitaire net
        const puCell = row.querySelector('td[data-role="pu"]');
        const puText = puCell?.textContent?.trim() || '';
        const prix = parseFloat(puText.replace(/\s/g, '').replace(',', '.').replace('€', ''));

        return { code, nom, qte, cond, prix };
      });
    });

    const lignes: LigneFacture[] = [];
    for (const l of lignesRaw) {
      if (!l.code || !l.nom || l.qte <= 0 || isNaN(l.prix) || l.prix <= 0) continue;
      // Ignorer consignes, déconsignes, frais
      if (/consigne|caisse.*€|fût.*€/i.test(l.nom)) continue;

      const qteTotale = l.qte * l.cond;
      const unite = detectUnite(l.nom);

      lignes.push({
        code: l.code,
        nom: l.nom,
        prix: l.prix,
        qte: qteTotale,
        date: dateISO,
        unite,
      });
      console.log(`  ${l.code.padEnd(6)} | ${l.nom.slice(0, 45).padEnd(45)} | qté=${l.qte}x${l.cond}=${qteTotale} | ${l.prix.toFixed(2)}€ | ${unite || '-'}`);
    }

    if (lignes.length > 0) {
      const r = await upsertLignesFournisseur('LBA', lignes);
      console.log(`  → créés: ${r.created}, mis à jour: ${r.updated}, achats: ${r.achatsCreated}`);
      totalCreated += r.created;
      totalUpdated += r.updated;
      totalAchats += r.achatsCreated;
    }
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`Total: ${totalCreated} produits créés, ${totalUpdated} mis à jour, ${totalAchats} achats`);
}

main().catch(console.error);
