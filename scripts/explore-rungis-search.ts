// Inspecte la page de recherche Rungis pour extraire la liste des produits
import 'dotenv/config';

async function login(): Promise<string> {
  const email = process.env.RUNGIS_EMAIL!;
  const password = process.env.RUNGIS_PASSWORD!;
  const loginPage = await fetch('https://rungismarket.com/connexion', { redirect: 'manual' });
  const cookies1 = loginPage.headers.getSetCookie?.() || [];
  const html = await loginPage.text();
  const token = html.match(/name="_token"[^>]*value="([^"]+)"/)![1];
  const sessionCookie = cookies1.map(c => c.split(';')[0]).join('; ');
  const body = new URLSearchParams({ email, plainPassword: password, _token: token, _remember_me: '1' });
  const res = await fetch('https://rungismarket.com/connexion', {
    method: 'POST',
    headers: { 'cookie': sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  const cookies2 = res.headers.getSetCookie?.() || [];
  return [...cookies1, ...cookies2].map(c => c.split(';')[0]).join('; ');
}

async function main() {
  const cookie = await login();
  const q = 'echine porc';
  const url = `https://rungismarket.com/app?q=${encodeURIComponent(q)}`;
  console.log('GET', url);
  const r = await fetch(url, { headers: { 'cookie': cookie } });
  const html = await r.text();
  console.log('Status:', r.status, 'Len:', html.length);

  const fs = await import('fs/promises');
  await fs.writeFile('/tmp/rungis-search.html', html);

  // Extrait toutes les cards produits via data-product-id ou liens /app/product/
  const productLinks = [...html.matchAll(/href="\/app\/product\/(\d+\/[^"#?]+)"/g)];
  const uniq = [...new Set(productLinks.map(m => m[1]))];
  console.log(`\n${uniq.length} produits uniques :`);
  for (const slug of uniq) {
    console.log('  -', slug);
  }

  // Tente d'extraire le titre de chaque card
  // Cherche les blocs autour de data-product-id
  const blocks = [...html.matchAll(/<a[^>]*href="\/app\/product\/(\d+\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  console.log(`\n${blocks.length} blocs <a> trouvés`);
  for (const b of blocks.slice(0, 5)) {
    const text = b[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`  → ${b[1]} : "${text.slice(0, 100)}"`);
  }

  // Cherche aussi data-click-price/weight au niveau search
  const variants = [...html.matchAll(/data-product-id="(\d+)"[\s\S]{0,200}?data-click-(?:weight|price)/g)];
  console.log(`\n${variants.length} variants avec data-click détectés`);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
