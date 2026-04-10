export const FOURNISSEURS = [
  'Foodflow',
  'Milliet',
  'LBA',
] as const;

export type Fournisseur = typeof FOURNISSEURS[number];
