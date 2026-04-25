// Debug : pq query "Coquillettes Panzani 5KG" renvoie une page par défaut ?
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
  const fs = await import('fs/promises');

  const queries = [
    'coquillettes',
    'coquillettes panzani',
    'Coquillettes Panzani 5KG',
    'comte',
    'feta',
    'huile olive',
    "huile d'olive",
    'champignon paris',
    'paprika',
    'concentre tomate',
    'myrtille',
  ];

  for (const q of queries) {
    const url = `https://rungismarket.com/app?q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'cookie': cookie } });
    const html = await r.text();
    // Compte les cards produits
    const cards = (html.match(/class="card product-box/g) || []).length;
    // Cherche un message "aucun résultat"
    const empty = /aucun r[eé]sultat|no result|0 r[eé]sultat/i.test(html);
    // Cherche le titre h1/h2
    const title = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/)?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    console.log(`q="${q}" → ${cards} cards${empty ? ' (empty msg)' : ''} | titre: "${(title || '').slice(0, 60)}"`);
  }

  // Sauve aussi la page pour "Coquillettes Panzani 5KG" pour inspection
  const url = `https://rungismarket.com/app?q=${encodeURIComponent('Coquillettes Panzani 5KG')}`;
  const r = await fetch(url, { headers: { 'cookie': cookie } });
  await fs.writeFile('/tmp/rungis-coquillettes.html', await r.text());
  console.log('\n→ Page Coquillettes sauvée dans /tmp/rungis-coquillettes.html');
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
