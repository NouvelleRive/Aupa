import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// Usage: npx tsx scripts/menu-ajouter-recette.ts <menuId> <categorie> <recetteId> <prixVente> [--apply]
const [menuId, categorie, recetteId, prixStr] = process.argv.slice(2);
const APPLY = process.argv.includes('--apply');
const prixVente = parseFloat(prixStr);

(async () => {
  if (!menuId || !categorie || !recetteId || isNaN(prixVente)) { console.log('Arguments manquants'); process.exit(1); }
  const ref = doc(db, 'menus', menuId);
  const m = (await getDoc(ref)).data() as any;
  const r = (await getDoc(doc(db, 'recettes', recetteId))).data() as any;
  if (!r) { console.log('Recette introuvable'); process.exit(1); }
  const cat = m.categories.find((c: any) => c.nom === categorie);
  if (!cat) { console.log(`Catégorie "${categorie}" absente de ${m.nom}`); process.exit(1); }
  if (m.categories.some((c: any) => c.recettes.some((x: any) => x.id === recetteId))) { console.log(`${r.nom} déjà dans ${m.nom}`); process.exit(1); }
  console.log(`${m.nom} / ${categorie} : ajoute ${r.nom} à ${prixVente} €`);
  if (!APPLY) { console.log('(dry-run)'); process.exit(0); }
  cat.recettes.push({ id: recetteId, prixVente });
  await updateDoc(ref, { categories: m.categories });
  console.log('OK');
  process.exit(0);
})();
