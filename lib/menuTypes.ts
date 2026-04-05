export interface MenuRecette {
  id: string;
  prixVente: number;
}

export interface MenuCategorie {
  nom: string;
  recettes: MenuRecette[];
}

export interface MenuDoc {
  id: string;
  nom: string;
  saison: 'été' | 'hiver';
  annee: number;
  dateDebut: string;
  dateFin: string;
  categories: MenuCategorie[];
  actif: boolean;
  createdAt: string;
}