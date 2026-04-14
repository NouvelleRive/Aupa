import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/googleAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import {
  parseFoodflowPDF,
  parseMillietPDF,
  parseLBAPDF,
  parseMPFPDF,
  parseAssembleursPDF,
} from '@/lib/parsers/fournisseurs';
import {
  upsertLignesFournisseur,
  upsertLignesAssembleurs,
} from '@/lib/parsers/upsertFournisseur';

export const maxDuration = 300;

// ============================================================================
// POPINA — parsing texte du body (rapport de fin de caisse)
// ============================================================================
const CATEGORIES_POPINA = new Set([
  'plats', 'bol', 'croger', 'salade', 'boissons froides', 'aperitifs digestifs',
  'biere', 'cocktail', 'maison iced', 'soft eau', 'vin', 'entrees',
  'sides et tapas', 'grignotte', 'side', 'desserts', 'tous', 'boissons chaudes',
  'classic hot drinks', 'crazy hot drinks', 'none', 'supplements', 'au restau',
  'parent category menu png', 'dont menus', 'brunch',
  'aupa croissant burger eat', 'formule midi', 'gouter',
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRecapPopina(text: string): { articles: { nom: string; quantity: number; ttc: number }[]; date: string } {
  const articles: { nom: string; quantity: number; ttc: number }[] = [];
  let dateStr = new Date().toISOString().slice(0, 10);
  const mois: Record<string, string> = { janvier: '01', février: '02', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06', juillet: '07', août: '08', aout: '08', septembre: '09', octobre: '10', novembre: '11', décembre: '12', decembre: '12' };
  const titreMatch = text.match(/Rapport de fin de caisse\s*:\s*(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (titreMatch) {
    const jour = titreMatch[1].padStart(2, '0');
    const moisKey = titreMatch[2].toLowerCase();
    const annee = titreMatch[3];
    if (mois[moisKey]) dateStr = `${annee}-${mois[moisKey]}-${jour}`;
  } else {
    const dmy = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) dateStr = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  const lines = text.split('\n');
  for (const line of lines) {
    if (/Total des ventes/i.test(line)) break;
    const match = line.match(/^(.+?)\s*\t\s*(\d+)\s*\t\s*([\d,]+)\s*€/);
    if (!match) continue;
    const nom = match[1].trim();
    const quantity = parseInt(match[2]);
    const ttc = parseFloat(match[3].replace(',', '.'));
    if (!nom || quantity <= 0 || ttc <= 0) continue;
    if (CATEGORIES_POPINA.has(normalize(nom))) continue;
    articles.push({ nom, quantity, ttc });
  }
  return { articles, date: dateStr };
}

// ============================================================================
// Helpers Gmail
// ============================================================================
async function getGmailClient() {
  const configDoc = await getDoc(doc(db, 'config', 'gmail'));
  if (!configDoc.exists()) throw new Error('Gmail not connected. Visit /api/gmail/auth first.');
  const { refresh_token } = configDoc.data() as { refresh_token: string };
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function getHeader(payload: any, name: string): string {
  const h = payload?.headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function findPlainPart(part: any): any {
  if (part.mimeType === 'text/plain') return part;
  if (part.parts) for (const sub of part.parts) { const r = findPlainPart(sub); if (r) return r; }
  return null;
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function extractBodyText(part: any): string {
  if (part.body?.data) return decodeBase64Url(part.body.data).toString('utf-8');
  if (part.parts) for (const sub of part.parts) { const t = extractBodyText(sub); if (t) return t; }
  return '';
}

function findPdfAttachments(part: any, acc: { filename: string; attachmentId: string }[] = []): { filename: string; attachmentId: string }[] {
  if (part.filename && part.filename.toLowerCase().endsWith('.pdf') && part.body?.attachmentId) {
    acc.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }
  if (part.parts) for (const sub of part.parts) findPdfAttachments(sub, acc);
  return acc;
}

async function downloadAttachment(gmail: any, messageId: string, attachmentId: string): Promise<Buffer> {
  const att = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
  return decodeBase64Url(att.data.data || '');
}

// ============================================================================
// Dispatch par expéditeur
// ============================================================================
type SourceType = 'popina' | 'foodflow' | 'milliet' | 'lba' | 'mpf' | 'assembleurs' | null;

function detectSource(from: string): SourceType {
  const f = from.toLowerCase();
  if (f.includes('noreply@popina.com')) return 'popina';
  if (f.includes('compta@foodflow.fr')) return 'foodflow';
  if (f.includes('contact@milliet.paris')) return 'milliet';
  if (f.includes('commercial@lba-boissons.fr')) return 'lba';
  if (f.includes('brasseriemapetitefrancaise@gmail.com')) return 'mpf';
  // Les Assembleurs : expéditeur encore inconnu, on l'ajoutera
  return null;
}

// ============================================================================
// Handler principal
// ============================================================================
export async function GET() {
  try {
    const gmail = await getGmailClient();

    const q = '-label:AupaSynced (from:noreply@popina.com OR from:compta@foodflow.fr OR from:contact@milliet.paris OR from:commercial@lba-boissons.fr OR from:brasseriemapetitefrancaise@gmail.com)';
    const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 50 });
    const messages = list.data.messages || [];

    // Trouver/créer le label AupaSynced
    const labelsList = await gmail.users.labels.list({ userId: 'me' });
    let label = labelsList.data.labels?.find((l: any) => l.name === 'AupaSynced');
    if (!label) {
      const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: 'AupaSynced' } });
      label = created.data;
    }

    const summary = {
      popina: { mails: 0, articles: 0 },
      foodflow: { mails: 0, created: 0, updated: 0, achats: 0 },
      milliet: { mails: 0, created: 0, updated: 0, achats: 0 },
      lba: { mails: 0, created: 0, updated: 0, achats: 0 },
      mpf: { mails: 0, created: 0, updated: 0, achats: 0 },
      assembleurs: { mails: 0, created: 0, updated: 0 },
      skipped: 0,
      errors: [] as string[],
    };

    for (const msg of messages) {
      try {
        const full = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
        const from = getHeader(full.data.payload, 'From');
        const source = detectSource(from);

        if (!source) { summary.skipped++; continue; }

        if (source === 'popina') {
          const plain = findPlainPart(full.data.payload);
          const body = plain ? extractBodyText(plain) : extractBodyText(full.data.payload);
          if (!body) continue;
          const { articles, date } = parseRecapPopina(body);
          if (articles.length === 0) continue;

          const menusSnap = await getDocs(collection(db, 'menus'));
          const menus = menusSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          const menuMatch = menus.find((m) => m.dateDebut && m.dateFin && date >= m.dateDebut && date <= m.dateFin);
          const menuNom = menuMatch ? menuMatch.nom : 'HIVER25';

          // Remplacer les ventes existantes pour cette date
          const existingSnap = await getDocs(query(collection(db, 'ventes'), where('jour', '==', date)));
          for (const d of existingSnap.docs) await deleteDoc(d.ref);

          const moisStr = date.slice(0, 7);
          for (const a of articles) {
            await addDoc(collection(db, 'ventes'), {
              nom: a.nom, quantity: a.quantity, ttc: a.ttc,
              menuNom, mois: moisStr, jour: date,
            });
          }
          summary.popina.mails++;
          summary.popina.articles += articles.length;
        } else {
          // Fournisseur PDF
          const pdfs = findPdfAttachments(full.data.payload);
          if (pdfs.length === 0) { summary.skipped++; continue; }

          for (const pj of pdfs) {
            const buf = await downloadAttachment(gmail, msg.id!, pj.attachmentId);
            if (source === 'foodflow') {
              const lignes = await parseFoodflowPDF(buf);
              const r = await upsertLignesFournisseur('Foodflow', lignes);
              summary.foodflow.created += r.created;
              summary.foodflow.updated += r.updated;
              summary.foodflow.achats += r.achatsCreated;
            } else if (source === 'milliet') {
              const lignes = await parseMillietPDF(buf);
              const r = await upsertLignesFournisseur('Milliet', lignes);
              summary.milliet.created += r.created;
              summary.milliet.updated += r.updated;
              summary.milliet.achats += r.achatsCreated;
            } else if (source === 'lba') {
              const lignes = await parseLBAPDF(buf);
              const r = await upsertLignesFournisseur('LBA', lignes);
              summary.lba.created += r.created;
              summary.lba.updated += r.updated;
              summary.lba.achats += r.achatsCreated;
            } else if (source === 'mpf') {
              const lignes = await parseMPFPDF(buf);
              const r = await upsertLignesFournisseur('MPF', lignes);
              summary.mpf.created += r.created;
              summary.mpf.updated += r.updated;
              summary.mpf.achats += r.achatsCreated;
            } else if (source === 'assembleurs') {
              const lignes = await parseAssembleursPDF(buf);
              const r = await upsertLignesAssembleurs(lignes);
              summary.assembleurs.created += r.created;
              summary.assembleurs.updated += r.updated;
            }
          }
          if (source === 'foodflow') summary.foodflow.mails++;
          else if (source === 'milliet') summary.milliet.mails++;
          else if (source === 'lba') summary.lba.mails++;
          else if (source === 'mpf') summary.mpf.mails++;
          else if (source === 'assembleurs') summary.assembleurs.mails++;
        }

        // Marquer le mail comme traité
        await gmail.users.messages.modify({
          userId: 'me',
          id: msg.id!,
          requestBody: { addLabelIds: [label!.id!] },
        });
      } catch (e: any) {
        summary.errors.push(`msg ${msg.id}: ${e.message}`);
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
