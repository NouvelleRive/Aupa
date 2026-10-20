import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/firebase';
import { collection, getDocs, query, where, deleteDoc, updateDoc, doc } from 'firebase/firestore';

// Usage: npx tsx scripts/dedup-menu-hiver26.ts [--apply]
// Garde le premier HIVER26 créé, supprime les doublons (identiques, 0 vente),
// et remet les dates au format ISO (YYYY-MM-DD) comme les autres menus.
const APPLY = process.argv.includes('--apply');
const frToIso = (s: string) => { const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s; };

async function main() {
  const snap = await getDocs(query(collection(db, 'menus'), where('nom', '==', 'HIVER26')));
  const docs = snap.docs.sort((a, b) => a.data().createdAt.localeCompare(b.data().createdAt));
  const stable = (v: any): any => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  const strip = (d: any) => { const { createdAt, ...rest } = d; return JSON.stringify(stable(rest)); };
  const ref = strip(docs[0].data());
  const identiques = docs.every(d => strip(d.data()) === ref);
  console.log(`${docs.length} docs HIVER26, contenus identiques : ${identiques}`);
  if (!identiques) { console.log('Contenus différents, on ne touche à rien.'); process.exit(1); }
  const [keep, ...dupes] = docs;
  const k = keep.data();
  console.log(`Garde ${keep.id}, dates ${k.dateDebut}→${k.dateFin} => ${frToIso(k.dateDebut)}→${frToIso(k.dateFin)}`);
  console.log(`Supprime : ${dupes.map(d => d.id).join(', ')}`);
  if (!APPLY) { console.log('(dry-run)'); process.exit(0); }
  for (const d of dupes) await deleteDoc(doc(db, 'menus', d.id));
  await updateDoc(doc(db, 'menus', keep.id), { dateDebut: frToIso(k.dateDebut), dateFin: frToIso(k.dateFin) });
  console.log('OK');
  process.exit(0);
}
main();
