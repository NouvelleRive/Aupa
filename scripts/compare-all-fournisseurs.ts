import { chromium, Page } from 'playwright';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';
import { config } from 'dotenv';
import * as fs from 'fs';

config({ path: '.env.local' });
const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const FOODFLOW_EMAIL = process.env.FOODFLOW_EMAIL!;
const FOODFLOW_PASSWORD = process.env.FOODFLOW_PASSWORD!;

// Prépas maison à exclure
const PREPA_KEYWORDS = ['aioli', 'bourguignon', 'caramel beurre', 'coleslaw', 'crème de champi', 'croissant perdu', 'guaca', 'mayonnaise harissa', 'mayonnaise moutarde', 'mayonnaise', 'pickles', 'pesto', 'polpette', 'poulet basquaise', 'puled pork', 'rougail', 'thon prépa', 'tzatziki', 'velouté'];

type Resultat = {
  ingredient: string;
  ingredientId: string;
  fournisseur: string;
  produit: string;
  prix: number;
  unite: string;
  prixNormalise: number; // par kg ou L
};

// --- FOODFLOW ---
async function loginFoodflow(page: Page) {
  await page.goto('https://foodflow.com/shop/mon-compte');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  const connectBtn = page.locator('button', { hasText: 'Se connecter' });
  if (await connectBtn.isVisible()) await connectBtn.click();
  await page.fill('input[name="email"]', FOODFLOW_EMAIL);
  await page.fill('input[name="password"]', FOODFLOW_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

async function searchFoodflow(page: Page, query: string): Promise<{ produit: string; prix: string }[]> {
  await page.goto(`https://foodflow.com/shop/recherche?q=${encodeURIComponent(query)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    return (main || document.body).innerText;
  });

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results: { produit: string; prix: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const prixMatch = lines[i].match(/^(\d+[.,]\d+)€\/(kg|p|L)$/);
    if (prixMatch) {
      // Le nom du produit est quelques lignes avant
      let nom = '';
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        if (lines[j].length > 5 && !lines[j].match(/^\d/) && !lines[j].includes('€') && !lines[j].includes('Colis') && !lines[j].includes('Livr')) {
          nom = lines[j];
          break;
        }
      }
      if (nom) results.push({ produit: nom, prix: lines[i] });
    }
  }
  return results;
}

// --- MILLIET ---
async function loginMilliet(page: Page) {
  await page.goto('https://client.milliet.fr/Login.aspx');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill('#TextBoxUser', '30013');
  await page.fill('#TextBoxPassword', 'TNE9431');
  await page.click('#ButtonLogin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

async function searchMilliet(page: Page, query: string): Promise<{ produit: string; prix: string }[]> {
  await page.goto(`https://client.milliet.fr/ProduitRecherche.aspx?Google=${encodeURIComponent(query)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => (document.body as HTMLElement).innerText);
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results: { produit: string; prix: string }[] = [];

  for (const line of lines) {
    // Pattern Milliet: "NOM PRODUIT\t0,70 L (1)\t24,51 €"
    const match = line.match(/^(.+?)\t.*?\t(\d+[.,]\d+)\s*€$/);
    if (match) {
      results.push({ produit: match[1].trim(), prix: match[2].replace(',', '.') + ' €' });
    }
  }
  return results;
}

// --- LBA ---
async function loginLBA(page: Page) {
  await page.goto('https://lba-boissons.fr/selection-produits');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Chercher un formulaire de login
  const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
  const pwInput = page.locator('input[type="password"]').first();

  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailInput.fill('lecaminito@gmail.com');
    await pwInput.fill('Motdepasse-cam');
    await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
  }
}

async function searchLBA(page: Page, query: string): Promise<{ produit: string; prix: string }[]> {
  // On cherche via l'URL de la page produits avec un paramètre search
  await page.goto(`https://lba-boissons.fr/selection-produits?search=${encodeURIComponent(query)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    return (main || document.body).innerText;
  });

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results: { produit: string; prix: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('€')) {
      // Chercher le nom du produit autour
      let nom = '';
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (lines[j].length > 3 && !lines[j].includes('€') && !lines[j].match(/^\d/)) {
          nom = lines[j];
          break;
        }
      }
      if (nom) results.push({ produit: nom, prix: lines[i] });
    }
  }
  return results;
}

// --- MAIN ---
async function main() {
  // Charger les ingrédients
  const ingSnap = await db.collection('ingredients').get();
  const ingredients = ingSnap.docs
    .map(d => ({ id: d.id, nom: d.data().nom as string, categorie: d.data().categorie as string }))
    .filter(i => i.nom && !PREPA_KEYWORDS.some(k => i.nom.toLowerCase().includes(k)))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  // Dédupliquer par nom
  const seen = new Set<string>();
  const uniqueIngredients = ingredients.filter(i => {
    if (seen.has(i.nom.toLowerCase())) return false;
    seen.add(i.nom.toLowerCase());
    return true;
  });

  console.log(`${uniqueIngredients.length} ingrédients à chercher\n`);

  // Lancer les 3 browsers
  const browser = await chromium.launch({ headless: true });

  const ctxFoodflow = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageFoodflow = await ctxFoodflow.newPage();

  const ctxMilliet = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageMilliet = await ctxMilliet.newPage();

  const ctxLBA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageLBA = await ctxLBA.newPage();

  // Login en parallèle
  console.log('Login aux 3 fournisseurs...');
  await Promise.all([
    loginFoodflow(pageFoodflow),
    loginMilliet(pageMilliet),
    loginLBA(pageLBA),
  ]);
  console.log('Connecté aux 3 !\n');

  // Screenshot LBA pour debug
  await pageLBA.screenshot({ path: resolve(__dirname, '../tmp-lba-loggedin.png') });
  console.log('LBA URL:', pageLBA.url());

  const allResults: Resultat[] = [];

  for (let idx = 0; idx < uniqueIngredients.length; idx++) {
    const ing = uniqueIngredients[idx];
    const searchTerm = ing.nom.replace(/['']/g, ' ').toLowerCase();

    process.stdout.write(`[${idx + 1}/${uniqueIngredients.length}] ${ing.nom}...`);

    // Chercher en parallèle sur les 3
    const [foodflowRes, millietRes, lbaRes] = await Promise.all([
      searchFoodflow(pageFoodflow, searchTerm).catch(() => []),
      searchMilliet(pageMilliet, searchTerm).catch(() => []),
      searchLBA(pageLBA, searchTerm).catch(() => []),
    ]);

    const counts = [];
    if (foodflowRes.length > 0) counts.push(`FF:${foodflowRes.length}`);
    if (millietRes.length > 0) counts.push(`MI:${millietRes.length}`);
    if (lbaRes.length > 0) counts.push(`LBA:${lbaRes.length}`);
    console.log(counts.length > 0 ? ` ${counts.join(' ')}` : ' aucun');

    // Sauvegarder le premier résultat de chaque
    if (foodflowRes.length > 0) {
      allResults.push({
        ingredient: ing.nom,
        ingredientId: ing.id,
        fournisseur: 'Foodflow',
        produit: foodflowRes[0].produit,
        prix: parseFloat(foodflowRes[0].prix.replace(',', '.')),
        unite: foodflowRes[0].prix.includes('/kg') ? 'kg' : foodflowRes[0].prix.includes('/L') ? 'L' : 'pièce',
        prixNormalise: parseFloat(foodflowRes[0].prix.replace(',', '.')),
      });
    }

    if (millietRes.length > 0) {
      const prixStr = millietRes[0].prix.replace(',', '.').replace(' €', '');
      allResults.push({
        ingredient: ing.nom,
        ingredientId: ing.id,
        fournisseur: 'Milliet',
        produit: millietRes[0].produit,
        prix: parseFloat(prixStr),
        unite: 'L', // Milliet vend surtout en L pour boissons
        prixNormalise: parseFloat(prixStr),
      });
    }

    if (lbaRes.length > 0) {
      const prixStr = lbaRes[0].prix.replace(',', '.').replace('€', '').trim();
      allResults.push({
        ingredient: ing.nom,
        ingredientId: ing.id,
        fournisseur: 'LBA',
        produit: lbaRes[0].produit,
        prix: parseFloat(prixStr) || 0,
        unite: 'pièce',
        prixNormalise: parseFloat(prixStr) || 0,
      });
    }
  }

  // Sauvegarder en JSON
  const outputPath = resolve(__dirname, '../tmp-comparatif-all.json');
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n✅ ${allResults.length} résultats sauvegardés dans ${outputPath}`);

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
