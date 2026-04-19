// Test : force les dates via JS + trigger le submit du form
import { chromium } from 'playwright';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';

config({ path: '.env.local' });

const ESTAB = '26798';
const BASE = `https://backoffice.popina.com/fr/dashboard/establishment/${ESTAB}`;
const OUT = path.join(__dirname, '../tmp-popina-daily');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  console.log('Login...');
  await page.goto('https://backoffice.popina.com/fr/session/index');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.fill('#email', process.env.POPINA_EMAIL!);
  await page.fill('#password', process.env.POPINA_PASSWORD!);
  await page.click('#button_arrow');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  console.log('Connecté\n');

  await page.goto(`${BASE}/statistics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  for (const day of ['02.03.2026', '15.04.2026']) {
    console.log(`=== ${day} ===`);

    // Forcer la valeur via JS et soumettre le form
    await page.evaluate((d: string) => {
      const start = document.getElementById('date_start') as HTMLInputElement;
      const end = document.getElementById('date_end') as HTMLInputElement;
      if (start && end) {
        start.value = d;
        end.value = d;
        // Déclencher les événements
        start.dispatchEvent(new Event('input', { bubbles: true }));
        start.dispatchEvent(new Event('change', { bubbles: true }));
        end.dispatchEvent(new Event('input', { bubbles: true }));
        end.dispatchEvent(new Event('change', { bubbles: true }));
        // Soumettre le formulaire parent
        const form = start.closest('form');
        if (form) form.submit();
      }
    }, day);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(5000);

    // Vérifier
    const start = await page.$eval('#date_start', (el: any) => el.value);
    const end = await page.$eval('#date_end', (el: any) => el.value);
    const bodyText = await page.textContent('body') || '';
    const joursMatch = bodyText.match(/\b(\d+)\s*jours?\b/);
    console.log(`  Dates: ${start} → ${end}`);
    console.log(`  Jours: ${joursMatch ? joursMatch[0] : '?'}`);

    // Télécharger export simplifié
    const [dd, mm, yyyy] = day.split('.');
    const filePath = path.join(OUT, `simplified-${yyyy}-${mm}-${dd}.xlsx`);
    try {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#export_stocks_button'),
      ]);
      await dl.saveAs(filePath);

      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
      console.log(`  Lignes: ${rows.length}`);

      const crogers = rows.filter((r: any) => /bourguignon/i.test(JSON.stringify(r)));
      const totalQty = crogers.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
      console.log(`  Croger bourguignon: qté=${totalQty}`);
    } catch (e: any) {
      console.log(`  Erreur: ${e.message.slice(0, 80)}`);
    }
    console.log('');
  }

  await browser.close();
}

main().catch(console.error);
