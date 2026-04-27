import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/googleAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
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
  'total',
]);

// Les "top categories" Popina (celles qui regroupent les ventes au premier niveau).
// On les extrait séparément pour avoir les stats par catégorie.
const TOP_CATEGORIES_POPINA = new Set([
  'plats', 'boissons froides', 'entrees', 'sides et tapas', 'desserts',
  'boissons chaudes', 'aupa croissant burger eat', 'supplements', 'dont menus',
]);

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEuros(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace('€', '').replace(',', '.')) || 0;
}

type TvaBucket = { ht: number; tva: number; ttc: number };
type RapportPopina = {
  date: string;
  articles: { nom: string; quantity: number; ttc: number }[];
  // Enrichissements extraits du même body
  caTTC: number;
  caHT: number;
  couverts: number;
  commandes: number;
  debutService: string | null;
  finService: string | null;
  categories: Record<string, { qty: number; ca: number }>;
  reductions: { type: string; pct: number; ht: number; tva: number; ttc: number }[];
  reductionsTotal: TvaBucket;
  annulations: { type: string; unites: number; montant: number }[];
  annulationsTotal: number;
  tvaNet: Record<string, TvaBucket>;
  lieux: Record<string, number>;
  pourboires: number;
};

function parseRecapPopina(text: string): RapportPopina {
  const articles: RapportPopina['articles'] = [];
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

  const rapport: RapportPopina = {
    date: dateStr, articles,
    caTTC: 0, caHT: 0, couverts: 0, commandes: 0,
    debutService: null, finService: null,
    categories: {}, reductions: [], reductionsTotal: { ht: 0, tva: 0, ttc: 0 },
    annulations: [], annulationsTotal: 0,
    tvaNet: {}, lieux: {}, pourboires: 0,
  };

  // Parcours unique : on garde la boucle existante mais on ajoute des états
  // pour capturer les sections après "Total des ventes".
  type Section = 'produits' | 'reductions' | 'annulations' | 'lieux' | 'tvaNet' | 'autre';
  let section: Section = 'produits';
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // === Header (peut arriver dans n'importe quel ordre avant les produits) ===
    const caTtcM = trimmed.match(/^Chiffre d'affaires TTC\s*\t?\s*([\d\s,]+)\s*€/i);
    if (caTtcM) { rapport.caTTC = parseEuros(caTtcM[1]); continue; }
    const caHtM = trimmed.match(/^Chiffre d'affaires HT\s*\t?\s*([\d\s,]+)\s*€/i);
    if (caHtM) { rapport.caHT = parseEuros(caHtM[1]); continue; }
    const couvM = trimmed.match(/^Couverts\s*\t?\s*(\d+)/i);
    if (couvM) { rapport.couverts = parseInt(couvM[1]); continue; }
    const cmdM = trimmed.match(/^Commandes\s*\t?\s*(\d+)/i);
    if (cmdM) { rapport.commandes = parseInt(cmdM[1]); continue; }
    if (/Début de service.*Fin de service/i.test(trimmed)) {
      const next = lines[i + 1] || '';
      const t = next.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}).*?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/);
      if (t) { rapport.debutService = t[2]; rapport.finService = t[4]; }
      continue;
    }

    // === Changements de section ===
    if (/^Total des ventes/i.test(trimmed)) { section = 'autre'; continue; }
    if (/^Réductions\s*$/i.test(trimmed)) { section = 'reductions'; continue; }
    if (/^Annulations/i.test(trimmed)) { section = 'annulations'; continue; }
    if (/^Statistiques lieux/i.test(trimmed)) { section = 'lieux'; continue; }
    if (/^Statistiques utilisateurs/i.test(trimmed)) { section = 'autre'; continue; }
    if (/^TVA Net/i.test(trimmed)) { section = 'tvaNet'; continue; }
    if (/^TVA (Brut|Offert)/i.test(trimmed)) { section = 'autre'; continue; }
    const pourbM = trimmed.match(/^Total des pourboires\s*\t?\s*([\d\s,]+)\s*€/i);
    if (pourbM) { rapport.pourboires = parseEuros(pourbM[1]); continue; }

    // === Parsing par section ===
    if (section === 'produits') {
      const match = line.match(/^(.+?)\s*\t\s*(\d+)\s*\t\s*([\d,]+)\s*€/);
      if (!match) continue;
      const nom = match[1].trim();
      const quantity = parseInt(match[2]);
      const ttc = parseFloat(match[3].replace(',', '.'));
      if (!nom || quantity <= 0 || ttc <= 0) continue;
      const nomNorm = normalize(nom);
      // Capturer les stats de catégorie top-level avant de les ignorer
      if (TOP_CATEGORIES_POPINA.has(nomNorm)) {
        rapport.categories[nom] = { qty: quantity, ca: ttc };
        continue;
      }
      if (CATEGORIES_POPINA.has(nomNorm)) continue;
      articles.push({ nom, quantity, ttc });
    }

    else if (section === 'reductions') {
      if (/^Total des réductions/i.test(trimmed)) {
        const nums = trimmed.match(/([\d\s,]+)\s*€/g);
        if (nums && nums.length >= 3) {
          rapport.reductionsTotal = {
            ht: parseEuros(nums[0]), tva: parseEuros(nums[1]), ttc: parseEuros(nums[2]),
          };
        }
        continue;
      }
      const m = line.match(/^(.+?)\s*\(([\d,]+)\s*%\)\s*\t([\d\s,]+)\s*€\s*\t([\d\s,]+)\s*€\s*\t([\d\s,]+)\s*€/);
      if (m) {
        rapport.reductions.push({
          type: m[1].trim(), pct: parseFloat(m[2].replace(',', '.')),
          ht: parseEuros(m[3]), tva: parseEuros(m[4]), ttc: parseEuros(m[5]),
        });
      }
    }

    else if (section === 'annulations') {
      if (/^Total des annulations/i.test(trimmed)) {
        const m = trimmed.match(/([\d\s,]+)\s*€/);
        if (m) rapport.annulationsTotal = parseEuros(m[1]);
        continue;
      }
      const m = line.match(/^(\d+)\s*\t(.+?)\s*\t([\d\s,]+)\s*€/);
      if (m) {
        rapport.annulations.push({
          unites: parseInt(m[1]), type: m[2].trim(), montant: parseEuros(m[3]),
        });
      }
    }

    else if (section === 'lieux') {
      const m = line.match(/^(.+?)\s*\t([\d\s,]+)\s*€/);
      if (m && !/^Total/i.test(m[1])) {
        rapport.lieux[m[1].trim()] = parseEuros(m[2]);
      }
    }

    else if (section === 'tvaNet') {
      if (/^Total/i.test(trimmed)) { section = 'autre'; continue; }
      // Format: "Tax 5,5 (5,50 %)\t113,79 €\t6,26 €\t120,05 €"
      const m = line.match(/^(?:Tax\s*)?([\d,]+)\s*(?:\(|%)[^\t]*\t([\d\s,]+)\s*€\s*\t([\d\s,]+)\s*€\s*\t([\d\s,]+)\s*€/);
      if (m) {
        const taux = m[1].replace(',', '.');
        rapport.tvaNet[taux] = {
          ht: parseEuros(m[2]), tva: parseEuros(m[3]), ttc: parseEuros(m[4]),
        };
      }
    }
  }

  return rapport;
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

