'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const MENUS: Record<string, { categorie: string; plats: { nom: string; prix: number; description?: string }[] }[]> = {
  HIVER25: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 13.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 13.90 },
      { nom: 'Va Bene Ma Portobella', prix: 13.90 },
      { nom: "C'est un Vrai Miraclette", prix: 15.90 },
      { nom: "Ratabouille d'Amour d'Hiver", prix: 11.90 },
      { nom: 'Voilà de la Boulette', prix: 13.90 },
      { nom: "L'Amour est dans le Poivre", prix: 14.90 },
      { nom: 'Mon Rougail Sûr', prix: 15.90 },
      { nom: "Veau tu m'Épouser ?", prix: 15.90 },
      { nom: 'Tu me Rends Mapoule', prix: 13.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 8.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Velouté de Légumes', prix: 6.50 },
      { nom: 'Œuf Plus que Parfait', prix: 7.90 },
      { nom: 'Avocado Croissantoast', prix: 8.90 },
      { nom: 'Camembert Rôti au Miel', prix: 6.90 },
      { nom: 'Croissant Toasté Grilled Cheese', prix: 6.90 },
    ]},
    { categorie: 'Grignotage', plats: [
      { nom: 'Guacamole Maison', prix: 4.90 },
      { nom: 'Planche Mixte', prix: 13.90 },
      { nom: 'Planche Charcuteries ou Fromages', prix: 11.90 },
      { nom: 'Planche Maison 3 Effilochés', prix: 14.90 },
    ]},
    { categorie: 'Bols', plats: [
      { nom: 'Bol Bourguignon', prix: 10.90 },
      { nom: 'Bol Porc Effiloché', prix: 10.90 },
      { nom: 'Bol Poulet Basquaise', prix: 10.90 },
      { nom: 'Bol Rougail', prix: 10.90 },
      { nom: 'Bol Portobello', prix: 10.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Pommes de Terre au Four', prix: 4.90 },
      { nom: 'Purée Façon Aligot', prix: 4.90 },
      { nom: 'Ratatouille Maison', prix: 4.90 },
      { nom: 'Salade Fraîcheur Légère', prix: 4.90 },
    ]},
    { categorie: 'Salades', plats: [
      { nom: 'La Parisienne', prix: 13.90 },
      { nom: 'La Française', prix: 13.90 },
      { nom: 'La Grecque', prix: 13.90 },
      { nom: 'Assiette Boulette', prix: 15.90 },
      { nom: 'Assiette Steak au Poivre', prix: 15.90 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Riz au Lait Coco Amande', prix: 5.90 },
      { nom: 'Crème Brûlée Vanille', prix: 5.90 },
      { nom: 'Croissant Perdu aux Épices', prix: 8.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
  ETE25: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 13.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 13.90 },
      { nom: 'Tu me Rends Mapoule', prix: 13.90 },
      { nom: 'La Caprésieuse', prix: 12.90 },
      { nom: "Ratabouille d'Amour", prix: 11.90 },
      { nom: 'Voilà de la Boulette', prix: 13.90 },
      { nom: 'A Startare is Born', prix: 13.90 },
      { nom: 'Mon Thonthon de Tunis', prix: 12.90 },
      { nom: 'Dinde de Toi', prix: 13.90 },
      { nom: 'Vous Êtes Eggsquis.e', prix: 13.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 8.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Œuf Mimosa', prix: 5.50 },
      { nom: 'Œuf Plus que Parfait', prix: 7.90 },
      { nom: 'Avocado Croissantoast', prix: 8.90 },
      { nom: 'Camembert Rôti au Miel', prix: 6.90 },
      { nom: 'Croissant Toasté Grilled Cheese', prix: 6.90 },
    ]},
    { categorie: 'Bols', plats: [
      { nom: 'Bol Bourguignon', prix: 10.90 },
      { nom: 'Bol Porc Effiloché', prix: 10.90 },
      { nom: 'Bol Poulet Basquaise', prix: 10.90 },
      { nom: 'Bol Tomates Aubergines', prix: 10.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Pommes de Terre au Four', prix: 5.90 },
      { nom: 'Salade de Pommes de Terre', prix: 5.90 },
      { nom: 'Ratatouille Maison', prix: 5.90 },
      { nom: 'Salade Fraîcheur Légère', prix: 4.90 },
    ]},
    { categorie: 'Salades', plats: [
      { nom: 'La Parisienne', prix: 13.90 },
      { nom: 'La Française', prix: 13.90 },
      { nom: 'La Grecque', prix: 13.90 },
      { nom: 'La Tunisienne', prix: 13.90 },
      { nom: 'La New-Yorkaise', prix: 13.90 },
      { nom: 'Bol Boulette', prix: 15.90 },
      { nom: 'Le Tartare', prix: 15.90 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Croissant Roll Chocolat 2.0', prix: 8.90 },
      { nom: 'Crème Brûlée Vanille', prix: 4.90 },
      { nom: 'Croissant Perdu aux Épices', prix: 8.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
  HIVER24: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 12.90 },
      { nom: 'Mon Canard en Sucre', prix: 15.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 12.90 },
      { nom: "C'est un Vrai Miraclette", prix: 13.90 },
      { nom: 'Voilà de la Boulette', prix: 13.90 },
      { nom: 'Va Bene Ma Portobella', prix: 11.90 },
      { nom: 'Tu me Rends Mapoule', prix: 12.90 },
      { nom: 'Dinde de Toi', prix: 14.90 },
      { nom: "Ratabouille d'Amour en Hiver", prix: 9.90 },
      { nom: 'Mon Rougail Sûr', prix: 13.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 7.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Velouté du Moment', prix: 7.50 },
      { nom: 'Œuf Plus que Parfait', prix: 7.90 },
      { nom: 'Avocado Croissantoast', prix: 8.90 },
      { nom: 'Salmon Croissantoast', prix: 8.90 },
      { nom: 'Camembert Rôti au Miel', prix: 6.90 },
    ]},
    { categorie: 'Bols', plats: [
      { nom: 'Bol Bourguignon', prix: 14.90 },
      { nom: 'Bol Porc Effiloché', prix: 14.90 },
      { nom: 'Bol Poulet Basquaise', prix: 14.90 },
      { nom: 'Bol Champignon Portobello', prix: 14.90 },
      { nom: 'Bol Rougail Saucisse', prix: 14.90 },
      { nom: 'Bol Coquillette', prix: 15.90 },
      { nom: 'Bol Boulette', prix: 15.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Pommes de Terre au Four', prix: 5.90 },
      { nom: 'Polenta Crémeuse', prix: 5.90 },
      { nom: 'Ratatouille Hivernale', prix: 5.90 },
      { nom: 'Salade Fraîcheur Légère', prix: 4.90 },
    ]},
    { categorie: 'Salades', plats: [
      { nom: 'Salade Parisienne', prix: 13.90 },
      { nom: 'Salade Chèvre Chaud', prix: 13.90 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Croissant au Chocolat 2.0', prix: 8.90 },
      { nom: 'Crème Brûlée Vanille', prix: 4.90 },
      { nom: 'Croissant Perdu aux Épices', prix: 8.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
  ETE24: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 12.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 12.90 },
      { nom: 'A Startare is (Re)Born', prix: 13.90 },
      { nom: 'Voilà de la Boulette', prix: 13.90 },
      { nom: 'Va Bene Ma Portobella', prix: 11.90 },
      { nom: 'Tu me Rends Mapoule', prix: 12.90 },
      { nom: 'Mon Thonthon de Tunis', prix: 10.90 },
      { nom: 'La Caprésieuse', prix: 10.90 },
      { nom: "Ratabouille d'Amour", prix: 9.90 },
      { nom: 'Mon Rougail Sûr', prix: 13.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 7.90 },
      { nom: 'Oeuforie', prix: 13.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Œuf Mimosa', prix: 5.50 },
      { nom: 'Œuf Plus que Parfait', prix: 7.90 },
      { nom: 'Avocado Croissantoast', prix: 8.90 },
      { nom: 'Salmon Croissantoast', prix: 8.90 },
      { nom: 'Camembert Rôti au Miel', prix: 6.90 },
    ]},
    { categorie: 'Bols', plats: [
      { nom: 'Bol Bourguignon', prix: 10.90 },
      { nom: 'Bol Porc Effiloché', prix: 10.90 },
      { nom: 'Bol Poulet Basquaise', prix: 10.90 },
      { nom: 'Bol Transalpin', prix: 10.90 },
      { nom: 'Bol Rougail Saucisse', prix: 10.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Pommes de Terre au Four', prix: 5.90 },
      { nom: 'Salade de Pommes de Terre', prix: 5.90 },
      { nom: 'Salade Fraîcheur Légère', prix: 4.90 },
    ]},
    { categorie: 'Salades', plats: [
      { nom: 'La Parisienne', prix: 13.90 },
      { nom: 'La Grecque', prix: 13.90 },
      { nom: 'La Tunisienne', prix: 13.90 },
      { nom: 'La New-Yorkaise', prix: 13.90 },
      { nom: 'Le Tartare', prix: 15.90 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Croissant au Chocolat 2.0', prix: 8.90 },
      { nom: 'Crème Brûlée Vanille', prix: 4.90 },
      { nom: 'Croissant Perdu aux Épices', prix: 8.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
  HIVER23: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 11.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 11.90 },
      { nom: "C'est un Vrai Miraclette", prix: 13.90 },
      { nom: 'Va Bene Ma Portobella', prix: 11.90 },
      { nom: 'Tu me Rends Mapoule', prix: 10.90 },
      { nom: 'Mon Thonthon de Tunis', prix: 9.90 },
      { nom: 'Pastramimi', prix: 13.90 },
      { nom: 'La Caprésieuse', prix: 10.90 },
      { nom: "Ratabouille d'Amour", prix: 9.90 },
      { nom: 'Mon Rougail Sûr', prix: 10.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 7.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Velouté du Moment', prix: 7.50 },
      { nom: 'Œuf Plus que Parfait', prix: 8.90 },
      { nom: 'Avocado Croissantoast', prix: 8.90 },
      { nom: 'Salmon Croissantoast', prix: 8.90 },
      { nom: 'Camembert Rôti au Miel', prix: 7.90 },
    ]},
    { categorie: 'Bols', plats: [
      { nom: 'Bol Bourguignon', prix: 14.90 },
      { nom: 'Bol Porc Effiloché', prix: 14.90 },
      { nom: 'Bol Poulet Basquaise', prix: 14.90 },
      { nom: 'Bol Tomate Caprese', prix: 14.90 },
      { nom: 'Bol Rougail', prix: 14.90 },
      { nom: 'Bol Raclette', prix: 15.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Potatoes façon Bravas', prix: 6.50 },
      { nom: 'Polenta Crémeuse', prix: 6 },
      { nom: 'Salade Fraîcheur Légère', prix: 5 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Croissant au Chocolat 2.0', prix: 8.90 },
      { nom: 'Crème Brûlée Vanille', prix: 4.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
  ETE23: [
    { categorie: 'Crogers', plats: [
      { nom: 'Boeuf Bourguignon', prix: 10.90 },
      { nom: 'Pulled Pork des Cochon.nes', prix: 10.90 },
      { nom: 'A Startare is Born', prix: 11.90 },
      { nom: 'Mon Rougail Sûr', prix: 11.90 },
      { nom: 'Tu me Rends Mapoule', prix: 11.90 },
      { nom: 'Mon Thonthon de Tunis', prix: 9.90 },
      { nom: 'Pastramania', prix: 12.90 },
      { nom: 'La Caprésieuse', prix: 10.90 },
      { nom: "Ratatouille Oh la la !", prix: 8.90 },
      { nom: 'Dinde de Toi', prix: 10.90 },
      { nom: 'Jam(trop)bon Mayo', prix: 10.90 },
    ]},
    { categorie: 'Entrées', plats: [
      { nom: 'Burrata Pesto Croissantoast', prix: 9 },
      { nom: 'Avocado Croissantoast', prix: 8 },
      { nom: 'Salmon Croissantoast', prix: 9 },
      { nom: 'Œuf Plus que Parfait', prix: 7 },
      { nom: 'Camembert Rôti au Miel', prix: 7 },
      { nom: 'Guacamole Maison', prix: 7 },
    ]},
    { categorie: 'Salades', plats: [
      { nom: 'La Parisienne', prix: 13.90 },
      { nom: 'La Grecque', prix: 13.90 },
      { nom: 'La Tunisienne', prix: 13.90 },
      { nom: 'Le Tartare', prix: 13.90 },
    ]},
    { categorie: 'Sides', plats: [
      { nom: 'Potatoes façon Bravas', prix: 6 },
      { nom: 'Salade de Pommes de Terre', prix: 6 },
      { nom: 'Salade Fraîcheur Légère', prix: 5 },
    ]},
    { categorie: 'Desserts', plats: [
      { nom: 'Mi-cuit Chocolat Amandes', prix: 6.90 },
      { nom: 'Crumble Pommes Myrtilles', prix: 5.90 },
      { nom: 'Croissant au Chocolat 2.0', prix: 8.90 },
      { nom: 'Crème Brûlée Vanille', prix: 4.90 },
      { nom: 'Café Gourmand', prix: 9.90 },
    ]},
  ],
};

interface VenteLine {
  nom: string;
  quantity: number;
  ttc: number;
  carte: string;
  mois: string;
}

const matchPlat = (nomPopina: string, nomMenu: string): boolean => {
  const a = nomPopina.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const b = nomMenu.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mots = b.split(' ').filter(m => m.length > 3);
  return mots.some(m => a.includes(m)) || a.includes(b.split(' ')[0].toLowerCase());
};

export default function MenusPage() {
  const [carteActive, setCarteActive] = useState<string>('HIVER25');
  const [ventes, setVentes] = useState<VenteLine[]>([]);
  const [importing, setImporting] = useState(false);
  const [moisActif, setMoisActif] = useState<string>('all');
  const [showCreer, setShowCreer] = useState(false);
  const [nouvelleCarte, setNouvelleCarte] = useState('ETE26');
  const [recettesDisponibles, setRecettesDisponibles] = useState<any[]>([]);
  const [selectionMenu, setSelectionMenu] = useState<Set<string>>(new Set());
  const [filterCatCreer, setFilterCatCreer] = useState<string>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const CARTES_ORDER = ['HIVER25', 'ETE25', 'HIVER24', 'ETE24', 'HIVER23', 'ETE23'];
  const CATEGORIES = ['Croger', 'Mini Croger', 'Entrées', 'Sides', 'Desserts', 'Bols', 'Wine/Beer', 'Cocktails', 'Apéro', 'Softs chaud', 'Softs froid', 'Sodas'];

  useEffect(() => {
    getDocs(collection(db, 'ventes')).then(snap => {
      setVentes(snap.docs.map(d => d.data() as VenteLine));
    });
  }, []);

  const fetchRecettes = async () => {
    const snap = await getDocs(collection(db, 'recettes'));
    setRecettesDisponibles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleImportPopina = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws);

    const carte = prompt('Quelle carte ? (ex: HIVER25)') || carteActive;
    const mois = prompt('Quel mois ? (ex: 2025-01)') || '2025-01';

    const existingSnap = await getDocs(query(collection(db, 'ventes'), where('mois', '==', mois)));
    for (const d of existingSnap.docs) await deleteDoc(d.ref);

    let count = 0;
    for (const row of rows) {
      const nom = row['name'] || '';
      const quantity = row['quantity'] || 0;
      const ttc = row['TTC'] || 0;
      if (!nom || quantity <= 0) continue;
      await addDoc(collection(db, 'ventes'), { nom, quantity, ttc, carte, mois });
      count++;
    }

    setImporting(false);
    alert(`✅ ${count} lignes importées !`);
    const snap = await getDocs(collection(db, 'ventes'));
    setVentes(snap.docs.map(d => d.data() as VenteLine));
    e.target.value = '';
  };

  const handleEnregistrerMenu = async () => {
    if (selectionMenu.size === 0) return;
    for (const id of selectionMenu) {
      await updateDoc(doc(db, 'recettes', id), { carte: nouvelleCarte });
    }
    alert(`✅ ${selectionMenu.size} recettes assignées à ${nouvelleCarte} !`);
    setSelectionMenu(new Set());
    setShowCreer(false);
  };

  const getVentesPourPlat = (nomPlat: string) => {
    return ventes.filter(v =>
      v.carte === carteActive &&
      (moisActif === 'all' || v.mois === moisActif) &&
      matchPlat(v.nom, nomPlat)
    );
  };

  const moisDisponibles = [...new Set(ventes.filter(v => v.carte === carteActive).map(v => v.mois))].sort();

  const getStats = (carte: string) => {
    const tousPlats = (MENUS[carte] || []).flatMap(c => c.plats);
    const caMenu = tousPlats.reduce((s, p) => s + p.prix, 0);
    const ventesCartes = ventes.filter(v => v.carte === carte);
    const caReel = ventesCartes.reduce((s, v) => s + v.ttc, 0);
    const totalVendus = ventesCartes.reduce((s, v) => s + v.quantity, 0);
    return { count: tousPlats.length, caMenu, caReel, totalVendus };
  };

  const menu = MENUS[carteActive] || [];
  const stats = getStats(carteActive);
  const recettesFiltrees = recettesDisponibles.filter(r => filterCatCreer === 'all' || r.categorie === filterCatCreer);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Menus Food</h1>
        <div className="flex gap-3">
          <button onClick={() => { setShowCreer(!showCreer); fetchRecettes(); }}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            + Créer un menu
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold rounded-lg px-4 py-2 text-sm">
            {importing ? 'Import...' : 'Importer ventes Popina'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportPopina} />
        </div>
      </div>

      {/* Module créer un menu */}
      {showCreer && (
        <div className="bg-white rounded-xl border border-yellow-100 p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">Créer un nouveau menu</h2>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm w-40"
              placeholder="Nom (ex: ETE26)" value={nouvelleCarte}
              onChange={e => setNouvelleCarte(e.target.value.toUpperCase())} />
            <select className="border border-yellow-200 focus:border-yellow-400 focus:outline-none rounded-lg px-3 py-2 text-sm"
              value={filterCatCreer} onChange={e => setFilterCatCreer(e.target.value)}>
              <option value="all">Toutes catégories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <span className="text-sm text-gray-400 self-center">{selectionMenu.size} recettes sélectionnées</span>
            <button onClick={handleEnregistrerMenu}
              className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg px-4 py-2 text-sm">
              Enregistrer
            </button>
            <button onClick={() => { setShowCreer(false); setSelectionMenu(new Set()); }}
              className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
              Annuler
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {recettesFiltrees.map(r => (
              <label key={r.id} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${selectionMenu.has(r.id) ? 'border-yellow-400 bg-yellow-50' : 'border-gray-100 hover:border-yellow-200'}`}>
                <input type="checkbox" checked={selectionMenu.has(r.id)} onChange={e => {
                  const s = new Set(selectionMenu);
                  e.target.checked ? s.add(r.id) : s.delete(r.id);
                  setSelectionMenu(s);
                }} className="accent-yellow-400" />
                <div>
                  <p className="text-sm font-medium">{r.nom}</p>
                  <p className="text-xs text-gray-400">{r.categorie} · {r.prixVente?.toFixed(2)} €</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Onglets cartes */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CARTES_ORDER.map(c => (
          <button key={c} onClick={() => { setCarteActive(c); setMoisActif('all'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${carteActive === c ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-gray-200 text-gray-600 hover:border-yellow-300'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Filtre mois */}
      {moisDisponibles.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button onClick={() => setMoisActif('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === 'all' ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
            Tous les mois
          </button>
          {moisDisponibles.map(m => (
            <button key={m} onClick={() => setMoisActif(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${moisActif === m ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Plats sur la carte</p>
          <p className="text-2xl font-bold">{stats.count}</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">CA potentiel carte</p>
          <p className="text-2xl font-bold">{stats.caMenu.toFixed(0)} €</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">CA réel (Popina)</p>
          <p className="text-2xl font-bold">{stats.caReel > 0 ? stats.caReel.toFixed(0) + ' €' : '—'}</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-100 p-4">
          <p className="text-xs text-gray-500 mb-1">Articles vendus</p>
          <p className="text-2xl font-bold">{stats.totalVendus > 0 ? stats.totalVendus : '—'}</p>
        </div>
      </div>

      {/* Détail par catégorie */}
      <div className="space-y-6">
        {menu.map(({ categorie, plats }) => {
          const ventsCat = plats.map(p => {
            const v = getVentesPourPlat(p.nom);
            return { ...p, vendus: v.reduce((s, x) => s + x.quantity, 0), caReel: v.reduce((s, x) => s + x.ttc, 0) };
          });
          const totalVendus = ventsCat.reduce((s, p) => s + p.vendus, 0);
          return (
            <div key={categorie} className="bg-white rounded-xl border border-yellow-100 overflow-hidden">
              <div className="bg-yellow-50 px-4 py-3 flex items-center justify-between">
                <h2 className="font-semibold text-gray-700">{categorie}</h2>
                <span className="text-xs text-gray-400">
                  {plats.length} plats {totalVendus > 0 ? `· ${totalVendus} vendus` : ''}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs uppercase border-b border-yellow-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Plat</th>
                    <th className="px-4 py-2 text-right">Prix</th>
                    <th className="px-4 py-2 text-right">Vendus</th>
                    <th className="px-4 py-2 text-right">CA réel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-50">
                  {ventsCat.sort((a, b) => b.vendus - a.vendus).map((plat, i) => (
                    <tr key={i} className="hover:bg-yellow-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{plat.nom}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{plat.prix.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-right">
                        {plat.vendus > 0 ? <span className="font-semibold">{plat.vendus}</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {plat.caReel > 0 ? <span className="font-semibold text-yellow-600">{plat.caReel.toFixed(0)} €</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}