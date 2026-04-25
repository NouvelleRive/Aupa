// Test de matching Rungis sur des ingrédients réels Firebase
import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

type Ing = { id: string; nom: string; categorie?: string; unite?: string; fournisseurRefId?: string };
type PF = { id: string; ingredientId?: string; ingredient?: string; fournisseur?: string; nom: string; prix: number; unite: string; quantite?: number };

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

type RungisHit = {
  productId: string;
  slug: string;        // ex: "14591/echine-de-porc-sans-os"
  nom: string;
  weightKg: number;
  priceCents: number;
  pricePerKg: number;
  pricePerL?: number;
  isLiquid: boolean;
  theme: string;       // meat, fish, ...
  format: string;      // texte sous-titre
};

function parseSearchResults(html: string): RungisHit[] {
  const hits: RungisHit[] = [];
  // Découpe par carte produit : chaque carte contient "card product-box"
  const cards = html.split(/<div class="card product-box/);
  for (const card of cards.slice(1)) {
    const productIdM = card.match(/data-product-id="(\d+)"/);
    const weightM = card.match(/data-click-weight="([\d.]+)"/);
    const priceM = card.match(/data-click-price="(\d+)"/);
    const liquidM = card.match(/data-click-is-liquid="(\d)"/);
    const themeM = card.match(/data-modal-theme="([^"]+)"/);
    const slugM = card.match(/href="\/app\/product\/(\d+\/[^"#?]+)"/);
    const nameM = card.match(/<div class="card-title[^"]*">([^<]+)<\/div>/);
    const subM = card.match(/<p class="card-subtitle[^"]*">([\s\S]*?)<\/p>/);
    const ppKgM = card.match(/<span class="product-main-price">([^<]+)<\/span>/);

    if (!productIdM || !weightM || !priceM || !slugM || !nameM) continue;
    const weightKg = parseFloat(weightM[1]);
    const priceCents = parseInt(priceM[1]);
    const pricePerKg = priceCents / 100 / weightKg;
    const isLiquid = liquidM?.[1] === '1';

    hits.push({
      productId: productIdM[1],
      slug: slugM[1],
      nom: nameM[1].trim(),
      weightKg,
      priceCents,
      pricePerKg: isLiquid ? 0 : pricePerKg,
      pricePerL: isLiquid ? pricePerKg : undefined,
      isLiquid,
      theme: themeM?.[1] || '',
      format: (subM?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
  }
  return hits;
}

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'au', 'aux', 'un', 'une', 'a', 'en', 'et', 'ou', 'pour', 'avec', 'sans', 'sous', 'vide', 'sv', 'kg', 'g', 'l', 'cl', 'ml', 'pce', 'piece', 'vrac', 'france', 'ue', 'aoc', 'igp', 'bio']);

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

// Mapping ingredient.categorie → Rungis data-modal-theme
const CATEGORIE_THEME: Record<string, string[]> = {
  'viande': ['meat'],
  'poisson': ['fish'],
  'légume': ['vegetable'],
  'fruit': ['fruit'],
  'laitage': ['dairy'],
  'épicerie salée': ['grocery'],
  'épicerie sucrée': ['grocery'],
  'boisson': ['drink', 'beverage'],
};

function bestMatch(query: string, hits: RungisHit[], ingUnite?: string, ingCategorie?: string): RungisHit | null {
  if (hits.length === 0) return null;
  const qt = tokens(query);
  if (qt.length === 0) return null;

  // 1. Filtre par unité liquide vs solide
  const wantsLiquid = ingUnite === 'L' || ingUnite === 'cL';
  let pool = hits.filter(h => h.isLiquid === wantsLiquid);
  if (pool.length === 0) pool = hits;

  // 2. Filtre par catégorie Rungis si connue
  const wantedThemes = ingCategorie ? (CATEGORIE_THEME[ingCategorie] || []) : [];
  if (wantedThemes.length > 0) {
    const themed = pool.filter(h => wantedThemes.includes(h.theme));
    if (themed.length > 0) pool = themed;
  }

  // 3. Garde uniquement les hits dont le nom contient TOUS les tokens de la query
  const strict = pool.filter(h => {
    const ct = tokens(h.nom);
    return qt.every(t => ct.includes(t));
  });
  if (strict.length === 0) return null;

  // 4. Bonus : préférer les hits où le 1er token query apparaît dès le début du nom
  const scored = strict.map(h => {
    const ct = tokens(h.nom);
    let bonus = 0;
    // 1er token query dans les 2 premiers tokens du nom = +1
    if (ct.indexOf(qt[0]) >= 0 && ct.indexOf(qt[0]) <= 1) bonus += 1;
    // Nom court (peu de tokens étrangers à la query) = bonus
    const extraTokens = ct.length - qt.length;
    bonus -= extraTokens * 0.2;
    return { h, score: bonus };
  });
  // Trie : meilleur score d'abord, puis prix/kg le plus bas
  scored.sort((a, b) => b.score - a.score || (a.h.pricePerKg || a.h.pricePerL || Infinity) - (b.h.pricePerKg || b.h.pricePerL || Infinity));
  return scored[0].h;
}

async function main() {
  console.log('Login Rungis...');
  const cookie = await login();
  console.log('OK\n');

  const [ingSnap, pfSnap] = await Promise.all([
    getDocs(collection(db, 'ingredients')),
    getDocs(collection(db, 'produitsFournisseurs')),
  ]);
  const ings = ingSnap.docs.map(d => ({ id: d.id, ...d.data() } as Ing));
  const pfs = pfSnap.docs.map(d => ({ id: d.id, ...d.data() } as PF));

  // Sélectionne 10 ingrédients ayant un PF de réf (donc une query plus précise)
  const sample: { ing: Ing; refPf?: PF }[] = [];
  for (const ing of ings) {
    if (!ing.fournisseurRefId) continue;
    const refPf = pfs.find(p => p.id === ing.fournisseurRefId);
    if (!refPf) continue;
    sample.push({ ing, refPf });
    if (sample.length >= 12) break;
  }

  console.log(`Test sur ${sample.length} ingrédients :\n`);
  for (const { ing, refPf } of sample) {
    const query = ing.nom; // utilise le nom de l'ingrédient (générique, clean)
    console.log(`──── ${ing.nom} (${ing.categorie || '?'}) ────`);
    console.log(`  PF de réf : "${refPf!.nom}" (${refPf!.fournisseur}, ${refPf!.prix}€/${refPf!.unite})`);
    console.log(`  Search Rungis: "${query}"`);

    const url = `https://rungismarket.com/app?q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: { 'cookie': cookie } });
    const html = await r.text();
    const hits = parseSearchResults(html);
    console.log(`  → ${hits.length} hits trouvés`);

    const match = bestMatch(query, hits, ing.unite, ing.categorie);
    if (match) {
      const unitTxt = match.isLiquid ? `${match.pricePerL?.toFixed(2)}€/L` : `${match.pricePerKg.toFixed(2)}€/kg`;
      console.log(`  ✅ MATCH: "${match.nom}" — ${match.format} — ${unitTxt} (${(match.priceCents / 100).toFixed(2)}€ pour ${match.weightKg}kg)`);
    } else {
      const top3 = hits.slice(0, 3).map(h => `"${h.nom}" (${h.theme}, ${h.pricePerKg.toFixed(2)}€/kg)`);
      console.log(`  ❌ Aucun match suffisamment proche`);
      console.log(`     Top hits: ${top3.join(' | ') || '(0)'}`);
    }
    console.log('');
  }
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
