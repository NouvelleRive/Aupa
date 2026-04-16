// Importe les exports comptables Popina (xlsx) dans rapportsJournaliers Firestore
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import XLSX from 'xlsx';

const app = initializeApp({ credential: cert('./serviceAccountKey.json') });
const db = getFirestore(app);
const POPINA_DIR = path.join(__dirname, '../tmp-popina');

function parseDate(dateStr: string): string | null {
  // Format: "15/03/2026 09:57" → "2026-03-15"
  const m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function main() {
  // Lire tous les fichiers comptable-*.xlsx
  const files = fs.readdirSync(POPINA_DIR)
    .filter(f => f.startsWith('comptable-') && f.endsWith('.xlsx'))
    .sort();

  console.log(`${files.length} fichiers comptables à traiter`);

  // Charger les menus pour le mapping date → menuNom
  const menusSnap = await db.collection('menus').get();
  const menus = menusSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  // Charger les rapports existants pour ne pas écraser
  const existingSnap = await db.collection('rapportsJournaliers').get();
  const existingDates = new Set(existingSnap.docs.map(d => d.id));
  console.log(`${existingDates.size} rapports existants en base`);

  let created = 0, skipped = 0, errors = 0;

  for (const file of files) {
    const wb = XLSX.readFile(path.join(POPINA_DIR, file));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];

    // Skip header row (first row is column labels)
    for (const row of rows) {
      const dateStr = row['Début'];
      if (!dateStr || dateStr === 'Date') continue;

      const date = parseDate(dateStr);
      if (!date) continue;

      // Skip si déjà en base
      if (existingDates.has(date)) { skipped++; continue; }

      const caTTC = row['Total Brut'] || 0;
      if (caTTC === 0) continue; // jour sans vente

      const caHT = row['_2'] || 0; // HT column after Total Brut
      const couverts = row['Couverts'] || 0;
      const commandes = row['Commandes'] || 0;
      const pourboires = row['_12'] || 0; // Total pourboires
      const reductionsTTC = row['Total réductions'] || 0;

      const mois = date.slice(0, 7);
      const menuMatch = menus.find((m: any) => m.dateDebut && m.dateFin && date >= m.dateDebut && date <= m.dateFin);
      const menuNom = menuMatch ? menuMatch.nom : '';

      // Catégories
      const categories: Record<string, { qty: number; ca: number }> = {};
      const catKeys = Object.keys(row).filter(k => k.startsWith('cat :'));
      for (const k of catKeys) {
        const catName = k.replace('cat : ', '').replace('cat :', '').trim();
        const ca = row[k] || 0;
        if (ca > 0) {
          categories[catName] = { qty: 0, ca }; // qty not available in comptable export
        }
      }

      try {
        await db.doc(`rapportsJournaliers/${date}`).set({
          date,
          menuNom,
          mois,
          caTTC: typeof caTTC === 'number' ? caTTC : 0,
          caHT: typeof caHT === 'number' ? caHT : 0,
          couverts: typeof couverts === 'number' ? couverts : 0,
          commandes: typeof commandes === 'number' ? commandes : 0,
          categories,
          reductions: [],
          reductionsTotal: { ht: 0, tva: 0, ttc: reductionsTTC },
          annulations: [],
          annulationsTotal: 0,
          pourboires: typeof pourboires === 'number' ? pourboires : 0,
          lieux: {},
          debutService: null,
          finService: null,
          updatedAt: new Date().toISOString(),
          source: 'popina-export',
        });
        existingDates.add(date);
        created++;
      } catch (e: any) {
        console.error(`  Erreur ${date}: ${e.message}`);
        errors++;
      }
    }

    console.log(`  ${file}: traité`);
  }

  console.log(`\n========================================`);
  console.log(`Rapports créés: ${created}`);
  console.log(`Déjà existants (ignorés): ${skipped}`);
  console.log(`Erreurs: ${errors}`);
  console.log('Done!');
}

main().catch(console.error);
