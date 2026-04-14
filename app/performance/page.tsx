'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  id: string; nom: string; coutCalcule?: number;
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

const fmtEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
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

  // === Top produits ===
  const topProduits = useMemo(() => {
    const m = new Map<string, { nom: string; qty: number; ca: number }>();
    for (const v of ventesFiltrées) {
      const e = m.get(v.nom) || { nom: v.nom, qty: 0, ca: 0 };
      e.qty += v.quantity;
      e.ca += v.ttc;
      m.set(v.nom, e);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
  }, [ventesFiltrées]);

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

  const pctFoodCost = kpi.caHT > 0 ? (kpi.foodCost / kpi.caHT) * 100 : 0;
  const pctMarge = kpi.caHT > 0 ? (kpi.margeBrute / kpi.caHT) * 100 : 0;
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
        <Kpi label="Marge brute" value={fmtEur(kpi.margeBrute)} sub={`${fmtPct(pctMarge)} · Food cost ${fmtPct(pctFoodCost)}`} />
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

      {/* Top produits */}
      <div className="bg-white rounded-xl border border-yellow-100 p-5">
        <h2 className="font-semibold mb-3">Top produits vendus</h2>
        <div className="space-y-1 text-sm">
          {topProduits.slice(0, 20).map(p => (
            <div key={p.nom} className="flex justify-between border-b border-gray-50 py-1">
              <span>{p.nom}</span>
              <span className="text-gray-500 font-mono">{p.qty} · {fmtEur(p.ca)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Détail par produit (rapport style Popina) */}
      <div className="bg-white rounded-xl border border-yellow-100 p-5">
        <h2 className="font-semibold mb-3">Détail ventes par produit</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2">Produit</th>
              <th className="text-right">Qty</th>
              <th className="text-right">CA TTC</th>
              <th className="text-right">Food cost</th>
              <th className="text-right">Marge</th>
            </tr>
          </thead>
          <tbody>
            {topProduits.map(p => {
              const cu = coutParNom.get(p.nom.toLowerCase());
              const foodCost = typeof cu === 'number' ? cu * p.qty : null;
              const caHT = p.ca / 1.10; // approximation food 10% — note : la TVA exacte vient des rapports journaliers
              const marge = foodCost !== null ? caHT - foodCost : null;
              return (
                <tr key={p.nom} className="border-b border-gray-50">
                  <td className="py-2">{p.nom}</td>
                  <td className="text-right font-mono">{p.qty}</td>
                  <td className="text-right font-mono">{fmtEur(p.ca)}</td>
                  <td className="text-right font-mono text-gray-500">{foodCost !== null ? fmtEur(foodCost) : '—'}</td>
                  <td className={`text-right font-mono ${marge !== null && marge > 0 ? 'text-green-600' : 'text-gray-400'}`}>{marge !== null ? fmtEur(marge) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
