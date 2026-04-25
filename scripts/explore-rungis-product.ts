// Inspecte une fiche produit Rungis pour comprendre la structure
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
  const url = 'https://rungismarket.com/app/product/10719/boeuf-bourguignon';
  console.log('GET', url);
  const r = await fetch(url, { headers: { 'cookie': cookie } });
  const html = await r.text();
  console.log('Status:', r.status, 'Length:', html.length);

  // Extrait le H1
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  console.log('\nH1:', h1?.[1]?.replace(/<[^>]+>/g, '').trim());

  // Cherche tous les prix
  const prices = [...html.matchAll(/(\d+[,.]\d+)\s*€/g)].slice(0, 10);
  console.log('\nPrix trouvés:', prices.map(p => p[0]));

  // Cherche les patterns € / X
  const perUnit = [...html.matchAll(/(\d+[,.]\d+)\s*€\s*\/\s*(\w+)/gi)].slice(0, 10);
  console.log('\nPrix par unité:', perUnit.map(p => `${p[1]} €/${p[2]}`));

  // Catégorie : breadcrumb ?
  const breadcrumb = [...html.matchAll(/breadcrumb[^>]*>([\s\S]*?)<\/(?:nav|div|ol|ul)>/gi)];
  if (breadcrumb.length) {
    console.log('\nBreadcrumb HTML (extrait):', breadcrumb[0][1].replace(/\s+/g, ' ').slice(0, 500));
  }

  // Cherche les meta tags
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
  const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
  console.log('\nog:title:', ogTitle?.[1]);
  console.log('og:description:', ogDesc?.[1]);

  // Cherche structured data JSON-LD
  const jsonLd = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  console.log('\nJSON-LD blocks:', jsonLd.length);
  for (const m of jsonLd) {
    try {
      const parsed = JSON.parse(m[1]);
      console.log('  →', JSON.stringify(parsed, null, 2).slice(0, 800));
    } catch {}
  }

  // Sauve le HTML pour inspection
  const fs = await import('fs/promises');
  await fs.writeFile('/tmp/rungis-product.html', html);
  console.log('\n→ HTML complet sauvé dans /tmp/rungis-product.html');
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
