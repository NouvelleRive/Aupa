// Trouver quel filtre cache Deliveroo dans le headless
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

  // 1. TOUS les <select> avec toutes leurs options
  const allSelects = await page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll('select').forEach(sel => {
      const options: any[] = [];
      sel.querySelectorAll('option').forEach(opt => {
        options.push({
          value: (opt as HTMLOptionElement).value,
          text: opt.textContent?.trim(),
          selected: (opt as HTMLOptionElement).selected,
        });
      });
      results.push({
        id: sel.id,
        name: sel.name,
        class: sel.className,
        options,
      });
    });
    return results;
  });

  for (const s of allSelects) {
    console.log(`=== <select id="${s.id}" name="${s.name}"> ===`);
    for (const o of s.options) {
      console.log(`  ${o.selected ? '→' : ' '} "${o.text}" (value="${o.value}")`);
    }
    console.log('');
  }

  // 2. Tous les device_names checkboxes
  const devices = await page.evaluate(() => {
    const results: any[] = [];
    document.querySelectorAll<HTMLInputElement>('input[name="device_names[]"]').forEach(cb => {
      const label = cb.closest('label')?.textContent?.trim() || cb.parentElement?.textContent?.trim() || '';
      results.push({ value: cb.value, checked: cb.checked, label });
    });
    return results;
  });
  console.log('=== DEVICE NAMES ===');
  for (const d of devices) {
    console.log(`  ${d.checked ? '✅' : '⬜'} "${d.label}" (value="${d.value}")`);
  }

  // 3. TOUS les inputs/selects du formulaire principal
  const formData = await page.evaluate(() => {
    const form = document.getElementById('date_start')?.closest('form');
    if (!form) return 'Form non trouvé';
    const data: any[] = [];
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      data.push({ key, value: String(value) });
    }
    return data;
  });
  console.log('\n=== DONNÉES DU FORMULAIRE ===');
  if (Array.isArray(formData)) {
    for (const d of formData) console.log(`  ${d.key} = "${d.value}"`);
  } else {
    console.log(formData);
  }

  // 4. Chercher tout ce qui contient "deliveroo" dans les attributs
  const deliverooElements = await page.evaluate(() => {
    const results: string[] = [];
    document.querySelectorAll('*').forEach(el => {
      const html = el.outerHTML.slice(0, 500);
      if (html.toLowerCase().includes('deliveroo') && !html.includes('<html') && !html.includes('<body')) {
        results.push(html.slice(0, 300));
      }
    });
    return results.slice(0, 20);
  });
  console.log('\n=== ÉLÉMENTS HTML CONTENANT "deliveroo" ===');
  for (const e of deliverooElements) console.log(e + '\n');

  await browser.close();
}

main().catch(console.error);
