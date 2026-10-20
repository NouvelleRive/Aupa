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

// Une ligne de facture est facturée au colis (prix de la poche/du carton).
// Si le PF est stocké au poids/volume (kg, g, L, cL), il faut convertir via le
// poids lu dans le libellé, sinon on écrit 108 €/kg pour une poche de 8,64 kg.
// Retourne le prix au format du PF, `undefined` si la ligne n'a pas de poids
// (comportement historique), ou `null` si le poids est seulement approximatif
// ("~4kg") → on ne touche pas au prix (la lecture du site fait foi).
const POIDS_RE = /(~\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|cl|l)\b/gi;
const VERS_BASE: Record<string, number> = { kg: 1, g: 0.001, l: 1, cl: 0.01 };
const PF_UNITE_BASE: Record<string, number> = { kg: 1, g: 0.001, l: 1, cl: 0.01 };

export function prixLigneAuFormatPF(l: LigneFacture, pf: { unite?: string; quantite?: number }): number | null | undefined {
  const pfBase = PF_UNITE_BASE[(pf.unite || '').toLowerCase()];
  if (!pfBase) return undefined; // PF à la pièce : le prix facture est déjà le bon
  const poids = [...l.nom.matchAll(POIDS_RE)].map(m => ({
    approx: !!m[1],
    base: parseFloat(m[2].replace(',', '.')) * VERS_BASE[m[3].toLowerCase()],
  })).filter(p => p.base > 0);
  if (poids.length === 0) return undefined;
  const reel = poids.filter(p => !p.approx);
  if (reel.length === 0) return null;
  // Colis multiple : "6x1L", "6X75CL", "1L x6"
  const mult = l.nom.match(/(\d+)\s*[x×]\s*(?=\d)/i) || l.nom.match(/[x×]\s*(\d+)\b(?!\s*(?:kg|g|cl|l)\b)/i);
  const poidsBase = reel[reel.length - 1].base * (mult ? parseInt(mult[1]) : 1); // le poids réel est ajouté en fin de libellé
  return Math.round((l.prix / poidsBase) * pfBase * (pf.quantite || 1) * 100) / 100;
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
        .filter((l) => !datesExist.has(l.date))
        .map((l) => {
          const p = fournisseur === 'Foodflow' ? prixLigneAuFormatPF(l, match) : undefined;
          return p === null ? null : { date: l.date, prix: p ?? l.prix };
        })
        .filter((h): h is { date: string; prix: number } => h !== null);
      if (nouveaux.length > 0) {
        await updateDoc(doc(db, 'produitsFournisseurs', match.id), {
          prix: nouveaux[nouveaux.length - 1].prix,
          historiquesPrix: [...histExist, ...nouveaux],
          updatedAt: nouveaux[nouveaux.length - 1].date,
        });
      }
      updated++;
    } else {
      // Extraire unite et quantite (contenance) depuis le champ unite du parser
      // Format Milliet : "70cL", "1L", "4.5L" — sinon fallback sur détection auto
      let uniteDetectee: string;
      let quantite: number;
      const contenanceMatch = derniere.unite?.match(/^(\d+\.?\d*)(cL|L)$/i);
      if (contenanceMatch) {
        const val = parseFloat(contenanceMatch[1]);
        const u = contenanceMatch[2].toLowerCase();
        // Normaliser en cL pour les petits volumes, L pour les grands
        if (u === 'l') {
          uniteDetectee = 'L';
          quantite = val;
        } else {
          uniteDetectee = 'cL';
          quantite = val;
        }
      } else if (derniere.unite && derniere.unite !== 'p') {
        uniteDetectee = derniere.unite;
        quantite = derniere.qte;
      } else {
        uniteDetectee = derniere.unite === 'p' ? 'pièce' : detectUnite(derniere.nom);
        const matchQte = derniere.nom.match(/[xX]\s?(\d+)/);
        quantite = matchQte ? parseInt(matchQte[1]) : 1;
      }
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
