// Recovery route — incident 2026-04-25 (uniquement les 23 PF Foodflow corrompus)
//
// Stratégie :
//   - nom + prix + qte : depuis la collection `achats` (mode du nom + dernier achat pour prix/qte)
//   - unite : re-parsée depuis la dernière facture Foodflow Gmail contenant ce code
//   - on retire les flags ajoutés par la route bug : proposition, sku, url, ingredientId, ingredient
//
// Ne touche PAS aux 248 garbage — supprimés séparément après validation.
//
// USAGE :
//   GET /api/recovery/foodflow-restore           → dry-run (rapport JSON, aucune écriture)
//   GET /api/recovery/foodflow-restore?apply=1   → applique
//
// À SUPPRIMER après usage.

import { NextResponse, NextRequest } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/googleAuth';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, getDoc, updateDoc, deleteField,
} from 'firebase/firestore';
import { parseFoodflowPDF, type LigneFacture } from '@/lib/parsers/fournisseurs';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function getGmailClient() {
  const configDoc = await getDoc(doc(db, 'config', 'gmail'));
  if (!configDoc.exists()) throw new Error('Gmail not connected.');
  const { refresh_token } = configDoc.data() as { refresh_token: string };
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

type AnyPF = {
  id: string;
  fournisseur?: string;
  proposition?: boolean;
  foodflowCode?: string;
  nom?: string;
  prix?: number;
  unite?: string;
  quantite?: number;
};

type Achat = {
  pfId?: string;
  code?: string;
  nom?: string;
  qte?: number;
  prixUnitaire?: number;
  date?: string;
  fournisseur?: string;
};

function modeName(achats: Achat[]): string | undefined {
  const counts = new Map<string, number>();
  for (const a of achats) {
    if (!a.nom) continue;
    counts.set(a.nom, (counts.get(a.nom) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) { best = n; bestCount = c; }
  }
  return best;
}

function collectAttachments(parts: any[]): any[] {
  const out: any[] = [];
  for (const p of parts || []) {
    if (p.filename && p.filename.toLowerCase().endsWith('.pdf') && p.body?.attachmentId) out.push(p);
    if (p.parts) out.push(...collectAttachments(p.parts));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const apply = req.nextUrl.searchParams.get('apply') === '1';
  const log: string[] = [];
  const push = (s: string) => { log.push(s); };

  push(`Mode : ${apply ? 'APPLY' : 'DRY-RUN'}`);

  // 1. Charger PF + achats
  const [pfSnap, achatsSnap] = await Promise.all([
    getDocs(collection(db, 'produitsFournisseurs')),
    getDocs(collection(db, 'achats')),
  ]);
  const allPfs = pfSnap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AnyPF, 'id'>) }));
  const allAchats = achatsSnap.docs.map(d => d.data() as Achat);

  const corrompus = allPfs.filter(p => p.fournisseur === 'Foodflow' && p.proposition === true && p.foodflowCode);
  push(`Corrompus à restaurer : ${corrompus.length}`);

  if (corrompus.length === 0) {
    return NextResponse.json({ ok: true, log, summary: { corrompus: 0 } });
  }

  // 2. Pour chaque PF, calculer nom (mode des achats) + prix/qte (dernier achat)
  type Plan = {
    pfId: string;
    foodflowCode: string;
    current: { nom?: string; prix?: number; unite?: string; quantite?: number };
    fromAchats: { nom?: string; prix?: number; qte?: number };
    fromPdf?: { unite?: string; nom?: string; qte?: number; prix?: number; date?: string };
    final: { nom?: string; prix?: number; unite?: string; quantite?: number };
  };
  const plans: Plan[] = corrompus.map(pf => {
    const achatsForPf = allAchats.filter(a => a.pfId === pf.id);
    const nomMode = modeName(achatsForPf);
    const sorted = [...achatsForPf].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const last = sorted[sorted.length - 1];
    return {
      pfId: pf.id,
      foodflowCode: pf.foodflowCode!,
      current: { nom: pf.nom, prix: pf.prix, unite: pf.unite, quantite: pf.quantite },
      fromAchats: { nom: nomMode, prix: last?.prixUnitaire, qte: last?.qte },
      final: { nom: nomMode, prix: last?.prixUnitaire, quantite: last?.qte },
    };
  });

  // 3. Re-parser les PDFs Gmail Foodflow pour récupérer l'unite originale par code
  push('\nLecture Gmail Foodflow pour récupérer les unite originales...');
  const codesNeeded = new Set(plans.map(p => p.foodflowCode));
  const gmail = await getGmailClient();

  const allMsgIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const list = await gmail.users.messages.list({
      userId: 'me', q: 'from:compta@foodflow.fr', maxResults: 100, pageToken,
    });
    for (const m of (list.data.messages || [])) if (m.id) allMsgIds.push(m.id);
    pageToken = list.data.nextPageToken || undefined;
  } while (pageToken);
  push(`${allMsgIds.length} mails Foodflow listés`);

  // Récupère les mails du plus récent au plus ancien (Gmail messages.list est déjà desc)
  const lignesByCode = new Map<string, LigneFacture>();
  let pdfCount = 0;
  for (const msgId of allMsgIds) {
    if (codesNeeded.size === 0) break;
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id: msgId });
      const attachments = collectAttachments(msg.data.payload?.parts || []);
      for (const att of attachments) {
        if (codesNeeded.size === 0) break;
        try {
          const data = await gmail.users.messages.attachments.get({
            userId: 'me', messageId: msgId, id: att.body.attachmentId,
          });
          const buf = Buffer.from(data.data.data || '', 'base64');
          const lignes = await parseFoodflowPDF(buf);
          pdfCount++;
          for (const l of lignes) {
            if (codesNeeded.has(l.code) && !lignesByCode.has(l.code)) {
              lignesByCode.set(l.code, l);
              codesNeeded.delete(l.code);
            }
          }
        } catch {/* PDF illisible, on ignore */}
      }
    } catch {/* msg illisible, on ignore */}
  }
  push(`PDFs parsés : ${pdfCount} | unite trouvée pour ${plans.length - codesNeeded.size}/${plans.length} codes`);

  // 4. Compléter les plans avec l'unite (et croiser le nom pour info)
  for (const p of plans) {
    const ligne = lignesByCode.get(p.foodflowCode);
    if (ligne) {
      p.fromPdf = { unite: ligne.unite, nom: ligne.nom, qte: ligne.qte, prix: ligne.prix, date: ligne.date };
      p.final.unite = ligne.unite || p.current.unite;
    } else {
      // Pas d'unite trouvée, on garde l'actuelle (corrompue) — utilisatrice corrigera
      p.final.unite = p.current.unite;
    }
  }

  // 5. Plan détaillé
  push('\n──── Plan de restauration ────');
  for (const p of plans) {
    push(`\n  ${p.foodflowCode}`);
    push(`    nom    : "${p.current.nom}"  →  "${p.final.nom}"`);
    push(`    prix   : ${p.current.prix}  →  ${p.final.prix}`);
    push(`    unite  : ${p.current.unite}  →  ${p.final.unite}${!p.fromPdf ? ' [PDF non trouvé, valeur actuelle gardée]' : ''}`);
    push(`    qte    : ${p.current.quantite}  →  ${p.final.quantite}`);
  }

  if (!apply) {
    return NextResponse.json({ ok: true, log, plans, summary: {
      corrompus: corrompus.length,
      avecPdfTrouve: plans.length - codesNeeded.size,
      sansPdf: codesNeeded.size,
    } });
  }

  // 6. APPLY
  push('\n──── APPLICATION ────');
  let restored = 0;
  const errors: string[] = [];

  for (const p of plans) {
    if (!p.final.nom || p.final.prix == null || p.final.quantite == null) {
      errors.push(`${p.foodflowCode}: données incomplètes, sauté`);
      continue;
    }
    try {
      await updateDoc(doc(db, 'produitsFournisseurs', p.pfId), {
        nom: p.final.nom,
        prix: p.final.prix,
        unite: p.final.unite,
        quantite: p.final.quantite,
        proposition: deleteField(),
        sku: deleteField(),
        url: deleteField(),
        ingredientId: deleteField(),
        ingredient: deleteField(),
      });
      restored++;
    } catch (e: any) {
      errors.push(`${p.foodflowCode}: ${e.message}`);
    }
  }
  push(`✓ Restaurés : ${restored}/${plans.length}`);
  if (errors.length) push(`Erreurs : ${errors.length}`);

  return NextResponse.json({ ok: true, log, summary: { restored, errors: errors.length, errorDetails: errors } });
}