function findHtmlPart(part: any): any {
  if (part.mimeType === 'text/html') return part;
  if (part.parts) for (const sub of part.parts) { const r = findHtmlPart(sub); if (r) return r; }
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

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// Popina envoie désormais le rapport en HTML uniquement (plus de text/plain).
// On reconstruit un texte tabulé compatible avec parseRecapPopina à partir des
// <tr><td>...</td></tr> du HTML.
function htmlToTabbedRows(html: string): string {
  const out: string[] = [];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) out.push(decodeHtmlEntities(h1[1].replace(/<[^>]+>/g, '')).trim());
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRegex.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let c;
    while ((c = cellRegex.exec(m[1])) !== null) {
      const text = decodeHtmlEntities(
        c[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' '),
      ).trim();
      cells.push(text);
    }
    if (cells.some((x) => x.length > 0)) out.push(cells.join('\t'));
  }
  return out.join('\n');
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
          let body = '';
          if (plain) {
            body = extractBodyText(plain);
          } else {
            const htmlPart = findHtmlPart(full.data.payload);
            if (htmlPart) body = htmlToTabbedRows(extractBodyText(htmlPart));
            else body = extractBodyText(full.data.payload);
          }
          if (!body) continue;
          const rapport = parseRecapPopina(body);
          const { articles, date } = rapport;
          if (articles.length === 0) continue;

          const menusSnap = await getDocs(collection(db, 'menus'));
          const menus = menusSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
          const menuMatch = menus.find((m) => m.dateDebut && m.dateFin && date >= m.dateDebut && date <= m.dateFin);
          const menuNom = menuMatch ? menuMatch.nom : 'HIVER25';

          // Idempotence : doc ID déterministe ${date}__${nom-encodé}. Si 2 syncs
          // concurrents traitent le même mail, ils écrivent dans les mêmes docs
          // (overwrite) au lieu de dupliquer comme le faisait addDoc.
          const moisStr = date.slice(0, 7);
          const writtenIds = new Set<string>();
          const slugify = (s: string) =>
            s.normalize('NFD').replace(/[̀-ͯ]/g, '')
              .replace(/[\/.#$\[\]]/g, '_')
              .replace(/\s+/g, '_')
              .slice(0, 200);
          for (const a of articles) {
            const id = `${date}__${slugify(a.nom)}`;
            await setDoc(doc(db, 'ventes', id), {
              nom: a.nom, quantity: a.quantity, ttc: a.ttc,
              menuNom, mois: moisStr, jour: date,
            });
            writtenIds.add(id);
          }
          // Nettoyer les ventes orphelines pour cette date (anciens docs aléatoires
          // ou items disparus d'une éventuelle correction Popina).
          const existingSnap = await getDocs(query(collection(db, 'ventes'), where('jour', '==', date)));
          for (const d of existingSnap.docs) {
            if (!writtenIds.has(d.id)) await deleteDoc(d.ref);
          }

          // Écrire le rapport journalier enrichi (1 doc par jour, keyé par date)
          await setDoc(doc(db, 'rapportsJournaliers', date), {
            date,
            menuNom,
            mois: moisStr,
            caTTC: rapport.caTTC,
            caHT: rapport.caHT,
            couverts: rapport.couverts,
            commandes: rapport.commandes,
            debutService: rapport.debutService,
            finService: rapport.finService,
            categories: rapport.categories,
            reductions: rapport.reductions,
            reductionsTotal: rapport.reductionsTotal,
            annulations: rapport.annulations,
            annulationsTotal: rapport.annulationsTotal,
            tvaNet: rapport.tvaNet,
            lieux: rapport.lieux,
            pourboires: rapport.pourboires,
            updatedAt: new Date().toISOString(),
          });

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
