// Mapping nom caisse Popina (normalisé) → nom de base recette (normalisé, sans été/hiver)
// Les noms caisse qui ne sont pas dans cette table sont ignorés (extras, suppléments, formules…)

export const CAISSE_MAP: Record<string, string> = {
  // --- BOLS ---
  'bourguignon bowl': 'bourguignon bol',
  'champi bol': 'forestier bol',
  'coquillettes bol': 'bol coquillettes',
  'poulet bowl': 'poulet bol',
  'pulled pork bowl': 'pulled pork bol',
  'ratatouille bowl': 'ratatouille bol',
  'rougail bowl': 'rougail bol',

  // --- CROGER ---
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

  // --- ENTREES ---
  'avocado toast': 'avocado entree',
  'camembert roti': 'camembert entree',
  'croissant au fromage': 'croissant fromage entree',
  'guacaaaa': 'guaca entree',
  'guagamole': 'guaca entree',
  'mimosa': 'oeuf mimosa entree',
  'oeuf parfait': 'oeuf entree',
  'salmon toast': 'salmon entree',
  'veloute': 'veloute entree',

  // --- DESSERTS ---
  'cafe gourmand': 'cafe gour',
  'creme brulee': 'creme brulee',
  'croissant choco': 'croissant choco',
  'croissant perdu': 'croissant perdu',
  'crumble': 'crumble',
  'micuit': 'micuit',

  // --- SIDES ---
  'polenta': 'polenta',
  'potatoes': 'potatoes',
  'ratatouille side': 'ratatouille side',
  'salade fraicheur': 'fraicheur',

  // --- SALADES ---
  'salade chevre': 'salade chevre chaud',
  'salade parisienne': 'salade parisienne',

  // --- GRIGNOTAGE ---
  'planche charcuterie': 'planche charcuteries ou fromages',
  'planche fromage': 'planche charcuteries ou fromages',
  'planche mixte': 'planche mixte',

  // --- LE CHAUD ---
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

  // --- LES ICED ---
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

  // --- LES SODAS ---
  'coca': 'coca',
  'coca zero': 'coca zero',
  'orangina': 'orangina',
  'perrier 33': 'perrier bouteille',
  'perrier 1l': 'perrier 1l',

  // --- LES BINOUZ ---
  'alex 33cl': 'alex demi',
  'alex demi': 'alex demi',
  'alex pinte': 'alex pinte',
  '33 neipa': 'biere du moment demi',
  'season demi neipa': 'biere du moment demi',
  'season pinte neipa': 'biere du moment pinte',
  'cidre pinte': 'cidre pinte',
  'demi cidre': 'cidre demi',
  'corona': 'corona',
  'ipa demi': 'ipa',
  'ipa pinte': 'ipa pinte',
  'monaco pinte': 'monaco pinte',
  'triple': 'triple pinte',

  // --- LES COCKTAILZ ---
  'mojito': 'mojito',
  'rhum arrange': 'rhum arrange',
  'spritz': 'spritz',
  'spritz st ger': 'spritz st germain',
  'spritz suze': 'suze spritz',
  'kir royal': 'kir royal',
  'mules': 'moscow mule',

  // --- LES WINES ---
  'blanc verre': 'vin blanc verre',
  'blanc 14': 'vin blanc 14',
  'blanc 12': 'vin blanc 12',
  'blanc bouteille': 'vin blanc bouteille',
  'rose verre': 'vin rose verre',
  'rose 14': 'vin rose 14',
  'rose 12': 'vin rose 12',
  'rose bouteille': 'vin rose bouteille',
  'rouge verre': 'vin rouge verre',
  'rouge 14': 'vin rouge 14',
  'rouge 12': 'vin rouge 12',
  'rouge bouteille': 'vin rouge bouteille',
  'prosecco verre': 'petillant verre',
  'prosecco bouteille': 'petillant bouteille',

  // --- LES EAUX ---
  'plate evian 1l': 'eau evian 1l',
  'san pe 1l': 'san pellegrino 1l',

  // --- APERITIFS ---
  'baileys': 'baileys',
  'calvados': 'calva',
  'pastis': 'pastis',
  'uzo': 'ouzo',
  'picon demi': 'picon biere',
  'picon pinte': 'picon biere',
};

export const normalizeCaisse = (s: string) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
