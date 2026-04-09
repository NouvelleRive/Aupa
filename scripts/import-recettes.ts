import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

const recettes = JSON.parse(readFileSync(resolve(__dirname, '../recettes_export.json'), 'utf8'));

async function run() {
  // 1. Lire les anciennes recettes pour mapper ancien ID → nom
  console.log('Lecture des anciennes recettes...');
  const oldSnap = await db.collection('recettes').get();
  const oldIdToNom = new Map<string, string>();
  for (const d of oldSnap.docs) {
    oldIdToNom.set(d.id, d.data().nom as string);
  }
  console.log(`  ${oldSnap.size} anciennes recettes lues.`);

  // 2. Supprimer toutes les recettes existantes
  console.log('Suppression des recettes existantes...');
  const batchSize = 500;
  let deleted = 0;
  let batch = db.batch();
  for (const doc of oldSnap.docs) {
    batch.delete(doc.ref);
    deleted++;
    if (deleted % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (deleted % batchSize !== 0) await batch.commit();
  console.log(`  ${oldSnap.size} recettes supprimées.`);

  // 3. Importer les nouvelles recettes et collecter nom → nouveau ID
  console.log('Import des nouvelles recettes...');
  const nomToNewId = new Map<string, string[]>(); // nom → [ids] (peut y avoir des doublons de nom)
  let created = 0;
  batch = db.batch();
  for (const r of recettes) {
    const ref = db.collection('recettes').doc();
    batch.set(ref, {
      nom: r.nom,
      categorie: r.categorie,
      type: r.type,
      actif: true,
      prixVente: r.prixVente || 0,
      ingredients: r.ingredients || [],
      options: [],
      coutCalcule: 0,
      ...(r.quantiteProduite ? { quantiteProduite: r.quantiteProduite, uniteProduction: 'kg' } : {}),
      updatedAt: new Date().toISOString(),
    });
    if (!nomToNewId.has(r.nom)) nomToNewId.set(r.nom, []);
    nomToNewId.get(r.nom)!.push(ref.id);
    created++;
    if (created % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (created % batchSize !== 0) await batch.commit();
  console.log(`  ✅ ${created} recettes importées.`);

  // 4. Remapper les menus : ancien ID → nom → nouveau ID
  console.log('\nMise à jour des menus...');
  const menuSnap = await db.collection('menus').get();
  let menusUpdated = 0;
  let refsFixed = 0;
  let refsNotFound = 0;

  // Pour les recettes avec le même nom dans différentes catégories,
  // on utilise la catégorie du menu pour choisir
  const recettesByCatAndNom = new Map<string, string>();
  for (const r of recettes) {
    const key = `${r.categorie}|${r.nom}`;
    recettesByCatAndNom.set(key, nomToNewId.get(r.nom)?.[0] || '');
  }

  for (const menuDoc of menuSnap.docs) {
    const menu = menuDoc.data();
    const cats = menu.categories || [];
    let changed = false;

    const newCats = cats.map((cat: any) => {
      const recettesList = cat.recettes || cat.recetteIds?.map((id: string) => ({ id, prixVente: 0 })) || [];
      const newRecettes = recettesList.map((mr: any) => {
        const oldNom = oldIdToNom.get(mr.id);
        if (!oldNom) {
          console.log(`    ⚠️  Menu ${menu.nom} / ${cat.nom}: ID ${mr.id} inconnu`);
          refsNotFound++;
          return mr;
        }

        // Chercher par catégorie + nom d'abord, puis par nom seul
        const catKey = `${cat.nom}|${oldNom}`;
        let newId = recettesByCatAndNom.get(catKey);
        if (!newId) {
          const ids = nomToNewId.get(oldNom);
          newId = ids?.[0];
        }

        if (newId) {
          changed = true;
          refsFixed++;
          return { ...mr, id: newId };
        } else {
          console.log(`    ⚠️  Menu ${menu.nom} / ${cat.nom}: "${oldNom}" pas trouvée dans l'import`);
          refsNotFound++;
          return mr;
        }
      });

      return { nom: cat.nom, recettes: newRecettes };
    });

    if (changed) {
      await menuDoc.ref.update({ categories: newCats });
      menusUpdated++;
      console.log(`  ✅ Menu "${menu.nom}" mis à jour`);
    }
  }

  console.log(`\n=== Résultat ===`);
  console.log(`  ${created} recettes importées`);
  console.log(`  ${menusUpdated} menus mis à jour`);
  console.log(`  ${refsFixed} références corrigées`);
  console.log(`  ${refsNotFound} références non trouvées`);
}

run().catch(console.error);
