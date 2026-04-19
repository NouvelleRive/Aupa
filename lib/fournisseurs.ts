export const FOURNISSEURS = [
  'Foodflow',
  'Milliet',
  'LBA',
  'Lidl',
  'Amazon',
] as const;

export type Fournisseur = typeof FOURNISSEURS[number];
