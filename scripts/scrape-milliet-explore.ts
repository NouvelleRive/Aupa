import { chromium } from 'playwright';
import * as path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log('Connexion client.milliet.fr...');
  await page.goto('https://client.milliet.fr/Login.aspx');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.fill('#TextBoxUser', '30013');
  await page.fill('#TextBoxPassword', 'TNE9431');
  await page.click('#ButtonLogin');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Connecté ! URL:', page.url());

  // Chercher les liens vers commandes/factures/historique
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.textContent?.trim().slice(0, 80)
    })).filter(l => l.text && l.text.length > 1);
  });

  console.log('\n--- Tous les liens ---');
  for (const l of links) {
    console.log(`  ${l.text} → ${l.href}`);
  }

  // Essayer les pages classiques de portails fournisseurs
  const pagesToTry = [
    'https://client.milliet.fr/Commandes.aspx',
    'https://client.milliet.fr/Factures.aspx',
    'https://client.milliet.fr/Historique.aspx',
    'https://client.milliet.fr/MonCompte.aspx',
    'https://client.milliet.fr/Account.aspx',
  ];

  for (const url of pagesToTry) {
    try {
      await page.goto(url, { timeout: 10000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const title = await page.title();
      const bodyText = await page.evaluate(() => (document.body as HTMLElement).innerText.slice(0, 500));
      if (!bodyText.includes('Erreur') && !bodyText.includes('404')) {
        console.log(`\n✅ ${url}`);
        console.log(`  Title: ${title}`);
        console.log(`  Content: ${bodyText.slice(0, 200)}`);
        await page.screenshot({ path: path.join(__dirname, `../tmp-milliet-${url.split('/').pop()?.replace('.aspx', '')}.png`) });
      }
    } catch (e) {
      // skip
    }
  }

  // Retour à l'accueil, chercher un menu/sidebar
  await page.goto('https://client.milliet.fr/Default.aspx');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Chercher les formulaires et boutons
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a.button')).map(b => ({
      text: b.textContent?.trim().slice(0, 80) || (b as HTMLInputElement).value || '',
      tag: b.tagName,
      href: (b as HTMLAnchorElement).href || ''
    }));
  });
  console.log('\n--- Boutons/Actions ---');
  for (const b of buttons) {
    console.log(`  [${b.tag}] ${b.text} ${b.href ? '→ ' + b.href : ''}`);
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
