// Test : exporter SEULEMENT Deliveroo pour octobre 2025
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
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

  // Set dates October 2025
  await page.evaluate(() => {
    const start = document.getElementById('date_start') as HTMLInputElement;
    const end = document.getElementById('date_end') as HTMLInputElement;
    if (start && end) {
      start.value = '01.10.2025';
      end.value = '31.10.2025';
      const form = start.closest('form');
      if (form) form.submit();
    }
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  // Lister toutes les checkboxes macro_names avec leur contexte
  const macros = await page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll<HTMLInputElement>('input[name="macro_names[]"]').forEach((cb, i) => {
      const tr = cb.closest('tr');
      const cells = tr?.querySelectorAll('td');
      const texts: string[] = [];
      cells?.forEach(c => texts.push(c.textContent?.trim() || ''));
      results.push({
        index: i,
        checked: cb.checked,
        value: cb.value,
        texts: texts.join(' | '),
      });
    });
    return results;
  });

  console.log(`${macros.length} checkboxes trouvées:`);
  for (const m of macros) {
    console.log(`  [${m.index}] ${m.checked ? '✅' : '⬜'} value="${m.value}" → ${m.texts}`);
  }

  // Chercher si "deliveroo" apparait quelque part dans les valeurs
  const deliverooIdx = macros.findIndex((m: any) =>
    m.value.toLowerCase().includes('deliveroo') ||
    m.texts.toLowerCase().includes('deliveroo')
  );
  console.log(`\nIndex Deliveroo: ${deliverooIdx}`);

  if (deliverooIdx < 0) {
    console.log('Deliveroo non trouvé dans les checkboxes !');
    console.log('\nRecherche "deliveroo" dans tout le HTML...');
    const html = await page.content();
    const lower = html.toLowerCase();
    const idx = lower.indexOf('deliveroo');
    if (idx >= 0) {
      console.log(`Trouvé à position ${idx}:`);
      console.log(html.slice(Math.max(0, idx - 200), idx + 300));
    } else {
      console.log('PAS trouvé dans le HTML du tout');
    }

    // Essayer aussi "Aupa - Croissant"
    const idx2 = lower.indexOf('croissant burger');
    if (idx2 >= 0) {
      console.log(`\n"croissant burger" trouvé à position ${idx2}:`);
      console.log(html.slice(Math.max(0, idx2 - 200), idx2 + 400));
    }
  } else {
    // Décocher tout sauf Deliveroo
    console.log('\nDécochage de tout sauf Deliveroo...');
    await page.evaluate((keepIdx: number) => {
      document.querySelectorAll<HTMLInputElement>('input[name="macro_names[]"]').forEach((cb, i) => {
        if (i === keepIdx && !cb.checked) cb.click();
        if (i !== keepIdx && cb.checked) cb.click();
      });
    }, deliverooIdx);
    await page.waitForTimeout(2000);

    // Screenshot
    await page.screenshot({ path: path.join(OUT, `deliveroo-only.png`), fullPage: true });

    // Export
    const filePath = path.join(OUT, `deliveroo-only.xlsx`);
    try {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#export_statistics_button'),
      ]);
      await dl.saveAs(filePath);

      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
      console.log(`\n${rows.length} lignes dans l'export Deliveroo`);
      let total = 0;
      for (const r of rows) total += r['TTC'] || r['total ttc'] || 0;
      console.log(`Total TTC: ${total.toFixed(2)} €`);

      // Premières lignes
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        console.log(JSON.stringify(rows[i]));
      }
    } catch (e: any) {
      console.log('Erreur export:', e.message);
    }
  }

  await browser.close();
}

main().catch(console.error);
