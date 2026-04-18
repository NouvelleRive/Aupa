// Mapping caisse Popina → recette.
// La source de vérité est la collection Firestore `caisseMapCustom` (108 entrées).
// Ce dictionnaire est rempli au runtime par les pages qui en ont besoin.
export const CAISSE_MAP: Record<string, string> = {};

export const normalizeCaisse = (s: string) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
