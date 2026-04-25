// Capture les requêtes réseau pendant login + recherche Foodflow
// Pour voir si on peut reproduire en fetch sans Playwright
import { chromium } from 'playwright';
import 'dotenv/config';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const requests: { method: string; url: string; postData?: string; type: string }[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('foodflow.com') && !url.match(/\.(png|jpg|jpeg|svg|woff|woff2|css|ico)/i)) {
      requests.push({
        method: req.method(),
        url,
        postData: req.postData() || undefined,
        type: req.resourceType(),
      });
    }
  });

  console.log('1. GET /shop/mon-compte...');
  await page.goto('https://foodflow.com/shop/mon-compte');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const connectBtn = page.locator('button', { hasText: 'Se connecter' });
  if (await connectBtn.isVisible().catch(() => false)) {
    await connectBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('2. Remplissage form...');
  await page.fill('input[name="email"]', process.env.FOODFLOW_EMAIL!);
  await page.fill('input[name="password"]', process.env.FOODFLOW_PASSWORD!);

  console.log('3. Submit...');
  const reqsBeforeLogin = requests.length;
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('\n=== Requêtes login uniquement (filtre Login/Authenticate/SignIn) ===');
  for (const r of requests.slice(reqsBeforeLogin)) {
    const isAuth = /login|authent|sign.?in|session/i.test(r.url) ||
                   (r.postData && /login|authent|sign.?in/i.test(r.postData));
    if (!isAuth) continue;
    console.log(`${r.method} ${r.url} (${r.type})`);
    if (r.postData) console.log(`  body: ${r.postData.slice(0, 800)}`);
    // Si réponse capturée, l'afficher (pas dispo ici)
  }

  console.log('\n=== TOUTES les requêtes post-submit (1ère seconde) ===');
  for (const r of requests.slice(reqsBeforeLogin, reqsBeforeLogin + 20)) {
    console.log(`${r.method} ${r.url}`);
    if (r.postData) {
      // Si c'est un GraphQL, extrait juste le nom de l'opération
      const opMatch = r.postData.match(/"operationName":"([^"]+)"/);
      if (opMatch) console.log(`  → op=${opMatch[1]}`);
    }
  }

  console.log('\n4. Recherche "epinard"...');
  const reqsBeforeSearch = requests.length;
  await page.goto('https://foodflow.com/shop/recherche?q=epinard');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('\n=== Requêtes GraphQL pendant la recherche (body complet) ===');
  for (const r of requests.slice(reqsBeforeSearch)) {
    if (!r.url.includes('graphql')) continue;
    console.log(`\n${r.method} ${r.url}`);
    if (r.postData) console.log(`BODY:\n${r.postData}`);
  }

  // Sauve les cookies
  const cookies = await context.cookies();
  console.log('\n=== Cookies ===');
  for (const c of cookies.filter(c => c.domain.includes('foodflow'))) {
    console.log(`${c.name}=${c.value.slice(0, 40)}... (domain=${c.domain})`);
  }

  // Sauve le HTML de la page de recherche
  const html = await page.content();
  const fs = await import('fs/promises');
  await fs.writeFile('/tmp/foodflow-epinard-loggedin.html', html);
  console.log('\n→ HTML logged-in sauvé dans /tmp/foodflow-epinard-loggedin.html');

  await browser.close();
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
