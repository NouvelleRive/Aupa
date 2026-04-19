// Debug : inspecter les checkboxes de la page statistiques Popina
import { chromium } from 'playwright';
import { config } from 'dotenv';

config({ path: '.env.local' });

const ESTAB = '26798';
const BASE = `https://backoffice.popina.com/fr/dashboard/establishment/${ESTAB}`;

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

  // Aller sur la page stats pour un jour spécifique
  await page.goto(`${BASE}/statistics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  // Set date to Oct 4 2025
  await page.evaluate(() => {
    const start = document.getElementById('date_start') as HTMLInputElement;
    const end = document.getElementById('date_end') as HTMLInputElement;
    if (start && end) {
      start.value = '04.10.2025';
      end.value = '04.10.2025';
      const form = start.closest('form');
      if (form) form.submit();
    }
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000);

  // Trouver toutes les checkboxes sur la page
  const checkboxes = await page.evaluate(() => {
    const results: any[] = [];
    // Input type=checkbox
    document.querySelectorAll('input[type="checkbox"]').forEach(el => {
      const inp = el as HTMLInputElement;
      const label = inp.closest('label')?.textContent?.trim() ||
                    inp.parentElement?.textContent?.trim() || '';
      results.push({
        type: 'input-checkbox',
        id: inp.id,
        name: inp.name,
        checked: inp.checked,
        label: label.slice(0, 80),
        class: inp.className,
        parentClass: inp.parentElement?.className || '',
      });
    });
    // Aussi chercher des éléments avec class checkbox ou checked
    document.querySelectorAll('[class*="check"], [class*="toggle"]').forEach(el => {
      const htmlEl = el as HTMLElement;
      results.push({
        type: 'class-check',
        tag: htmlEl.tagName,
        class: htmlEl.className.slice(0, 100),
        text: htmlEl.textContent?.trim().slice(0, 80) || '',
        checked: htmlEl.classList.contains('checked') || htmlEl.classList.contains('active'),
      });
    });
    return results;
  });

  console.log(`=== ${checkboxes.length} checkboxes/toggle trouvés ===\n`);
  for (const cb of checkboxes) {
    console.log(JSON.stringify(cb));
  }

  // Chercher spécifiquement dans la section statistiques produits
  const statsSection = await page.evaluate(() => {
    // Chercher le texte "Statistiques produits" et examiner la section
    const allElements = document.querySelectorAll('*');
    let section: Element | null = null;
    for (const el of allElements) {
      if (el.textContent?.includes('Statistiques produits') && el.children.length < 5) {
        section = el.closest('div') || el.parentElement;
        break;
      }
    }
    if (!section) return 'Section non trouvée';

    // Lister tous les éléments interactifs dans cette section
    const items: string[] = [];
    const parent = section.parentElement || section;
    parent.querySelectorAll('input, button, [role="checkbox"], label, span').forEach(el => {
      const htmlEl = el as HTMLElement;
      items.push(`<${htmlEl.tagName} class="${htmlEl.className}" id="${htmlEl.id}"> ${htmlEl.textContent?.trim().slice(0, 50)}`);
    });
    return items.join('\n');
  });

  console.log('\n=== Section statistiques produits ===');
  console.log(statsSection);

  await browser.close();
}

main().catch(console.error);
