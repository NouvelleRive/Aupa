import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolve } from 'path';

const app = initializeApp({ credential: cert(resolve(__dirname, '../serviceAccountKey.json')) });
const db = getFirestore(app);

async function main() {
  console.log('=== Ratatouille été/hiver ===\n');
  const now = new Date().toISOString();

  const recSnap = await db.collection('recettes').get();
  const all = recSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // ── 1. Trouver et renommer la prépa ratatouille ──
  console.log('1) Prépa ratatouille → Prépa ratatouille été (déjà fait)');
  const prepaRatat = all.find(r => r.categorie === 'Préparations' && (r.nom === 'Prépa ratatouille été' || r.nom === 'Ratatouille' || r.nom === 'Prépa ratatouille'));
  if (!prepaRatat) { console.log('   ⚠ Prépa Ratatouille non trouvée'); return; }
  console.log(`   ✔ ${prepaRatat.id}\n`);

  // ── 2. Créer Prépa ratatouille hiver (vide) ──
  console.log('2) Prépa ratatouille hiver');
  let prepaHiver = all.find(r => r.categorie === 'Préparations' && r.nom === 'Prépa ratatouille hiver');
  if (!prepaHiver) {
    const prepaHiverRef = db.collection('recettes').doc();
    await prepaHiverRef.set({
      nom: 'Prépa ratatouille hiver', categorie: 'Préparations', type: 'food', actif: true,
      ingredients: [], options: [], coutCalcule: 0, saisons: [], carte: '', prixVente: 0, updatedAt: now,
    });
    prepaHiver = { id: prepaHiverRef.id };
    console.log(`   ✔ créée ${prepaHiverRef.id}\n`);
  } else {
    console.log(`   ✔ existe déjà ${prepaHiver.id}\n`);
  }
  const prepaHiverId = prepaHiver.id;

  // ── 3. Mettre à jour les refs "Prépa ratatouille" → "Prépa ratatouille été" dans toutes les recettes ──
  console.log('3) nomIngredient → Prépa ratatouille été (déjà fait)\n');

  // ── 4. Renommer les recettes et créer les versions hiver ──
  console.log('\n4) Renommer recettes → été + dupliquer → hiver');

  // Trouver toutes les recettes qui utilisaient ratatouille (hors Préparations)
  const recettesRatat = all.filter(r =>
    r.categorie !== 'Préparations' &&
    (r.ingredients || []).some((i: any) =>
      i.nomIngredient === 'Ratatouille' || i.nomIngredient === 'Prépa ratatouille' || i.nomIngredient === 'Prépa ratatouille été'
    )
  );

  for (const r of recettesRatat) {
    // Le nom a peut-être déjà été mis à jour par l'étape 3, relire
    const freshDoc = await db.collection('recettes').doc(r.id).get();
    const freshData = freshDoc.data()!;
    const currentNom = freshData.nom;

    // Ajouter "été" si pas déjà fait
    const nomEte = currentNom.endsWith(' été') ? currentNom : `${currentNom} été`;
    if (nomEte !== currentNom) {
      await db.collection('recettes').doc(r.id).update({ nom: nomEte });
      console.log(`   ✔ "${currentNom}" → "${nomEte}"`);
    } else {
      console.log(`   ✔ "${nomEte}" (déjà renommé)`);
    }

    // Dupliquer → hiver
    const nomHiver = nomEte.replace(/ été$/, ' hiver');
    const hiverIngs = (freshData.ingredients || []).map((i: any) => {
      if (i.nomIngredient === 'Prépa ratatouille été' || i.nomIngredient === 'Ratatouille' || i.nomIngredient === 'Prépa ratatouille') {
        return { ...i, nomIngredient: 'Prépa ratatouille hiver', recetteId: prepaHiverId };
      }
      return i;
    });
    const { id: _id, ...dataWithoutId } = freshData as any;
    await db.collection('recettes').add({
      ...dataWithoutId,
      nom: nomHiver,
      ingredients: hiverIngs,
      updatedAt: now,
    });
    console.log(`   + "${nomHiver}" (dupliqué)`);
  }

  // ── 5. Créer les sides ratatouille été + hiver ──
  console.log('\n5) Créer sides Ratatouille');
  const sideEte = {
    nom: 'Ratatouille side été', categorie: 'Sides', type: 'food', actif: true,
    ingredients: [{ nomIngredient: 'Prépa ratatouille été', grammage: 0 }],
    options: [], coutCalcule: 0, saisons: [], carte: '', prixVente: 0, updatedAt: now,
  };
  const sideHiver = {
    nom: 'Ratatouille side hiver', categorie: 'Sides', type: 'food', actif: true,
    ingredients: [{ nomIngredient: 'Prépa ratatouille hiver', grammage: 0, recetteId: prepaHiverId }],
    options: [], coutCalcule: 0, saisons: [], carte: '', prixVente: 0, updatedAt: now,
  };
  await db.collection('recettes').add(sideEte);
  console.log(`   ✔ "${sideEte.nom}"`);
  await db.collection('recettes').add(sideHiver);
  console.log(`   ✔ "${sideHiver.nom}"`);

  console.log('\n=== Terminé ===');
}

main().catch(err => { console.error('Erreur:', err); process.exit(1); });
