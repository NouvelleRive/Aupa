export interface MenuCategorie {
  nom: string;
  recetteIds: string[];
}

export interface MenuDoc {
  id: string;
  nom: string;
  saison: 'été' | 'hiver';
  annee: number;
  categories: MenuCategorie[];
  actif: boolean;
  createdAt: string;
}