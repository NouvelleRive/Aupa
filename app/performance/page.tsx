'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';
import { ResponsiveContainer, Treemap } from 'recharts';

type TvaBucket = { ht: number; tva: number; ttc: number };
type Reduction = { type: string; pct: number; ht: number; tva: number; ttc: number };
type Annulation = { type: string; unites: number; montant: number };

interface Rapport {
  date: string; // YYYY-MM-DD
  mois: string;
  caTTC: number;
  caHT: number;
  couverts: number;
  commandes: number;
  categories: Record<string, { qty: number; ca: number }>;
  reductions: Reduction[];
  reductionsTotal: TvaBucket;
  annulations: Annulation[];
  annulationsTotal: number;
  pourboires: number;
  lieux: Record<string, number>;
}

interface Vente {
  nom: string; quantity: number; ttc: number;
  menuNom: string; mois: string; jour?: string;
}

interface Recette {
  id: string; nom: string; coutCalcule?: number; prixVente?: number; categorie?: string;
}

// Seuils d'alerte (% du CA TTC)
const SEUIL_REDUCTIONS = 3;     // > 3% du CA → rouge
const SEUIL_ANNULATIONS = 2;    // > 2% du CA → rouge
const SEUIL_OFFERTS = 1.5;      // > 1.5% du CA → rouge

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const fmtEur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function PerformancePage() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [granularite, setGranularite] = useState<'jour' | 'semaine' | 'mois'>('semaine');
  const [bucket, setBucket] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [rSnap, vSnap, recSnap] = await Promise.all([
        getDocs(collection(db, 'rapportsJournaliers')),
        getDocs(collection(db, 'ventes')),
        getDocs(collection(db, 'recettes')),
      ]);
      setRapports(rSnap.docs.map(d => d.data() as Rapport));
      setVentes(vSnap.docs.map(d => d.data() as Vente));
      setRecettes(recSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
      setLoading(false);
    })();
  }, []);

  // Map nom → coût unitaire (food cost) pour les calculs de marge
  const coutParNom = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recettes) {
      if (r.nom && typeof r.coutCalcule === 'number') m.set(r.nom.toLowerCase(), r.coutCalcule);
    }
    return m;
  }, [recettes]);

  // Map nom → food cost % (coutCalcule / prixVente HT)
  const foodCostPctParNom = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recettes) {
      if (r.nom && typeof r.coutCalcule === 'number' && r.coutCalcule > 0 && typeof r.prixVente === 'number' && r.prixVente > 0) {
        const prixHT = r.prixVente / 1.10;
        const pct = r.coutCalcule / prixHT;
        m.set(r.nom.toLowerCase(), pct);
      }
    }
    return m;
  }, [recettes]);

  const bucketOfRapport = (r: Rapport): string => {
    if (granularite === 'jour') return r.date;
    if (granularite === 'semaine') return isoWeek(r.date);
    return r.mois;
  };

  const bucketsDisponibles = useMemo(() => {
    return [...new Set(rapports.map(bucketOfRapport))].sort().reverse();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapports, granularite]);

  const rapportsFiltrés = useMemo(() => {
    if (bucket === 'all') return rapports;
    return rapports.filter(r => bucketOfRapport(r) === bucket);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapports, bucket, granularite]);

  const ventesFiltrées = useMemo(() => {
    if (bucket === 'all') return ventes;
    const dates = new Set(rapportsFiltrés.map(r => r.date));
    return ventes.filter(v => v.jour && dates.has(v.jour));
  }, [ventes, rapportsFiltrés, bucket]);

  // === N-1 : même bucket l'année précédente ===
  // - Mois '2026-04' → '2025-04'
  // - Semaine '2026-W15' → '2025-W15'
  // - Jour '2026-04-12' → '2025-04-12'
  const bucketNMoins1 = useMemo((): string | null => {
    if (bucket === 'all') return null;
    if (granularite === 'mois') {
      const m = bucket.match(/^(\d{4})-(\d{2})$/);
      if (!m) return null;
      return `${parseInt(m[1]) - 1}-${m[2]}`;
    }
    if (granularite === 'semaine') {
      const m = bucket.match(/^(\d{4})-W(\d{2})$/);
      if (!m) return null;
      return `${parseInt(m[1]) - 1}-W${m[2]}`;
    }
    if (granularite === 'jour') {
      const m = bucket.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      return `${parseInt(m[1]) - 1}-${m[2]}-${m[3]}`;
    }
    return null;
  }, [bucket, granularite]);

  const caNMoins1 = useMemo((): number | null => {
    if (!bucketNMoins1) return null;
    let total = 0;
    let found = false;
    for (const v of ventes) {
      let bk: string | null = null;
      if (granularite === 'mois') bk = v.mois || null;
      else if (granularite === 'jour') bk = v.jour || null;
      else if (granularite === 'semaine') bk = v.jour ? isoWeek(v.jour) : null;
      if (bk === bucketNMoins1) {
        total += v.ttc || 0;
        found = true;
      }
    }
    return found ? total : null;
  }, [ventes, bucketNMoins1, granularite]);

  // === KPIs agrégés ===
  const kpi = useMemo(() => {
    const agg = {
      caTTC: 0, caHT: 0, couverts: 0, commandes: 0,
      reductions: 0, reductionsOfferts: 0, annulations: 0, pourboires: 0,
      foodCA: 0, drinkCA: 0, nbEntrees: 0, nbDesserts: 0, nbPlats: 0,
    };
    for (const r of rapportsFiltrés) {
      agg.caTTC += r.caTTC || 0;
      agg.caHT += r.caHT || 0;
      agg.couverts += r.couverts || 0;
      agg.commandes += r.commandes || 0;
      agg.reductions += r.reductionsTotal?.ttc || 0;
      agg.annulations += r.annulationsTotal || 0;
      agg.pourboires += r.pourboires || 0;
      for (const red of r.reductions || []) {
        if (/offert/i.test(red.type)) agg.reductionsOfferts += red.ttc;
      }
      const cats = r.categories || {};
      for (const [nom, stat] of Object.entries(cats)) {
        const n = nom.toLowerCase();
        if (/boisson/.test(n)) agg.drinkCA += stat.ca;
        else agg.foodCA += stat.ca;
        if (n === 'entrées' || n === 'entrees') agg.nbEntrees += stat.qty;
        else if (n === 'desserts') agg.nbDesserts += stat.qty;
        else if (n === 'plats') agg.nbPlats += stat.qty;
      }
    }
    // Food cost via recettes
    let foodCost = 0;
    for (const v of ventesFiltrées) {
      const c = coutParNom.get(v.nom.toLowerCase());
      if (typeof c === 'number') foodCost += c * v.quantity;
    }
    const margeBrute = agg.caHT - foodCost;
    return { ...agg, foodCost, margeBrute };
  }, [rapportsFiltrés, ventesFiltrées, coutParNom]);

  // Charger les matchings manuels caisse → recette
  const [caisseMapLoaded, setCaisseMapLoaded] = useState(false);
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'caisseMapCustom'));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.caisse && data.recette) CAISSE_MAP[data.caisse] = data.recette;
      }
      setCaisseMapLoaded(true);
    })();
  }, []);

  // Map ventes Popina → nom recette via CAISSE_MAP (matchings manuels)
  const recetteNoms = useMemo(() => recettes.map(r => r.nom), [recettes]);

  const matchVenteToRecette = (venteNom: string): string | null => {
    const caisse = normalizeCaisse(venteNom);
    const mapped = CAISSE_MAP[caisse];
    if (mapped) {
      for (const nom of recetteNoms) {
        const recette = normalizeCaisse(nom).replace(/\s+(ete|hiver)$/, '');
        if (recette === mapped) return nom;
      }
    }
    return null;
  };

  // === Top produits (groupés par nom recette) ===
  const topProduits = useMemo(() => {
    const m = new Map<string, { nom: string; qty: number; ca: number }>();
    for (const v of ventesFiltrées) {
      const recetteNom = matchVenteToRecette(v.nom) || v.nom;
      const e = m.get(recetteNom) || { nom: recetteNom, qty: 0, ca: 0 };
      e.qty += v.quantity;
      e.ca += v.ttc;
      m.set(recetteNom, e);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesFiltrées, recetteNoms, caisseMapLoaded]);

  // === Alertes (% du CA TTC) ===
  const alertes = useMemo(() => {
    if (kpi.caTTC === 0) return [];
    const out: { level: 'red' | 'orange'; label: string; value: string }[] = [];
    const pctRed = (kpi.reductions / kpi.caTTC) * 100;
    const pctOff = (kpi.reductionsOfferts / kpi.caTTC) * 100;
    const pctAnn = (kpi.annulations / kpi.caTTC) * 100;
    if (pctRed > SEUIL_REDUCTIONS) out.push({ level: 'red', label: 'Réductions trop élevées', value: `${fmtPct(pctRed)} du CA (${fmtEur(kpi.reductions)})` });
    if (pctOff > SEUIL_OFFERTS) out.push({ level: 'red', label: 'Trop d\'offerts client', value: `${fmtPct(pctOff)} du CA (${fmtEur(kpi.reductionsOfferts)})` });
    if (pctAnn > SEUIL_ANNULATIONS) out.push({ level: 'red', label: 'Annulations trop élevées', value: `${fmtPct(pctAnn)} du CA (${fmtEur(kpi.annulations)})` });
    return out;
  }, [kpi]);


  // === Résumé de la veille (comme le mail Popina) ===
  const hier = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const rapportHier = useMemo(() => rapports.find(r => r.date === hier), [rapports, hier]);

  // N-1 : même jour l'an passé
  const hierN1 = useMemo(() => {
    const m = hier.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return `${parseInt(m[1]) - 1}-${m[2]}-${m[3]}`;
  }, [hier]);

  const rapportHierN1 = useMemo(() => {
    if (!hierN1) return null;
    return rapports.find(r => r.date === hierN1) || null;
  }, [rapports, hierN1]);

  const ventesHier = useMemo(() => {
    if (!rapportHier) return [];
    return ventes.filter(v => v.jour === hier);
  }, [ventes, rapportHier, hier]);

  const topHier = useMemo(() => {
    const m = new Map<string, { nom: string; qty: number; ca: number }>();
    for (const v of ventesHier) {
      const key = matchVenteToRecette(v.nom) || v.nom;
      const e = m.get(key) || { nom: key, qty: 0, ca: 0 };
      e.qty += v.quantity;
      e.ca += v.ttc;
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesHier, recetteNoms, caisseMapLoaded]);

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6"><p className="text-gray-400">Chargement…</p></div>;
  }

  if (rapports.length === 0) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Performance</h1>
        <p className="text-gray-500 mt-4">Aucun rapport journalier en base pour l'instant. Les rapports sont remplis automatiquement quand Popina envoie un mail de fin de caisse.</p>
      </div>
    );
  }

  const ticketMoyen = kpi.couverts > 0 ? kpi.caTTC / kpi.couverts : 0;
  const pctFood = (kpi.foodCA + kpi.drinkCA) > 0 ? (kpi.foodCA / (kpi.foodCA + kpi.drinkCA)) * 100 : 0;
  const pctDrink = 100 - pctFood;
  const pctEntrees = kpi.couverts > 0 ? (kpi.nbEntrees / kpi.couverts) * 100 : 0;
  const pctDesserts = kpi.couverts > 0 ? (kpi.nbDesserts / kpi.couverts) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Performance</h1>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">Voir par :</span>
          {(['jour', 'semaine', 'mois'] as const).map(g => (
            <button key={g} onClick={() => { setGranularite(g); setBucket('all'); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border ${granularite === g ? 'bg-black border-black text-white' : 'border-gray-200 text-gray-500'}`}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setBucket('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${bucket === 'all' ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
          Tous
        </button>
        {bucketsDisponibles.map(b => (
          <button key={b} onClick={() => setBucket(b)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${bucket === b ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500'}`}>
            {b}
          </button>
        ))}
      </div>

      {/* Résumé de la veille */}
      {rapportHier && (() => {
        const n1 = rapportHierN1;
        const deltaCa = n1 ? rapportHier.caTTC - n1.caTTC : null;
        const deltaPct = n1 && n1.caTTC > 0 ? (deltaCa! / n1.caTTC) * 100 : null;
        const deltaCouverts = n1 ? rapportHier.couverts - n1.couverts : null;
        return (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm text-yellow-700">Hier — {new Date(hier + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">CA TTC</p>
                <p className="font-bold">{fmtEur(rapportHier.caTTC)}</p>
                {n1 && <p className={`text-xs ${deltaCa! >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {deltaCa! >= 0 ? '+' : ''}{fmtEur(deltaCa!)} ({deltaPct! >= 0 ? '+' : ''}{fmtPct(deltaPct!)}) vs N-1
                </p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">CA HT</p>
                <p className="font-bold">{fmtEur(rapportHier.caHT)}</p>
                {n1 && <p className="text-xs text-gray-400">N-1 : {fmtEur(n1.caHT)}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">Couverts</p>
                <p className="font-bold">{rapportHier.couverts}</p>
                {n1 && <p className={`text-xs ${deltaCouverts! >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {deltaCouverts! >= 0 ? '+' : ''}{deltaCouverts} vs N-1
                </p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">Commandes</p>
                <p className="font-bold">{rapportHier.commandes}</p>
                {n1 && <p className="text-xs text-gray-400">N-1 : {n1.commandes}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">Ticket moyen</p>
                <p className="font-bold">{rapportHier.couverts > 0 ? fmtEur(rapportHier.caTTC / rapportHier.couverts) : '—'}</p>
                {n1 && n1.couverts > 0 && <p className="text-xs text-gray-400">N-1 : {fmtEur(n1.caTTC / n1.couverts)}</p>}
              </div>
            </div>
            {topHier.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">Top vendus</p>
                  <div className="space-y-0.5 text-sm">
                    {topHier.slice(0, 5).map((p, i) => (
                      <div key={p.nom} className="flex justify-between">
                        <span className="truncate mr-2"><span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{p.nom}</span>
                        <span className="text-gray-500 font-mono text-xs">{p.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">Catégories</p>
                  <div className="space-y-0.5 text-sm">
                    {Object.entries(rapportHier.categories || {}).sort(([,a], [,b]) => b.ca - a.ca).map(([nom, stat]) => (
                      <div key={nom} className="flex justify-between">
                        <span className="truncate mr-2">{nom}</span>
                        <span className="text-gray-500 font-mono text-xs">{fmtEur(stat.ca)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(rapportHier.reductionsTotal?.ttc > 0 || rapportHier.annulationsTotal > 0) && (
              <div className="flex gap-6 text-xs text-gray-500">
                {rapportHier.reductionsTotal?.ttc > 0 && <span>Réductions : {fmtEur(rapportHier.reductionsTotal.ttc)}</span>}
                {rapportHier.annulationsTotal > 0 && <span>Annulations : {fmtEur(rapportHier.annulationsTotal)}</span>}
                {rapportHier.pourboires > 0 && <span>Pourboires : {fmtEur(rapportHier.pourboires)}</span>}
              </div>
            )}
            {!n1 && <p className="text-xs text-gray-400">Pas de données N-1 pour le {hierN1}</p>}
          </div>
        );
      })()}

      {/* Alertes */}
      {alertes.length > 0 && (
        <div className="space-y-2">
          {alertes.map((a, i) => (
            <div key={i} className="bg-red-50 border-2 border-red-400 rounded-xl p-4 flex items-center gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="font-bold text-red-700">{a.label}</p>
                <p className="text-sm text-red-600">{a.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs principaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="CA TTC" value={fmtEur(kpi.caTTC)} />
        <Kpi label="CA HT" value={fmtEur(kpi.caHT)} />
        <Kpi label="Commandes" value={`${kpi.commandes}`} />
        <Kpi label="Ticket moyen" value={fmtEur(ticketMoyen)} sub={`${kpi.couverts} couverts`} />
      </div>

      {/* Objectif N-1 +10% */}
      {bucket !== 'all' && (() => {
        if (caNMoins1 === null) {
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
              Pas de données N-1 pour {bucket} à cette granularité. (L'historique passé est souvent agrégé au mois.)
            </div>
          );
        }
        const objectif = caNMoins1 * 1.10;
        const delta = kpi.caTTC - objectif;
        const pctDelta = objectif > 0 ? (delta / objectif) * 100 : 0;
        const onTrack = delta >= 0;
        return (
          <div className={`rounded-xl p-5 border-2 ${onTrack ? 'bg-green-50 border-green-300' : 'bg-orange-50 border-orange-300'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Objectif N-1 +10%</p>
              <span className="text-2xl">{onTrack ? '✅' : '⚠️'}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">N-1</p>
                <p className="font-bold">{fmtEur(caNMoins1)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Objectif (+10%)</p>
                <p className="font-bold">{fmtEur(objectif)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Écart réel</p>
                <p className={`font-bold ${onTrack ? 'text-green-700' : 'text-orange-700'}`}>
                  {delta >= 0 ? '+' : ''}{fmtEur(delta)} ({pctDelta >= 0 ? '+' : ''}{fmtPct(pctDelta)})
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Food" value={fmtPct(pctFood)} sub={fmtEur(kpi.foodCA)} />
        <Kpi label="Drink" value={fmtPct(pctDrink)} sub={fmtEur(kpi.drinkCA)} />
        <Kpi label="% clients entrée" value={fmtPct(pctEntrees)} sub={`${kpi.nbEntrees} entrées`} />
        <Kpi label="% clients dessert" value={fmtPct(pctDesserts)} sub={`${kpi.nbDesserts} desserts`} />
      </div>

      {/* 3 tops côte à côte */}
      <TopTrois topProduits={topProduits} foodCostPctParNom={foodCostPctParNom} recettes={recettes} />
    </div>
  );
}

const COLORS = ['#facc15','#f59e0b','#eab308','#d97706','#ca8a04','#b45309','#a16207','#92400e','#78350f','#713f12',
  '#65a30d','#4ade80','#22c55e','#16a34a','#15803d','#166534','#14532d','#059669','#0d9488','#0891b2'];

function TreemapContent({ x, y, width, height, name, value }: any) {
  if (width < 40 || height < 25) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        fill={COLORS[Math.abs(name?.charCodeAt(0) || 0) % COLORS.length]} fillOpacity={0.85} stroke="#fff" strokeWidth={2} />
      {width > 60 && height > 35 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#fff">{(name || '').slice(0, Math.floor(width / 7))}</text>
          <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.8)">{value?.toFixed(0)} €</text>
        </>
      )}
    </g>
  );
}

function TopTrois({ topProduits, foodCostPctParNom, recettes }: { topProduits: { nom: string; qty: number; ca: number }[]; foodCostPctParNom: Map<string, number>; recettes: Recette[] }) {
  const [showVendus, setShowVendus] = useState(10);
  const [showCA, setShowCA] = useState(10);
  const [showMarge, setShowMarge] = useState(10);
  const [treemapCat, setTreemapCat] = useState<string | null>(null);

  const catParNom = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recettes) { if (r.nom && r.categorie) m.set(r.nom.toLowerCase(), r.categorie); }
    return m;
  }, [recettes]);

  const topCA = useMemo(() => [...topProduits].sort((a, b) => (b.ca / 1.10) - (a.ca / 1.10)), [topProduits]);

  const produitsAvecMarge = useMemo(() =>
    topProduits
      .map(p => {
        const pct = foodCostPctParNom.get(p.nom.toLowerCase());
        if (typeof pct !== 'number' || pct <= 0) return null;
        const caHT = p.ca / 1.10;
        const marge = caHT * (1 - pct);
        const cat = catParNom.get(p.nom.toLowerCase()) || '—';
        return { ...p, marge, foodCostPct: pct * 100, cat };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.marge > 0)
      .sort((a, b) => b.marge - a.marge),
  [topProduits, foodCostPctParNom, catParNom]);

  // Treemap global par catégorie
  const treemapCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of produitsAvecMarge) {
      m.set(p.cat, (m.get(p.cat) || 0) + p.marge);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
  }, [produitsAvecMarge]);

  // Treemap détail pour une catégorie
  const treemapProduits = useMemo(() => {
    if (!treemapCat) return [];
    return produitsAvecMarge
      .filter(p => p.cat === treemapCat)
      .map(p => ({ name: p.nom, value: Math.round(p.marge) }));
  }, [produitsAvecMarge, treemapCat]);

  const treemapData = treemapCat ? treemapProduits : treemapCategories;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <h2 className="font-semibold mb-3">Top vendus</h2>
          <div className="space-y-1 text-sm">
            {topProduits.slice(0, showVendus).map((p, i) => (
              <div key={p.nom} className="flex justify-between border-b border-gray-50 py-1">
                <span className="truncate mr-2"><span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{p.nom}</span>
                <span className="text-gray-500 font-mono whitespace-nowrap">{p.qty}</span>
              </div>
            ))}
          </div>
          {showVendus < topProduits.length && (
            <button onClick={() => setShowVendus(v => v + 15)} className="mt-2 text-xs text-yellow-600 hover:underline">Voir plus</button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <h2 className="font-semibold mb-3">Top CA</h2>
          <div className="space-y-1 text-sm">
            {topCA.slice(0, showCA).map((p, i) => (
              <div key={p.nom} className="flex justify-between border-b border-gray-50 py-1">
                <span className="truncate mr-2"><span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{p.nom}</span>
                <span className="text-gray-500 font-mono whitespace-nowrap">{fmtEur(p.ca / 1.10)}</span>
              </div>
            ))}
          </div>
          {showCA < topCA.length && (
            <button onClick={() => setShowCA(v => v + 15)} className="mt-2 text-xs text-yellow-600 hover:underline">Voir plus</button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <h2 className="font-semibold mb-3">Top marge</h2>
          <div className="space-y-1 text-sm">
            {produitsAvecMarge.slice(0, showMarge).map((p, i) => (
              <div key={p.nom} className="flex justify-between border-b border-gray-50 py-1">
                <span className="truncate mr-2"><span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{p.nom}</span>
                <div className="flex gap-2 items-center">
                  <span className={`text-xs ${p.foodCostPct > 32 ? 'text-red-400' : 'text-gray-400'}`}>FC {p.foodCostPct.toFixed(0)}%</span>
                  <span className="text-green-600 font-mono whitespace-nowrap">{fmtEur(p.marge)}</span>
                </div>
              </div>
            ))}
          </div>
          {showMarge < produitsAvecMarge.length && (
            <button onClick={() => setShowMarge(v => v + 15)} className="mt-2 text-xs text-yellow-600 hover:underline">Voir plus</button>
          )}
        </div>
      </div>

      {treemapData.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              {treemapCat ? `Marge — ${treemapCat}` : 'Répartition marge par catégorie'}
            </h2>
            {treemapCat && (
              <button onClick={() => setTreemapCat(null)} className="text-xs text-yellow-600 hover:underline">← Toutes les catégories</button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <Treemap
              data={treemapData}
              dataKey="value"
              nameKey="name"
              content={<TreemapContent />}
              onClick={!treemapCat ? (node: any) => { if (node?.name) setTreemapCat(node.name); } : undefined}
              style={!treemapCat ? { cursor: 'pointer' } : undefined}
            />
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-yellow-100 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
