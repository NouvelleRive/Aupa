// node create-menus.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const MENUS = [
  {
    nom: 'HIVER25',
    saison: 'hiver',
    annee: 2025,
    dateDebut: '2025-10-31',
    dateFin: '2026-04-10',
    actif: true,
    categories: [
      { nom: 'Croger', recettes: [
        { nom: 'Bourguignon croger', prix: 12.90 },
        { nom: 'Canard croger', prix: 15.90 },
        { nom: 'Pulled pork croger', prix: 12.90 },
        { nom: 'Raclette croger', prix: 13.90 },
        { nom: 'sup rac croger', prix: 3.90 },
        { nom: 'Polpette croger', prix: 13.90 },
        { nom: 'Forestier croger', prix: 11.90 },
        { nom: 'sup for croger', prix: 3.90 },
        { nom: 'Poulet croger', prix: 12.90 },
        { nom: 'Dinde croger', prix: 13.90 },
        { nom: 'Ratatouille croger', prix: 9.90 },
        { nom: 'Rougail croger', prix: 13.90 },
        { nom: 'Jambon croger', prix: 7.90 },
        { nom: 'Thon croger', prix: 9.90 },
        { nom: 'Pastrami croger', prix: 13.90 },
        { nom: 'Caprese croger', prix: 10.90 },
        { nom: 'Camembertha croger', prix: 15.90 },
        { nom: 'Tartare croger', prix: 1.00 },
      ]},
      { nom: 'Mini Croger', recettes: [
        { nom: 'Bourguignon mini croger', prix: 6.63 },
        { nom: 'Pulled pork mini croger', prix: 6.63 },
        { nom: 'Poulet mini croger', prix: 6.63 },
        { nom: 'Raclette mini croger', prix: 6.63 },
        { nom: 'Forestier mini croger', prix: 6.63 },
        { nom: 'Dinde mini croger', prix: 13.90 },
        { nom: 'Jambon mini croger', prix: 7.90 },
        { nom: 'Thon mini croger', prix: 9.90 },
        { nom: 'Pastrami mini croger', prix: 13.90 },
        { nom: 'Caprese mini croger', prix: 10.90 },
        { nom: 'Ratatouille mini croger', prix: 9.90 },
        { nom: 'Canard mini croger', prix: 6.63 },
        { nom: 'Polpette mini croger', prix: 13.90 },
      ]},
      { nom: 'Bols', recettes: [
        { nom: 'Bourguignon bol', prix: 14.90 },
        { nom: 'Pulled pork bol', prix: 14.90 },
        { nom: 'Poulet bol', prix: 14.90 },
        { nom: 'Forestier bol', prix: 14.90 },
        { nom: 'Rougail bol', prix: 14.90 },
        { nom: 'Raclette bol', prix: 14.90 },
        { nom: 'Dinde bol', prix: 14.90 },
        { nom: 'Jambon bol', prix: 14.90 },
        { nom: 'Thon bol', prix: 14.90 },
        { nom: 'Pastrami bol', prix: 14.90 },
        { nom: 'Caprese bol', prix: 14.90 },
        { nom: 'Ratatouille bol', prix: 14.90 },
      ]},
      { nom: 'Entrées', recettes: [
        { nom: 'Velouté entrée', prix: 7.50 },
        { nom: 'Œuf entrée', prix: 7.90 },
        { nom: 'Avocado entrée', prix: 8.90 },
        { nom: 'Camembert entrée', prix: 6.90 },
        { nom: 'Burrata entrée', prix: 9.00 },
        { nom: 'Salmon entrée', prix: 8.90 },
        { nom: 'Guaca entrée', prix: 7.00 },
      ]},
      { nom: 'Sides', recettes: [
        { nom: 'Potatoes', prix: 5.90 },
        { nom: 'Polenta', prix: 5.90 },
        { nom: 'Fraicheur', prix: 4.90 },
        { nom: 'Salade pdt', prix: 5.90 },
      ]},
      { nom: 'Desserts', recettes: [
        { nom: 'Micuit', prix: 6.90 },
        { nom: 'Crumble', prix: 5.90 },
        { nom: 'Croissant choco', prix: 8.90 },
        { nom: 'Crème Brulée', prix: 4.90 },
        { nom: 'Croissant perdu', prix: 8.90 },
        { nom: 'Café gour', prix: 9.90 },
      ]},
      { nom: 'Grignotage', recettes: [
        { nom: 'PLANCHE', prix: 14.90 },
      ]},
    ],
  },
  {
    nom: 'ETE25',
    saison: 'été',
    annee: 2025,
    dateDebut: '2025-05-08',
    dateFin: '2025-10-30',
    actif: true,
    categories: [
      { nom: 'Croger', recettes: [
        { nom: 'Bourguignon croger', prix: 13.90 },
        { nom: 'Pulled pork croger', prix: 13.90 },
        { nom: 'Poulet croger', prix: 13.90 },
        { nom: 'Caprese croger', prix: 12.90 },
        { nom: 'Ratatouille croger', prix: 11.90 },
        { nom: 'Polpette croger', prix: 13.90 },
        { nom: 'Tartare croger', prix: 13.90 },
        { nom: 'Thon croger', prix: 12.90 },
        { nom: 'Dinde croger', prix: 13.90 },
        { nom: 'Jambon croger', prix: 8.90 },
      ]},
      { nom: 'Mini Croger', recettes: [
        { nom: 'Bourguignon mini croger', prix: 6.63 },
        { nom: 'Pulled pork mini croger', prix: 6.63 },
        { nom: 'Poulet mini croger', prix: 6.63 },
        { nom: 'Tartare croger', prix: 6.63 },
        { nom: 'Thon mini croger', prix: 6.63 },
      ]},
      { nom: 'Bols', recettes: [
        { nom: 'Bourguignon bol', prix: 14.90 },
        { nom: 'Pulled pork bol', prix: 14.90 },
        { nom: 'Poulet bol', prix: 14.90 },
        { nom: 'Caprese bol', prix: 14.90 },
        { nom: 'Ratatouille bol', prix: 14.90 },
      ]},
      { nom: 'Entrées', recettes: [
        { nom: 'Œuf entrée', prix: 7.90 },
        { nom: 'Avocado entrée', prix: 8.90 },
        { nom: 'Camembert entrée', prix: 6.90 },
      ]},
      { nom: 'Sides', recettes: [
        { nom: 'Potatoes', prix: 5.90 },
        { nom: 'Salade pdt', prix: 5.90 },
        { nom: 'Fraicheur', prix: 4.90 },
      ]},
      { nom: 'Desserts', recettes: [
        { nom: 'Micuit', prix: 6.90 },
        { nom: 'Crumble', prix: 5.90 },
        { nom: 'Croissant choco', prix: 8.90 },
        { nom: 'Crème Brulée', prix: 4.90 },
        { nom: 'Croissant perdu', prix: 8.90 },
        { nom: 'Café gour', prix: 9.90 },
      ]},
      { nom: 'Grignotage', recettes: [
        { nom: 'PLANCHE', prix: 13.90 },
      ]},
    ],
  },
  {
    nom: 'HIVER24',
    saison: 'hiver',
    annee: 2024,
    dateDebut: '2024-10-31',
    dateFin: '2025-05-07',
    actif: true,
    categories: [
      { nom: 'Croger', recettes: [
        { nom: 'Bourguignon croger', prix: 13.90 },
        { nom: 'Pulled pork croger', prix: 13.90 },
        { nom: 'Forestier croger', prix: 13.90 },
        { nom: 'Raclette croger', prix: 15.90 },
        { nom: 'sup rac croger', prix: 3.90 },
        { nom: 'Ratatouille croger', prix: 11.90 },
        { nom: 'Polpette croger', prix: 13.90 },
        { nom: 'Rougail croger', prix: 15.90 },
        { nom: 'Poulet croger', prix: 13.90 },
        { nom: 'Jambon croger', prix: 8.90 },
      ]},
      { nom: 'Mini Croger', recettes: [
        { nom: 'Bourguignon mini croger', prix: 6.63 },
        { nom: 'Pulled pork mini croger', prix: 6.63 },
        { nom: 'Poulet mini croger', prix: 6.63 },
        { nom: 'Forestier mini croger', prix: 6.63 },
      ]},
      { nom: 'Bols', recettes: [
        { nom: 'Bourguignon bol', prix: 14.90 },
        { nom: 'Pulled pork bol', prix: 14.90 },
        { nom: 'Poulet bol', prix: 14.90 },
        { nom: 'Rougail bol', prix: 14.90 },
        { nom: 'Forestier bol', prix: 14.90 },
      ]},
      { nom: 'Entrées', recettes: [
        { nom: 'Velouté entrée', prix: 6.50 },
        { nom: 'Œuf entrée', prix: 7.90 },
        { nom: 'Avocado entrée', prix: 8.90 },
        { nom: 'Camembert entrée', prix: 6.90 },
      ]},
      { nom: 'Sides', recettes: [
        { nom: 'Potatoes', prix: 4.90 },
        { nom: 'Fraicheur', prix: 4.90 },
      ]},
      { nom: 'Desserts', recettes: [
        { nom: 'Micuit', prix: 6.90 },
        { nom: 'Crumble', prix: 5.90 },
        { nom: 'Crème Brulée', prix: 5.90 },
        { nom: 'Croissant perdu', prix: 8.90 },
        { nom: 'Café gour', prix: 9.90 },
      ]},
      { nom: 'Grignotage', recettes: [
        { nom: 'PLANCHE', prix: 13.90 },
      ]},
    ],
  },
];

