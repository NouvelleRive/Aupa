// Upsert produitsFournisseurs + tracking achats — version Node, partagée par
// l'API gmail/sync. Utilise le SDK firebase client (déjà importé via @/lib/firebase).

import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import type { LigneFacture, LigneAssembleurs } from './fournisseurs';

type FournisseurName = 'Foodflow' | 'Milliet' | 'LBA' | 'MPF' | 'Les Assembleurs';

const CODE_FIELD: Record<Exclude<FournisseurName, 'Les Assembleurs'>, string> = {
  Foodflow: 'foodflowCode',
  Milliet: 'millietCode',
  LBA: 'lbaCode',
  MPF: 'mpfCode',
};

function detectUnite(nom: string): string {
  const n = nom.toLowerCase();
  if (n.includes('1kg') || n.includes('2kg') || n.includes('5kg') || /\d+kg/.test(n)) return 'kg';
  if (n.includes('500g') || n.includes('150g') || n.includes('125g') || /\d+g[^r]/.test(n)) return 'g';
  if (n.includes('1l') || n.includes('5l') || n.includes('1.5l') || /\d+l$/.test(n)) return 'L';
  if (n.includes('cl')) return 'cL';
  if (n.includes('botte') || n.includes('pièce') || /x\s?\d+/.test(n)) return 'pièce';
  if (n.includes('lot')) return 'lot';
  return 'pièce';
}

function detectCategorie(nom: string): string {
  const n = nom.toLowerCase();
  if (/poulet|porc|steak|jambon|veau|boeuf/.test(n)) return 'viande';
  if (/saumon|thon|cabillaud/.test(n)) return 'poisson';
  if (/lait|feta|cheddar|emmental|tomme|fromage|oeuf/.test(n)) return 'laitage';
  if (/tomate|salade|carotte|poivron|champignon|avocat|menthe|ciboulette|persil|coriandre|romarin|patate|butternut|panais|pdt|pousse/.test(n)) return 'légume';
  if (/citron|orange|banane/.test(n)) return 'fruit';
  if (/huile|ketchup|vinaigre|riz|ail|amande|cacahuète|concentré|polpa|jus de veau/.test(n)) return 'épicerie salée';
  if (/bière|vin|jus/.test(n)) return 'boisson';
  return 'épicerie salée';
}

export async function upsertLignesFournisseur(
  fournisseur: Exclude<FournisseurName, 'Les Assembleurs'>,
  lignes: LigneFacture[],
): Promise<{ created: number; updated: number; achatsCreated: number }> {
  if (lignes.length === 0) return { created: 0, updated: 0, achatsCreated: 0 };
  const codeField = CODE_FIELD[fournisseur];

  // Trier par date pour que le prix le plus récent écrase le précédent
  lignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  let created = 0, updated = 0;
  const parCode = new Map<string, LigneFacture[]>();
  for (const l of lignes) {
    if (!parCode.has(l.code)) parCode.set(l.code, []);
    parCode.get(l.code)!.push(l);
  }

  const pfIdParCode = new Map<string, string>();
  for (const [code, group] of parCode.entries()) {
    const derniere = group[group.length - 1];
    const match = existing.find((ing: any) => ing[codeField] === code);
    if (match) {
      pfIdParCode.set(code, match.id);
      const histExist = match.historiquesPrix || [];
      const datesExist = new Set(histExist.map((h: any) => h.date));
      const nouveaux = group
        .map((l) => ({ date: l.date, prix: l.prix }))
        .filter((h) => !datesExist.has(h.date));
      if (nouveaux.length > 0) {
        await updateDoc(doc(db, 'produitsFournisseurs', match.id), {
          prix: derniere.prix,
          historiquesPrix: [...histExist, ...nouveaux],
          updatedAt: nouveaux[nouveaux.length - 1].date,
        });
      }
      updated++;
    } else {
      const uniteDetectee = derniere.unite
        ? (derniere.unite === 'p' ? 'pièce' : derniere.unite)
        : detectUnite(derniere.nom);
      const matchQte = derniere.nom.match(/[xX]\s?(\d+)/);
      const quantite = derniere.unite ? derniere.qte : (matchQte ? parseInt(matchQte[1]) : 1);
      const newPf = await addDoc(collection(db, 'produitsFournisseurs'), {
        nom: derniere.nom,
        prix: derniere.prix,
        unite: uniteDetectee,
        categorie: fournisseur === 'Foodflow' ? detectCategorie(derniere.nom) : 'boisson',
        rendement: 1,
        quantite,
        fournisseur,
        [codeField]: code,
        historiquesPrix: group.map((l) => ({ date: l.date, prix: l.prix })),
        updatedAt: derniere.date,
      });
      pfIdParCode.set(code, newPf.id);
      created++;
    }
  }

  // Tracker achats
  const achatsSnap = await getDocs(collection(db, 'achats'));
  const achatsExist = new Set(
    achatsSnap.docs.map((d) => {
      const data = d.data();
      return `${data.pfId}|${data.date}|${data.qte}`;
    }),
  );
  let achatsCreated = 0;
  for (const l of lignes) {
    const pfId = pfIdParCode.get(l.code);
    if (!pfId) continue;
    const key = `${pfId}|${l.date}|${l.qte}`;
    if (achatsExist.has(key)) continue;
    await addDoc(collection(db, 'achats'), {
      pfId, code: l.code, nom: l.nom,
      qte: l.qte, prixUnitaire: l.prix, total: l.prix * l.qte,
      date: l.date, fournisseur,
    });
    achatsCreated++;
  }

  return { created, updated, achatsCreated };
}

export async function upsertLignesAssembleurs(
  lignes: LigneAssembleurs[],
): Promise<{ created: number; updated: number }> {
  if (lignes.length === 0) return { created: 0, updated: 0 };
  lignes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const existingSnap = await getDocs(collection(db, 'produitsFournisseurs'));
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const ingSnap = await getDocs(collection(db, 'ingredients'));
  const ingMap: Record<string, string> = {};
  for (const d of ingSnap.docs) ingMap[d.data().nom] = d.id;

  let created = 0, updated = 0;
  for (const l of lignes) {
    const quantiteLitres = l.qte * 20;
    const ingredientId = ingMap[l.ingredient] || null;
    const match = existing.find((p: any) => p.fournisseur === 'Les Assembleurs' && p.ingredient === l.ingredient);

    if (match) {
      const histExist = match.historiquesPrix || [];
      const datesExist = new Set(histExist.map((h: any) => h.date));
      const updateData: any = {
        nom: l.nom,
        prix: l.prix,
        quantite: quantiteLitres,
        updatedAt: l.date,
      };
      if (!datesExist.has(l.date)) {
        updateData.historiquesPrix = [...histExist, { date: l.date, prix: l.prix }];
      }
      if (ingredientId && !match.ingredientId) updateData.ingredientId = ingredientId;
      await updateDoc(doc(db, 'produitsFournisseurs', match.id), updateData);
      updated++;
    } else {
      const data: any = {
        nom: l.nom,
        ingredient: l.ingredient,
        prix: l.prix,
        quantite: quantiteLitres,
        unite: 'L',
        categorie: 'boisson',
        rendement: 1,
        fournisseur: 'Les Assembleurs',
        historiquesPrix: [{ date: l.date, prix: l.prix }],
        updatedAt: l.date,
      };
      if (ingredientId) data.ingredientId = ingredientId;
      await addDoc(collection(db, 'produitsFournisseurs'), data);
      created++;
    }
  }
  return { created, updated };
}
