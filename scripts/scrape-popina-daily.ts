// Scrape les ventes Popina JOUR PAR JOUR via export simplifié et importe dans Firestore
import { chromium } from 'playwright';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import XLSX from 'xlsx';

config({ path: '.env.local' });
const EMAIL = process.env.POPINA_EMAIL!;
const PASSWORD = process.env.POPINA_PASSWORD!;
if (!EMAIL || !PASSWORD) { console.error('POPINA_EMAIL et POPINA_PASSWORD requis'); process.exit(1); }

const ESTAB = '26798';
const BASE = `https://backoffice.popina.com/fr/dashboard/establishment/${ESTAB}`;
const OUT = path.join(__dirname, '../tmp-popina-daily');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const CATEGORIES_POPINA = new Set([
  'plats', 'bol', 'croger', 'salade', 'boissons froides', 'aperitifs digestifs',
  'biere', 'cocktail', 'maison iced', 'soft eau', 'vin', 'entrees',
  'sides et tapas', 'grignotte', 'side', 'desserts', 'tous', 'boissons chaudes',
  'classic hot drinks', 'crazy hot drinks', 'none', 'supplements', 'au restau',
  'parent category menu png', 'dont menus', 'brunch',
  'aupa croissant burger eat', 'formule midi', 'gouter',
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function generateDays(startDate: string): string[] {
  const days: string[] = [];
  const d = new Date(startDate + 'T00:00:00');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  while (d <= yesterday) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Format ISO → dd.mm.yyyy pour le date picker Popina
function toPopinaDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

async function main() {
  // Charger les menus pour le mapping date → menuNom
  const menusSnap = await getDocs(collection(db, 'menus'));
  const menus = menusSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Jours déjà en base
  const existingSnap = await getDocs(collection(db, 'ventes'));
  const joursExistants = new Set<string>();
  for (const d of existingSnap.docs) {
    const jour = d.data().jour;
    if (jour) joursExistants.add(jour);
  }
  console.log(`${joursExistants.size} jours déjà en base`);

  const allDays = generateDays('2026-01-01');
  const daysToProcess = allDays.filter(d => !joursExistants.has(d));
  console.log(`${allDays.length} jours total, ${daysToProcess.length} à traiter\n`);

  if (daysToProcess.length === 0) {
    console.log('Tout est déjà importé.');
    return;
  }

  // Login
  console.log('Login Popina...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await page.goto('https://backoffice.popina.com/fr/session/index');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('#button_arrow');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  if (!page.url().includes('dashboard')) {
    console.error('Login échoué:', page.url());
    await browser.close();
    return;
  }
  console.log('Connecté\n');

  // Aller sur la page statistiques une première fois
  await page.goto(`${BASE}/statistics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);

  let totalVentes = 0;
  let totalJours = 0;

  for (const day of daysToProcess) {
    const popDate = toPopinaDate(day);

    // Changer les dates via JS + submit du form
    await page.evaluate((d: string) => {
      const start = document.getElementById('date_start') as HTMLInputElement;
      const end = document.getElementById('date_end') as HTMLInputElement;
      if (start && end) {
        start.value = d;
        end.value = d;
        start.dispatchEvent(new Event('input', { bubbles: true }));
        start.dispatchEvent(new Event('change', { bubbles: true }));
        end.dispatchEvent(new Event('input', { bubbles: true }));
        end.dispatchEvent(new Event('change', { bubbles: true }));
        const form = start.closest('form');
        if (form) form.submit();
      }
    }, popDate);

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    // Télécharger l'export simplifié
    const filePath = path.join(OUT, `tmp-${day}.xlsx`);
    try {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.click('#export_stocks_button'),
      ]);
      await dl.saveAs(filePath);
    } catch {
      console.log(`  ${day}: pas de données`);
      continue;
    }

    // Parser
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];

    const menuMatch = menus.find((m: any) => m.dateDebut && m.dateFin && day >= m.dateDebut && day <= m.dateFin);
    const menuNom = menuMatch ? menuMatch.nom : '';
    const mois = day.slice(0, 7);

    let dayVentes = 0;
    for (const row of rows) {
      const nom = row['name'];
      const quantity = row['quantity'];
      const ttc = row['total ttc'];
      if (!nom || !quantity || quantity <= 0 || !ttc || ttc <= 0) continue;
      if (CATEGORIES_POPINA.has(normalize(nom))) continue;

      await addDoc(collection(db, 'ventes'), {
        nom, quantity, ttc, menuNom, mois, jour: day,
      });
      dayVentes++;
    }

    totalVentes += dayVentes;
    totalJours++;
    console.log(`  ${day}: ${dayVentes} ventes (menu: ${menuNom || '—'})`);

    // Nettoyer le fichier temporaire
    fs.unlinkSync(filePath);
    await page.waitForTimeout(500);
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`${totalJours} jours importés, ${totalVentes} ventes créées`);
}

main().catch(console.error);
