export const CATEGORIES = [
  'Bols', 'Croger', 'Desserts', 'Entrées', 'Grignotage', 'Mini Croger',
  'Préparations', 'Salade', 'Sides', 'Suppléments',
  'Le Chaud', 'Le Detox', 'Les Apéritifs et Digestifs', 'Les Binouz',
  'Les Cocktailz', 'Les Eaux', 'Les Iced', 'Les Sodas', 'Les Wines',
] as const;

export type CategorieRecette = typeof CATEGORIES[number];