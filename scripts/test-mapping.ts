import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// Copie de la logique
const CAISSE_MAP: Record<string, string> = {
  'bourguignon bowl': 'bourguignon bol',
  'champi bol': 'forestier bol',
  'coquillettes bol': 'bol coquillettes',
  'poulet bowl': 'poulet bol',
  'pulled pork bowl': 'pulled pork bol',
  'ratatouille bowl': 'ratatouille bol',
  'rougail bowl': 'rougail bol',
  'bourguignon croger': 'bourguignon croger',
  'camem bertha': 'camembertha croger',
  'canard croger': 'canard croger',
  'champi croger': 'forestier croger',
  'dinde croger': 'dinde croger',
  'jambon croger': 'jambon croger',
  'poulet croger': 'poulet croger',
  'pulled pork croger': 'pulled pork croger',
  'raclette croger': 'raclette croger',
  'ratatouille croger': 'ratatouille croger',
  'rougail croger': 'rougail croger',
  'thon croger': 'thon croger',
  'avocado toast': 'avocado entree',
  'camembert roti': 'camembert entree',
  'croissant au fromage': 'croissant fromage entree',
  'guacaaaa': 'guaca entree',
  'guagamole': 'guaca entree',
  'mimosa': 'oeuf mimosa entree',
  'oeuf parfait': 'oeuf entree',
  'salmon toast': 'salmon entree',
  'veloute': 'veloute entree',
  'cafe gourmand': 'cafe gour',
  'creme brulee': 'creme brulee',
  'croissant choco': 'croissant choco',
  'croissant perdu': 'croissant perdu',
  'crumble': 'crumble',
  'micuit': 'micuit',
  'polenta': 'polenta',
  'potatoes': 'potatoes',
  'ratatouille side': 'ratatouille side',
  'salade fraicheur': 'fraicheur',
  'salade chevre': 'salade chevre chaud',
  'salade parisienne': 'salade parisienne',
  'planche charcuterie': 'planche charcuteries ou fromages',
  'planche fromage': 'planche charcuteries ou fromages',
  'planche mixte': 'planche mixte',
  'cafe': 'expresso',
  'cafe frappe': 'cafe frappe',
  'cappuccino': 'cappuccino',
  'chai latte': 'chai latte',
  'chicoree': 'chicoree',
  'choco': 'chocolat chaud',
  'cidre chaud': 'cidre chaud',
  'deca': 'deca',
  'grooooog': 'grog',
  'latte epices': 'latte aux epices',
  'matcha latte': 'matcha latte',
  'pumpkin spice latte': 'pumpkin latte',
  'the': 'the',
  'tea': 'the',
  'vin chaud': 'vin chaud',
  'citron presse': 'citron presse',
  'citronnade': 'citronnade',
  'diabolo': 'diabolo',
  'ginger beer  tonic': 'ginger beer maison',
  'ice tea': 'ice tea',
  'jus de fruit': 'jus de fruit',
  'limonade  orangeade maison': 'limonade maison',
  'orange pressee': 'orange pressee',
  'shot detox fleur oranger': 'shot fleur doranger',
  'shot detox ginger  cranberry': 'shot cranberry',
  'shot detox': 'shot gingembre',
  'sirop a leau': 'sirop a leau',
  'smoothie': 'smoothie',
  'the glace maison': 'the glace maison',
  'coca': 'coca',
  'coca zero': 'coca zero',
  'orangina': 'orangina',
  'perrier 33': 'perrier bouteille',
  'cidre pinte': 'cidre pinte',
  'corona': 'corona',
  'ipa demi': 'ipa',
  'ipa pinte': 'ipa pinte',
  'triple': 'triple pinte',
  'mojito': 'mojito',
  'rhum arrange': 'rhum arrange',
  'spritz': 'spritz',
  'spritz st ger': 'spritz st germain',
  'spritz suze': 'suze spritz',
  'kir royal': 'kir royal',
  'mules': 'moscow mule',
  'blanc verre': 'vin blanc verre',
  'rose verre': 'vin rose verre',
  'rouge verre': 'vin rouge verre',
  'prosecco verre': 'petillant verre',
  'plate evian 1l': 'eau evian 1l',
  'san pe 1l': 'san pellegrino 1l',
  'baileys': 'baileys',
  'calvados': 'calva',
  'pastis': 'pastis',
  'uzo': 'ouzo',
  'picon demi': 'picon biere',
  'picon pinte': 'picon biere',
};

