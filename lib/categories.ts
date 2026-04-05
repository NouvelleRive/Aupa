export const CATEGORIES = [
  'Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols',
  'Salade', 'Grignotage', 'Suppléments',
  'Le Chaud', 'Les Iced', 'Le Detox', 'Les Sodas', 'Les Eaux',
  'Les Binouz', 'Les Wines', 'Les Cocktailz', 'Les Apéritifs et Digestifs',
] as const;

export type CategorieRecette = typeof CATEGORIES[number];