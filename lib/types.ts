export type Unite = 'kg' | 'g' | 'L' | 'cL' | 'pièce' | 'lot';

export type Categorie = 'viande' | 'poisson' | 'légume' | 'fruit' | 'laitage' | 'épicerie' | 'boisson' | 'autre';

export type Saison = 'été' | 'hiver';

export type Carte = 'ETE23' | 'HIVER23' | 'ETE24' | 'HIVER24' | 'ETE25' | 'HIVER25' | 'ETE26';

export type CategorieRecette = 'Croger' | 'Mini Croger' | 'Entrées' | 'Sides' | 'Desserts' | 'Bols' | 'Wine/Beer' | 'Cocktails' | 'Apéro' | 'Softs chaud' | 'Softs froid' | 'Sodas';

export interface Ingredient {
  id: string;
  nom: string;
  prix: number;
  unite: Unite;
  categorie: Categorie;
  rendement: number;
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

export interface Recette {
  id: string;
  nom: string;
  categorie: CategorieRecette;
  saisons: Saison[];
  carte: Carte;
  actif: boolean;
  prixVente: number;
  ingredients: RecetteIngredient[];
  options: RecetteOption[];
  coutCalcule: number;
  updatedAt: string;
}