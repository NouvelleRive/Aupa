export const FOURNISSEURS = [
  'Foodflow',
  'Milliet',
  'LBA',
  'Lidl',
] as const;

export type Fournisseur = typeof FOURNISSEURS[number];
