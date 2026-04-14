import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getOAuth2Client } from '@/lib/googleAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, addDoc, query, where, getDocs, deleteDoc } from 'firebase/firestore';

// Parse le body d'un mail Popina (rapport de fin de caisse)
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

async function getGmailClient() {
  const configDoc = await getDoc(doc(db, 'config', 'gmail'));
  if (!configDoc.exists()) throw new Error('Gmail not connected. Visit /api/gmail/auth first.');
  const { refresh_token } = configDoc.data() as { refresh_token: string };
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function GET() {
  try {
    const gmail = await getGmailClient();

    // Chercher les mails Popina non traités (label 'PopinaSynced' absent)
    const query_ = 'from:noreply@popina.com subject:"Rapport de fin de caisse" -label:PopinaSynced';
    const list = await gmail.users.messages.list({ userId: 'me', q: query_, maxResults: 30 });
    const messages = list.data.messages || [];

    let imported = 0;
    let totalArticles = 0;

    // Trouver ou créer le label
    const labelsList = await gmail.users.labels.list({ userId: 'me' });
    let label = labelsList.data.labels?.find(l => l.name === 'PopinaSynced');
    if (!label) {
      const created = await gmail.users.labels.create({ userId: 'me', requestBody: { name: 'PopinaSynced' } });
      label = created.data;
    }

    for (const msg of messages) {
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
      // Extraire le body (text/plain)
      let body = '';
      const extractBody = (part: any): string => {
        if (part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          for (const sub of part.parts) {
            const text = extractBody(sub);
            if (text) return text;
          }
        }
        return '';
      };
      // Préférer text/plain
      const findPlain = (part: any): any => {
        if (part.mimeType === 'text/plain') return part;
        if (part.parts) {
          for (const sub of part.parts) {
            const r = findPlain(sub);
            if (r) return r;
          }
        }
        return null;
      };
      const plainPart = findPlain(full.data.payload);
      if (plainPart) {
        body = extractBody(plainPart);
      } else {
        body = extractBody(full.data.payload);
      }

      if (!body) continue;

      const { articles, date } = parseRecapPopina(body);
      if (articles.length === 0) continue;

      // Détecter le menu actif pour cette date (on cherche un menu qui couvre la date)
      const menusSnap = await getDocs(collection(db, 'menus'));
      const menus = menusSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const menuMatch = menus.find(m => m.dateDebut && m.dateFin && date >= m.dateDebut && date <= m.dateFin);
      const menuNom = menuMatch ? menuMatch.nom : 'HIVER25'; // fallback

      // Supprimer les ventes existantes pour cette date
      const existingSnap = await getDocs(query(collection(db, 'ventes'), where('jour', '==', date)));
      for (const d of existingSnap.docs) await deleteDoc(d.ref);

      const moisStr = date.slice(0, 7);
      for (const a of articles) {
        await addDoc(collection(db, 'ventes'), {
          nom: a.nom, quantity: a.quantity, ttc: a.ttc,
          menuNom, mois: moisStr, jour: date,
        });
      }

      totalArticles += articles.length;
      imported++;

      // Marquer le mail comme traité
      await gmail.users.messages.modify({
        userId: 'me',
        id: msg.id!,
        requestBody: { addLabelIds: [label.id!] },
      });
    }

    return NextResponse.json({ ok: true, imported, totalArticles });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
