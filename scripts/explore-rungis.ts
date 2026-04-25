// Script de test : login Rungis + exploration de l'endpoint de recherche
import 'dotenv/config';

async function main() {
  const email = process.env.RUNGIS_EMAIL;
  const password = process.env.RUNGIS_PASSWORD;
  if (!email || !password) {
    console.error('Creds manquantes');
    process.exit(1);
  }

  console.log('1. GET /connexion pour CSRF...');
  const loginPage = await fetch('https://rungismarket.com/connexion', { redirect: 'manual' });
  const cookies1 = loginPage.headers.getSetCookie?.() || [];
  const html = await loginPage.text();
  const tokenMatch = html.match(/name="_token"[^>]*value="([^"]+)"/);
  console.log('  Status:', loginPage.status);
  console.log('  Cookies:', cookies1.length);
  console.log('  CSRF token trouvé:', !!tokenMatch);
  if (!tokenMatch) {
    console.log('  Extrait HTML:', html.slice(0, 500));
    process.exit(1);
  }

  const token = tokenMatch[1];
  const sessionCookie = cookies1.map(c => c.split(';')[0]).join('; ');

  console.log('\n2. POST /connexion...');
  const body = new URLSearchParams({
    email,
    plainPassword: password,
    _token: token,
    _remember_me: '1',
  });
  const res = await fetch('https://rungismarket.com/connexion', {
    method: 'POST',
    headers: { 'cookie': sessionCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  const cookies2 = res.headers.getSetCookie?.() || [];
  const allCookies = [...cookies1, ...cookies2].map(c => c.split(';')[0]).join('; ');
  console.log('  Status:', res.status);
  console.log('  Location:', res.headers.get('location'));
  console.log('  Cookies après login:', cookies2.length);

  const cookie = allCookies;

  console.log('\n3. Test endpoints de recherche...');
  const queries = ['boeuf bourguignon', 'comte', 'porc'];

  for (const q of queries) {
    console.log(`\n  Recherche: "${q}"`);
    const urls = [
      `https://rungismarket.com/app/recherche?q=${encodeURIComponent(q)}`,
      `https://rungismarket.com/app/search?q=${encodeURIComponent(q)}`,
      `https://rungismarket.com/recherche?q=${encodeURIComponent(q)}`,
      `https://rungismarket.com/app/produits?q=${encodeURIComponent(q)}`,
      `https://rungismarket.com/app?q=${encodeURIComponent(q)}`,
    ];
    for (const url of urls) {
      const r = await fetch(url, { headers: { 'cookie': cookie }, redirect: 'manual' });
      console.log(`    ${r.status} ${url}`);
      if (r.status === 200) {
        const h = await r.text();
        // Cherche des liens de produits
        const matches = [...h.matchAll(/\/app\/product\/([^"'\s?]+)/g)].slice(0, 5);
        console.log(`      → ${matches.length} liens /app/product/ trouvés`);
        if (matches.length > 0) {
          console.log('      Exemples:', matches.slice(0, 3).map(m => m[1]).join(', '));
        }
        // Extrait <h1> ou <title>
        const title = h.match(/<title[^>]*>([^<]+)/)?.[1]?.trim();
        if (title) console.log(`      Title: ${title}`);
        break; // si 200, on s'arrête sur cet URL
      }
    }
  }
}

main().catch(e => {
  console.error('ERR:', e);
  process.exit(1);
});
