export type Unite = 'kg' | 'g' | 'L' | 'cL' | 'pièce' | 'lot';

export type Categorie = 'viande' | 'poisson' | 'légume' | 'fruit' | 'laitage' | 'épicerie' | 'boisson' | 'autre';

export interface Ingredient {
  id: string;
  nom: string;
  prix: number;
  unite: Unite;
  categorie: Categorie;
  rendement: number; // ex: 0.85 = 15% de perte
  historiquesPrix: { date: string; prix: number }[];
  updatedAt: string;
}

export interface PreparationIngredient {
  ingredientId: string;
  grammage: number;
}

export interface Preparation {
  id: string;
  nom: string;
  portionsProduits: number;
  ingredients: PreparationIngredient[];
  coutCalcule: number;
  updatedAt: string;
}

export interface RecetteIngredient {
  ingredientId?: string;
  preparationId?: string;
  grammage: number;
}

export interface RecetteOption {
  nom: string;
  coutSupp: number;
  prixSupp: number;
}

export type Saison = 'été' | 'hiver' | 'toute_année' | 'printemps' | 'automne';
export type CategorieRecette = 'Croger' | 'Mini Croger' | 'Entrées' | 'Sides' | 'Desserts' | 'Bols' | 'Wine/Beer' | 'Cocktails' | 'Apéro' | 'Softs chaud' | 'Softs froid' | 'Sodas';

export interface Recette {
  id: string;
  nom: string;
  categorie: CategorieRecette;
  saisons: Saison[];
  actif: boolean;
  prixVente: number;
  ingredients: RecetteIngredient[];
  options: RecetteOption[];
  coutCalcule: number;
  updatedAt: string;
}