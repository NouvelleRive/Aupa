export interface MenuCategorie {
  nom: string;
  recetteIds: string[];
}

export interface MenuDoc {
  id: string;
  nom: string;
  saison: 'été' | 'hiver';
  annee: number;
  dateDebut: string; // ex: '2024-11-01'
  dateFin: string;   // ex: '2025-04-30'
  categories: MenuCategorie[];
  actif: boolean;
  createdAt: string;
}