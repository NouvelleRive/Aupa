import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

// Noms de la caisse Popina (extraits du screenshot, sans emojis)
const CAISSE = [
  '33 neipa','Alcool X Tonic','Alex 33cl','Alex demi','Alex pinte',
  'Avocado toast','Avocat supplement','Baileys','Blanc 1/2','Blanc 1/4',
  'Blanc bouteille','Blanc verre','Bouteille bol','Bourguignon bowl',
  'Bourguignon croger','Bouteille normal','Café Bar / à emporter crème',
  'Café frappé','Café gourmand','Café','Calvados','Camem Bertha',
  'Camembert rôti','Canard croger','Cappuccino','Chai latte','Champi bol',
  'Champi croger','Champi croger','Cheese croger','Chicorée','Choco',
  'Cidre chaud','Cidre pinte','Citronnade','Citronnade','Citron pressé',
  'Coca','Coca Zéro','Coquillettes bol','Corona','Crème brûlée',
  'Croissant','Croissant','Croissant au fromage','Croissant breakfast',
  'Croissant choco','Croissant perdu','Crumble','Déca','Demi cidre',
  'Demi monaco / panaché','Diabolo','Dip','Dinde Croger','Double',
  'Dutch du credi','Formule brunch','Fromage extra','Gel',
  'Ginger beer / tonic','Grooooog','Guacaaaa','Guagamole','Ice tea',
  'Incroyable gouter','IPA demi','IPA pinte','Jambon croger',
  'Jus de fruit','Jus de termit','K','Kir royal','L\'apero',
  'Latte Epices','Le gouter','Limonade / Orangeade maison',
  'Matcha (latte)','Mi-cuit','Mimosa','Mocktail Sans alcool','Mojito',
  'Monaco pinte','Mules','Noisette','Oeuf Parfait','Oeuf supplément',
  'Orange pressée','Orange pressée','Orangina','Pastis','Pastis sirop',
  'Pb table 41','Perrier 33','Petit dej Champion','Petit dej Parisien',
  'Petrouchka','Pickles extra','Picon demi','Picon pinte',
  'Planche charcuterie','Planche fromage','Planche mixte','Plate evian 1l',
  'Polenta','Porto / Martini / Ouzo','Potatoes','Potatoes',
  'Poulet bowl','Poulet croger','Prix libre','Prosecco bouteille',
  'Prosecco verre','Pulled pork bowl','Pulled pork croger',
  'Pumpkin spice latte','Raclette croger','Ratatouille bowl',
  'Ratatouille croger','Ratatouille side','Rhum arrangé','Rosé 1/4',
  'Rosé verre','Rougail bowl','Rougail croger','Rouge 1/2','Rouge 1/4',
  'Rouge Bouteille','Rouge verre','Salade chèvre','Salade fraicheur',
  'Salade Parisienne','Salmon Toast','Sandwich','San pe 1l','Sauce',
  'Sauce extra','Sort','Season demi NEIPA','Season pinte NEIPA',
  'Shot détox','Shot detox Fleur oranger','Shot détox ginger / cranberry',
  'Shot simple','Sirop à l\'eau','Smoothie','Sport Jersey','Spritz',
  'Spritz st ger','Spritz Suze','Supp chantilly','Supp menu','Supp sirop',
  'Suze on rock','Sweat','Tea','Thé','Thé glacé maison','Thon croger',
  'Trio baby Croger','Trio mini','TRIPLE','TRIPLE',
  'Ts cocktails alcool','Uzo','Velouté','Viande extra',
  'Viande + fromage extra','Vin chaud',
];

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();

const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
  const a = normalize(nomPopina);
  const b = normalize(nomMenu);
  if (a === b) return true;
  const getType = (s: string) => {
    if (s.includes('mini croger')) return 'mini croger';
    if (s.includes('croger')) return 'croger';
    if (s.includes('bol') || s.includes('bowl')) return 'bol';
    if (s.includes('side')) return 'side';
    if (s.includes('salade')) return 'salade';
    return 'autre';
  };
  const typeA = getType(a);
  const typeB = getType(b);
  if (typeA !== 'autre' && typeB !== 'autre' && typeA !== typeB) return false;
  const STOP = new Set(['croger', 'mini', 'bowl', 'bol', 'side', 'salade', 'entree', 'entre', 'hiver', 'ete', 'plat']);
  const mots = b.split(' ').filter(m => m.length > 2 && !STOP.has(m));
  if (mots.length === 0) return a.includes(b.split(' ')[0]);
  return mots.every(m => a.includes(m));
};

async function main() {
  const snap = await db.collection('recettes').get();
  const recettes = snap.docs
    .map(d => ({ id: d.id, nom: d.data().nom, categorie: d.data().categorie }))
    .filter(r => r.categorie !== 'Préparations');

  // Pour chaque recette, trouver le(s) nom(s) caisse qui matchent
  console.log('=== RECETTES SANS MATCH CAISSE ===\n');
  const unmatchedRecettes: string[] = [];
  for (const r of recettes) {
    const matches = CAISSE.filter(c => matchPlat(c, r.nom));
    if (matches.length === 0) {
      console.log(`❌ ${r.categorie.padEnd(20)} | ${r.nom}`);
      unmatchedRecettes.push(r.nom);
    }
  }

  console.log(`\n=== RECETTES AVEC MATCH ===\n`);
  for (const r of recettes) {
    const matches = [...new Set(CAISSE.filter(c => matchPlat(c, r.nom)))];
    if (matches.length > 0) {
      console.log(`✔ ${r.categorie.padEnd(20)} | ${r.nom} ← [${matches.join(', ')}]`);
    }
  }

  console.log(`\n=== NOMS CAISSE SANS MATCH RECETTE ===\n`);
  const uniqueCaisse = [...new Set(CAISSE)];
  for (const c of uniqueCaisse) {
    const matches = recettes.filter(r => matchPlat(c, r.nom));
    if (matches.length === 0) {
      console.log(`❌ ${c}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