async function run() {
  const snap = await db.collection('recettes').get();
  const recettesMap = {};
  snap.docs.forEach(d => { recettesMap[d.data().nom] = d.id; });

  for (const menu of MENUS) {
    // Supprimer l'ancien si existe
    const existing = await db.collection('menus').where('nom', '==', menu.nom).get();
    for (const d of existing.docs) await d.ref.delete();

    const categories = menu.categories.map(cat => ({
      nom: cat.nom,
      recettes: cat.recettes.map(r => {
        const id = recettesMap[r.nom];
        if (!id) console.warn(`⚠️  ${menu.nom} - Recette introuvable: "${r.nom}"`);
        return id ? { id, prixVente: r.prix } : null;
      }).filter(Boolean),
    }));

    const { categories: _, ...menuData } = menu;
    await db.collection('menus').add({
      ...menuData,
      categories,
      createdAt: new Date().toISOString(),
    });

    const total = categories.reduce((s, c) => s + c.recettes.length, 0);
    console.log(`✅ ${menu.nom} créé → ${total} recettes`);
  }

  // Aussi écrire les prix par menu sur les recettes
  console.log('\nMise à jour des prix par menu sur les recettes...');
  let updated = 0;
  for (const menu of MENUS) {
    const fieldName = 'prix' + menu.nom;
    for (const cat of menu.categories) {
      for (const r of cat.recettes) {
        const id = recettesMap[r.nom];
        if (id) {
          await db.collection('recettes').doc(id).update({ [fieldName]: r.prix });
          updated++;
        }
      }
    }
  }
  console.log(`✅ ${updated} prix par menu écrits`);
}

run().catch(console.error);