const norm = (s: string) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();

const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
  const caisse = norm(nomPopina);
  const recette = norm(nomMenu).replace(/\s+(ete|hiver)$/, '');
  const mapped = CAISSE_MAP[caisse];
  if (!mapped) return false;
  return mapped === recette;
};

const CAISSE_NAMES = [
  'Bourguignon bowl','Bourguignon croger','Champi bol','Champi croger',
  'Coquillettes bol','Poulet bowl','Poulet croger','Pulled pork bowl',
  'Pulled pork croger','Ratatouille bowl','Ratatouille croger','Ratatouille side',
  'Rougail bowl','Rougail croger','Camem Bertha','Canard croger',
  'Dinde Croger','Jambon croger','Raclette croger','Thon croger',
  'Avocado toast','Camembert rôti','Croissant au fromage',
  'Guacaaaa','Guagamole','Mimosa','Oeuf Parfait','Salmon Toast','Velouté',
  'Café gourmand','Crème brûlée','Croissant choco','Croissant perdu','Crumble','Mi-cuit',
  'Polenta','Potatoes','Salade fraicheur','Salade chèvre','Salade Parisienne',
  'Planche charcuterie','Planche fromage','Planche mixte',
  'Café','Café frappé','Cappuccino','Chai latte','Chicorée','Choco',
  'Cidre chaud','Déca','Grooooog','Latte Epices','Matcha (latte)',
  'Pumpkin spice latte','Thé','Tea','Vin chaud',
  'Citron pressé','Citronnade','Diabolo','Ginger beer / tonic',
  'Ice tea','Jus de fruit','Limonade / Orangeade maison','Orange pressée',
  'Shot detox Fleur oranger','Shot détox ginger / cranberry','Shot détox',
  'Sirop à l\'eau','Smoothie','Thé glacé maison',
  'Coca','Coca Zéro','Orangina','Perrier 33',
  'Cidre pinte','Corona','IPA demi','IPA pinte','TRIPLE',
  'Mojito','Rhum arrangé','Spritz','Spritz st ger','Spritz Suze','Kir royal','Mules',
  'Blanc verre','Rosé verre','Rouge verre','Prosecco verre',
  'Plate evian 1l','San pe 1l',
  'Baileys','Calvados','Pastis','Uzo','Picon demi','Picon pinte',
];

async function main() {
  const snap = await db.collection('recettes').get();
  const recettes = snap.docs
    .map(d => ({ nom: d.data().nom, categorie: d.data().categorie }))
    .filter(r => r.categorie !== 'Préparations');

  console.log('=== RECETTES AVEC MATCH ===\n');
  let matched = 0;
  for (const r of recettes) {
    const matches = CAISSE_NAMES.filter(c => matchPlat(c, r.nom));
    if (matches.length > 0) {
      console.log(`✔ ${r.nom.padEnd(35)} ← [${matches.join(', ')}]`);
      matched++;
    }
  }

  console.log(`\n=== RECETTES SANS MATCH (${recettes.length - matched}) ===\n`);
  for (const r of recettes) {
    const matches = CAISSE_NAMES.filter(c => matchPlat(c, r.nom));
    if (matches.length === 0) {
      console.log(`❌ ${r.categorie.padEnd(20)} | ${r.nom}`);
    }
  }

  // Vérifier les clés du map qui ne matchent aucune recette
  console.log(`\n=== CLÉS MAP SANS RECETTE ===\n`);
  for (const [caisse, mappedBase] of Object.entries(CAISSE_MAP)) {
    const found = recettes.some(r => {
      const base = norm(r.nom).replace(/\s+(ete|hiver)$/, '');
      return base === mappedBase;
    });
    if (!found) {
      console.log(`⚠ "${caisse}" → "${mappedBase}" (aucune recette trouvée)`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
