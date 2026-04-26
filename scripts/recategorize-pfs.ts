// Recatégorise les PFs qui ont categorie='viande' ou pas de categorie
// (le <select> affiche "viande" par défaut quand le champ est manquant).
// Cause racine : le scraper Foodflow du 25/04 a créé des PFs sans categorie.
//
// USAGE :
//   - DRY-RUN : npx tsx scripts/recategorize-pfs.ts
//   - APPLY   : npx tsx scripts/recategorize-pfs.ts --apply

import 'dotenv/config';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');

type Cat = 'viande' | 'poisson' | 'légume' | 'fruit' | 'laitage' | 'épicerie salée' | 'épicerie sucrée' | 'boisson' | 'consommable' | 'autre';

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Liste prioritaire : (regex, categorie). 1er match gagne.
// On utilise UNIQUEMENT le nom du PF (pas l'ingredient), car l'ingredient
// peut être un sous-élément (ex : "Beurre 1/2 sel" → ing "sel" mais c'est laitage).
const RULES: { re: RegExp; cat: Cat }[] = [
  // OVERRIDES — préparations qui contiennent un mot-clé d'une autre cat
  { re: /vinaigre/, cat: 'épicerie salée' },                       // vinaigre framboise, vinaigre cidre…
  { re: /huile de |huile d'|huile olive|huile arome|huile arôme/, cat: 'épicerie salée' },
  { re: /jus de veau|fond de |bouillon|saindoux|\bgraisse\b/, cat: 'épicerie salée' },
  { re: /sauce tomate|polpa|concentre de tomate|concentré de tomate|tomate concassee|tomate concassée|coulis de tomate|pulpe de tomate/, cat: 'épicerie salée' },
  { re: /coulis de fruit|coulis fraise|coulis framboise/, cat: 'épicerie sucrée' },
  { re: /confiture|nutella|tahine|praliné|praline|cerneaux|spéculoos|speculoos|au sirop\b/, cat: 'épicerie sucrée' },
  { re: /croissant|brioche|pain au chocolat|pain au lait|viennoiserie/, cat: 'épicerie sucrée' },
  { re: /tapenade|pesto|olive (noire|verte|rondelle|denoyaut|dénoyaut)/, cat: 'épicerie salée' },
  { re: /ail (semoule|pelee|pelée|en poudre|moulu|à l'huile|a l'huile|doux|confit)/, cat: 'épicerie salée' },
  { re: /pomme de terre|^pdt\b/, cat: 'légume' },
  { re: /tomate (cerise|ronde|roma|grappe|coeur|allongée|allongee|barquette)|tomate \d|tomate à farcir/, cat: 'légume' },
  { re: /noix de coco|coco rapee|coco rapée|noix\b(?! de )/, cat: 'fruit' },     // noix toute seule = fruit (cerneaux de noix géré au-dessus)

  // CONSOMMABLE — non alimentaire
  { re: /\b(fouet|chalumeau|gobelet|assiette|fourchette|couteau|cuillere|cuillère|serviette|bobine|gant|tablier|torchon|sac kraft|sac poubelle|essuie|nappe|papier alu|film alim|pique en bambou|cure-dent|agitateur|calot|colis de|etiquette|étiquette|pot salade|couvercle|boite burger|boîte burger|poche patissiere|poche pâtissière|barquette alu)\b/, cat: 'consommable' },
  { re: /\b(spray|nettoyant|liquide vaisselle|javel|gel wc|gel nettoyant|crème lavante|détergent|detergent|désinfectant|desinfectant|lave-verre|lavette|éponge|eponge|essuie-tout|essuie-mains|papier toilette)\b/, cat: 'consommable' },

  // POISSON
  { re: /\b(saumon|thon|cabillaud|truite|sardine|maquereau|hareng|anchois|crevette|gambas|poulpe|calamar|moules?|huitres?|huîtres?|dorade|merlu|colin)\b/, cat: 'poisson' },

  // VIANDE
  { re: /\b(boeuf|bœuf|veau|porc|poulet|dinde|canard|agneau|mouton|lapin|jambon|chorizo|coppa|pastrami|saucisse|saucisson|paleron|bourguignon|fuet|rosette|rillette|terrine|magret|cuisse de canard|steak|haché|hache|echine|échine|palette de porc|sauté de veau|saute de veau|roti de|rôti de|araignée|araignee|crepine|crépine|pilon|smocmeat|tournedos|entrecote|entrecôte|rumsteak|rump steak|poitrine fumee|poitrine fumée)\b/, cat: 'viande' },
  { re: /viande des grisons|grisons|bresaola/, cat: 'viande' },

  // BOISSON
  { re: /\b(vin |cubi vin|merlot|viognier|marsanne|colombelle|prosecco|frizzante|champagne|cremant|crémant)\b/, cat: 'boisson' },
  { re: /\b(biere|bière|ipa|triple|braquaval|brasserie)\b/, cat: 'boisson' },
  { re: /\b(rhum|whisky|vodka|gin |gin$|cognac|armagnac|calva|calvados|pastis|ricard|martini|aperol|baileys|limoncello|picon|suze|get 27|get 31|cachaca|ouzo|tequila|liqueur|spiritueux|st ger|saint germain|chartreuse|cointreau|grand marnier|kirsch|marc|eau de vie|crème de cassis|creme de cassis|crème de pêche|creme de peche|crème de mûre|creme de mure|crème de violette|crème (irlandaise|de whisky))\b/, cat: 'boisson' },
  { re: /\b(coca|cola|pepsi|fanta|sprite|orangina|schweppes|tonic|perrier|badoit|evian|vittel|cristaline|san pellegrino|eau (gazeuse|minerale|minérale|de source|cristaline|evian)|limonade|citronnade|ginger beer|ginger ale|red bull|kombucha|sirop|chai latte|chaï latte|chicoree|chicorée|matcha|thé|the\b|golden latte|cidre|chai|cafe |café |expresso|kombucha)\b/, cat: 'boisson' },
  { re: /jus d'|jus de (?!veau)/, cat: 'boisson' },                              // jus d'orange, de pomme, etc., mais pas jus de veau

  // LAITAGE
  { re: /\b(lait|laitier|beurre|fromage|brie|camembert|cheddar|emmental|comte|comté|tomme|gouda|feta|mozzarella|burrata|stracciatella|parmesan|raclette|chevre|chèvre|saint nectaire|chaource|reblochon|maroilles|munster|mascarpone|ricotta|creme|crème|chantilly|yaourt|yahourt|fromage blanc|aligot|oeuf|œuf|jaune d'oeuf|jaune d'œuf|blanc d'oeuf|blanc d'œuf)\b/, cat: 'laitage' },

  // FRUIT
  { re: /\b(citron|orange|pomme|poire|banane|ananas|fraise|framboise|myrtille|cassis|mure|mûre|peche|pêche|abricot|prune|raisin|kiwi|mangue|papaye|grenade|melon|pasteque|pastèque|figue|datte|fruit rouge|fruit de la passion|chataigne|châtaigne|cerise(?! .* tomate))s?\b/, cat: 'fruit' },

  // LÉGUME — herbes, salades, légumes frais
  { re: /\b(tomate|salade|carotte|poivron|champignon|portobello|aubergine|courgette|courge|potimarron|butternut|patate|panais|navet|radis|betterave|chou|choux|chou-fleur|brocoli|epinard|épinard|haricot|petit pois|fève|feve|asperge|artichaut|endive|fenouil|celeri|céleri|poireau|oignon|echalote|échalote|echalotte|échalotte|ail|gingembre frais|piment rouge|piment vert|piment doux frais|concombre|avocat|mais|maïs|menthe|basilic|coriandre|persil|ciboulette|cebette|aneth|romarin|thym|estragon|sauge|cerfeuil|mesclun|jeunes pousses|iceberg|roquette|mache|mâche|sucrine|olive(?! .*huile))s?\b/, cat: 'légume' },

  // ÉPICERIE SUCRÉE
  { re: /\b(sucre|cassonade|chocolat|cacao|miel|sirop d'erable|sirop érable|vanille|amande|noisette|pignon|pistache|biscuit|gateau|gâteau|farine de chataigne|farine d'amande|poudre amande|amandes poudre|colorant|gelifiant|gélifiant|agar|levure chimique|bicarbonate|maizena|maïzena|fécule|fecule|arome|arôme|fleur d'oranger|eau de rose)\b/, cat: 'épicerie sucrée' },

  // ÉPICERIE SALÉE — par défaut pour les ingrédients secs/conserves
  { re: /\b(huile|moutarde|sel|poivre|curry|curcuma|cumin|cannelle|gingembre moulu|gingembre poudre|paprika|harissa|tabasco|worcestershire|sauce|ketchup|mayonnaise|farine|riz|pates|pâtes|coquillettes|spaghetti|macaroni|penne|fusilli|tagliatelle|polenta|semoule|boulgour|quinoa|lentille|pois chiche|haricot sec|capres|câpres|cornichon|levure boulangere|levure boulangère|epice|épice|herbe de provence|laurier|girofle|muscade|cardamome|safran|anis|tandoori|chili|piment moulu|piment fume|piment fumé|truffe|origan|baies|cap bon|tomate seche|tomate séchée)\b/, cat: 'épicerie salée' },
];

function detect(nom: string): Cat {
  const n = norm(nom);
  for (const { re, cat } of RULES) if (re.test(n)) return cat;
  return 'épicerie salée';
}

async function main() {
  console.log(`Mode : ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const snap = await getDocs(collection(db, 'produitsFournisseurs'));
  const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as { nom?: string; categorie?: Cat; ingredient?: string; fournisseur?: string }) }));
  console.log(`Total PF : ${all.length}`);

  const cibles = all.filter(p => !p.categorie || p.categorie === 'viande');
  console.log(`PF avec categorie='viande' ou manquante : ${cibles.length}\n`);

  const stats: Record<Cat, number> = {
    viande: 0, poisson: 0, 'légume': 0, fruit: 0, laitage: 0,
    'épicerie salée': 0, 'épicerie sucrée': 0, boisson: 0, consommable: 0, autre: 0,
  };

  const changes: { id: string; nom: string; from: Cat | undefined; to: Cat; ingredient?: string }[] = [];

  for (const pf of cibles) {
    const newCat = detect(pf.nom || '');
    stats[newCat]++;
    if (newCat !== pf.categorie) {
      changes.push({ id: pf.id, nom: pf.nom || '', from: pf.categorie, to: newCat, ingredient: pf.ingredient });
    }
  }

  // Tri par catégorie pour relire facilement
  changes.sort((a, b) => a.to.localeCompare(b.to) || a.nom.localeCompare(b.nom));

  console.log('──── PROPOSITIONS DE RECAT ────\n');
  let currentCat = '';
  for (const c of changes) {
    if (c.to !== currentCat) {
      currentCat = c.to;
      console.log(`\n=== → ${c.to.toUpperCase()} ===`);
    }
    const fromStr = c.from || '(vide)';
    console.log(`  [${fromStr} → ${c.to}] ${c.nom}${c.ingredient ? ` | ing: ${c.ingredient}` : ''}`);
  }

  console.log(`\n──── STATS ────`);
  for (const [cat, n] of Object.entries(stats)) {
    if (n > 0) console.log(`  ${cat.padEnd(20)} : ${n}`);
  }
  console.log(`\n  TOTAL à modifier : ${changes.length}`);

  if (!APPLY) {
    console.log('\n[DRY-RUN] Pour appliquer : npx tsx scripts/recategorize-pfs.ts --apply');
    return;
  }

  console.log('\n=== APPLICATION ===');
  let done = 0;
  for (const c of changes) {
    await updateDoc(doc(db, 'produitsFournisseurs', c.id), { categorie: c.to });
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${changes.length}`);
  }
  console.log(`✓ ${done} PFs recatégorisés`);
}

main().catch(e => { console.error('ERR:', e); process.exit(1); });
