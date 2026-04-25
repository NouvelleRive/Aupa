'use client';

import { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CAISSE_MAP, normalizeCaisse } from '@/lib/caisseMap';
import { MenuDoc } from '@/lib/menuTypes';
import { ResponsiveContainer, Treemap, PieChart, Pie, Cell, Tooltip } from 'recharts';
import TimePeriodFilter, { isInPeriod, type TimePeriod } from '@/components/TimePeriodFilter';

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


const fmtEur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function PerformancePage() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [menus, setMenus] = useState<MenuDoc[]>([]);
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const hierStr = hier.toISOString().slice(0, 10);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>({ label: 'Hier', dateDebut: hierStr, dateFin: hierStr });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [rSnap, vSnap, recSnap, mSnap] = await Promise.all([
        getDocs(collection(db, 'rapportsJournaliers')),
        getDocs(collection(db, 'ventes')),
        getDocs(collection(db, 'recettes')),
        getDocs(collection(db, 'menus')),
      ]);
      setRapports(rSnap.docs.map(d => d.data() as Rapport));
      setVentes(vSnap.docs.map(d => d.data() as Vente));
      setRecettes(recSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
      setMenus(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MenuDoc)));
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

  // Dates disponibles pour le filtre (rapports + ventes)
  const availableDates = useMemo(() => {
    const dates = new Set(rapports.map(r => r.date));
    for (const v of ventes) {
      if (v.jour) dates.add(v.jour);
    }
    return Array.from(dates);
  }, [rapports, ventes]);

  const rapportsFiltrés = useMemo(() => {
    if (!timePeriod) return rapports;
    return rapports.filter(r => isInPeriod(r.date, timePeriod));
  }, [rapports, timePeriod]);

  const ventesFiltrées = useMemo(() => {
    if (!timePeriod) return ventes;
    return ventes.filter(v => isInPeriod(v.jour || v.mois, timePeriod));
  }, [ventes, timePeriod]);

  // N-1 : même période l'année précédente
  const periodN1 = useMemo((): TimePeriod | null => {
    if (!timePeriod) return null;
    const shift = (d: string) => {
      const m = d.match(/^(\d{4})-(.*)$/);
      return m ? `${parseInt(m[1]) - 1}-${m[2]}` : d;
    };
    return { label: 'N-1', dateDebut: shift(timePeriod.dateDebut), dateFin: shift(timePeriod.dateFin) };
  }, [timePeriod]);

  const ventesN1 = useMemo(() => {
    if (!periodN1) return [];
    return ventes.filter(v => isInPeriod(v.jour || v.mois, periodN1));
  }, [ventes, periodN1]);

  const caNMoins1 = useMemo((): number | null => {
    if (ventesN1.length === 0) return null;
    return ventesN1.reduce((s, v) => s + (v.ttc || 0), 0);
  }, [ventesN1]);

  // === KPIs agrégés — CA depuis les ventes, le reste depuis les rapports ===
  const kpi = useMemo(() => {
    // CA depuis les ventes (source de vérité)
    let caTTC = 0;
    for (const v of ventesFiltrées) {
      caTTC += v.ttc || 0;
    }
    const caHT = caTTC / 1.10; // approximation standard

    // Infos complémentaires depuis les rapports (couverts, commandes, réductions...)
    const agg = {
      couverts: 0, commandes: 0,
      reductions: 0, reductionsOfferts: 0, annulations: 0, pourboires: 0,
      foodCA: 0, drinkCA: 0, nbEntrees: 0, nbDesserts: 0, nbPlats: 0,
    };
    for (const r of rapportsFiltrés) {
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
        if (n === 'plats' || n === 'aupa croissant burger eat') agg.nbPlats += stat.qty;
      }
    }
    // Food cost via recettes
    let foodCost = 0;
    for (const v of ventesFiltrées) {
      const c = coutParNom.get(v.nom.toLowerCase());
      if (typeof c === 'number') foodCost += c * v.quantity;
    }
    const margeBrute = caHT - foodCost;
    return { caTTC, caHT, ...agg, foodCost, margeBrute };
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

  // === Ratios entrées / desserts par nb plats vendus (depuis ventes) ===
  const ratiosV = useMemo(() => {
    let nbEntrees = 0, nbPlats = 0, nbDesserts = 0;
    const PLATS_CATS = new Set(['Croger', 'Bols', 'Salade', 'Salades']);
    for (const v of ventesFiltrées) {
      const recetteNom = matchVenteToRecette(v.nom) || v.nom;
      const rec = recettes.find(r => r.nom === recetteNom);
      if (!rec?.categorie) continue;
      if (rec.categorie === 'Entrées') nbEntrees += v.quantity;
      else if (PLATS_CATS.has(rec.categorie)) nbPlats += v.quantity;
      else if (rec.categorie === 'Desserts') nbDesserts += v.quantity;
    }
    return { nbEntrees, nbPlats, nbDesserts };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventesFiltrées, recettes, caisseMapLoaded]);

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
  // Nb personnes estimé = nb plats principaux vendus (depuis ventes via catégorie recette)
  const nbPersonnes = ratiosV.nbPlats || kpi.nbPlats;
  const nbEntrees = ratiosV.nbEntrees || kpi.nbEntrees;
  const nbDesserts = ratiosV.nbDesserts || kpi.nbDesserts;
  const pctEntrees = nbPersonnes > 0 ? (nbEntrees / nbPersonnes) * 100 : 0;
  const pctDesserts = nbPersonnes > 0 ? (nbDesserts / nbPersonnes) * 100 : 0;

  const pieData = [
    { name: 'Food', value: Math.round(kpi.foodCA), color: '#facc15' },
    { name: 'Drink', value: Math.round(kpi.drinkCA), color: '#f97316' },
  ].filter(d => d.value > 0);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      <h1 className="text-2xl font-bold">Performance</h1>

      <TimePeriodFilter
        availableDates={availableDates}
        value={timePeriod}
        onChange={setTimePeriod}
      />

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
      {(() => {
        const joursUniques = new Set(ventesFiltrées.map(v => v.jour).filter(Boolean));
        const nbJours = joursUniques.size;
        const showMoy = nbJours > 1;
        return (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Kpi label="CA TTC" value={fmtEur(kpi.caTTC)}
                sub={showMoy ? `moy. ${fmtEur(kpi.caTTC / nbJours)} / jour` : undefined} />
              <Kpi label="CA HT" value={fmtEur(kpi.caHT)}
                sub={showMoy ? `moy. ${fmtEur(kpi.caHT / nbJours)} / jour` : undefined} />
              <Kpi label="Commandes" value={`${kpi.commandes}`}
                sub={showMoy ? `moy. ${Math.round(kpi.commandes / nbJours)} / jour` : undefined} />
              <Kpi label="Ticket moyen" value={fmtEur(ticketMoyen)}
                sub={`${kpi.couverts} couverts${showMoy ? ` · moy. ${Math.round(kpi.couverts / nbJours)} / jour` : ''}`} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Kpi label="Marge théorique" value={fmtEur(kpi.margeBrute)}
                sub={kpi.caHT > 0 ? `${fmtPct((kpi.margeBrute / kpi.caHT) * 100)} du CA HT` : undefined} />
              <Kpi label="Food cost théorique" value={fmtEur(kpi.foodCost)}
                sub={kpi.caHT > 0 ? `${fmtPct((kpi.foodCost / kpi.caHT) * 100)} du CA HT` : undefined} />
              <Kpi label="Marge moyenne / vente" value={ventesFiltrées.length > 0 ? fmtEur(kpi.margeBrute / ventesFiltrées.reduce((s, v) => s + v.quantity, 0)) : '—'}
                sub={`sur ${ventesFiltrées.reduce((s, v) => s + v.quantity, 0)} articles vendus`} />
            </div>
          </>
        );
      })()}

      {/* Objectif N-1 +10% */}
      {timePeriod && (() => {
        if (caNMoins1 === null) {
          return (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
              Pas de données N-1 pour {timePeriod.label}.
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Camembert Food / Drink */}
        <div className="bg-white rounded-xl border border-yellow-100 p-4 flex flex-col items-center">
          <p className="text-xs text-gray-500 mb-2">Répartition CA</p>
          {pieData.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={45} outerRadius={75} paddingAngle={2}
                  label={({ name, value, percent }: any) => `${name} ${(percent * 100).toFixed(0)}% · ${fmtEur(Number(value))}`}
                  labelLine={false} fontSize={11}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtEur(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* % entrées */}
        <Kpi label="% clients entrée" value={fmtPct(pctEntrees)}
          sub={`${nbEntrees} entrées / ${nbPersonnes} plats`} />

        {/* % desserts */}
        <Kpi label="% clients dessert" value={fmtPct(pctDesserts)}
          sub={`${nbDesserts} desserts / ${nbPersonnes} plats`} />
      </div>

      {/* 3 tops côte à côte */}
      <TopTrois topProduits={topProduits} coutParNom={coutParNom} recettes={recettes} menus={menus} timePeriod={timePeriod} />

      {/* Détail des ventes — infinite scroll */}
      <VentesDetail ventes={ventesFiltrées} matchVente={matchVenteToRecette} />
    </div>
  );
}

function VentesDetail({ ventes, matchVente }: {
  ventes: Vente[];
  matchVente: (nom: string) => string | null;
}) {
  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Regrouper par produit (somme qté + TTC)
  const grouped = useMemo(() => {
    const m = new Map<string, { nom: string; qty: number; ttc: number }>();
    for (const v of ventes) {
      const key = v.nom;
      const e = m.get(key) || { nom: v.nom, qty: 0, ttc: 0 };
      e.qty += v.quantity;
      e.ttc += v.ttc;
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty);
  }, [ventes]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [ventes]);

  const hasMore = visibleCount < grouped.length;

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore) {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, grouped.length));
    }
  }, [hasMore, grouped.length]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  if (ventes.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-yellow-100 overflow-x-auto">
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h2 className="font-semibold">Détail des ventes</h2>
        <span className="text-xs text-gray-400">{grouped.length} produits · {ventes.length} lignes</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
            <th className="py-2 px-4">Produit</th>
            <th className="py-2 px-4 text-right">Qté</th>
            <th className="py-2 px-4 text-right">CA TTC</th>
          </tr>
        </thead>
        <tbody>
          {grouped.slice(0, visibleCount).map((g, i) => {
            const recette = matchVente(g.nom);
            return (
              <tr key={`${g.nom}-${i}`} className="border-b border-gray-50 hover:bg-yellow-50/30">
                <td className="py-2 px-4">
                  <div>{g.nom}</div>
                  {recette && <div className="text-xs text-gray-400">({recette})</div>}
                </td>
                <td className="py-2 px-4 text-right font-mono">{g.qty}</td>
                <td className="py-2 px-4 text-right font-mono">{fmtEur(g.ttc)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <div ref={loaderRef} className="py-4 text-center text-xs text-gray-400">
          Chargement…
        </div>
      )}
    </div>
  );
}

function VenteAttribution({ venteNom, recetteNoms, onMapped }: { venteNom: string; recetteNoms: string[]; onMapped: () => void }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const recetteNom = e.target.value;
    if (!recetteNom) return;
    setSaving(true);
    const caisseKey = normalizeCaisse(venteNom);
    const recetteKey = normalizeCaisse(recetteNom).replace(/\s+(ete|hiver)$/, '');
    CAISSE_MAP[caisseKey] = recetteKey;
    await addDoc(collection(db, 'caisseMapCustom'), {
      caisse: caisseKey,
      recette: recetteKey,
      original: venteNom,
      recetteNom,
    });
    setSaving(false);
    onMapped();
  };

  return (
    <select onChange={handleChange} disabled={saving}
      className="text-xs text-orange-400 bg-transparent border-none cursor-pointer p-0"
      defaultValue="">
      <option value="">(non attribué — cliquer pour attribuer)</option>
      {recetteNoms.filter(Boolean).sort().map(nom => (
        <option key={nom} value={nom}>{nom}</option>
      ))}
    </select>
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

function TopTrois({ topProduits, coutParNom, recettes, menus, timePeriod }: { topProduits: { nom: string; qty: number; ca: number }[]; coutParNom: Map<string, number>; recettes: Recette[]; menus: MenuDoc[]; timePeriod: TimePeriod | null }) {
  const [showVendus, setShowVendus] = useState(10);
  const [showCA, setShowCA] = useState(10);
  const [showMarge, setShowMarge] = useState(10);
  const [treemapCat, setTreemapCat] = useState<string | null>(null);

  // Catégorie par nom de recette — depuis le menu actif à la période filtrée
  const catParNom = useMemo(() => {
    const m = new Map<string, string>();
    // Trouver le menu actif pour la période
    const dateRef = timePeriod?.dateDebut || new Date().toISOString().slice(0, 10);
    const menuActif = menus.find(menu => menu.dateDebut && menu.dateFin && dateRef >= menu.dateDebut && dateRef <= menu.dateFin)
      || menus.find(menu => menu.actif);
    if (menuActif) {
      for (const cat of menuActif.categories || []) {
        for (const mr of cat.recettes || []) {
          const r = recettes.find(x => x.id === mr.id);
          if (r) m.set(r.nom.toLowerCase(), cat.nom);
        }
      }
    }
    // Fallback : catégorie de la recette pour celles pas dans le menu
    for (const r of recettes) {
      if (r.nom && r.categorie && !m.has(r.nom.toLowerCase())) {
        m.set(r.nom.toLowerCase(), r.categorie);
      }
    }
    return m;
  }, [recettes, menus, timePeriod]);

  const topCA = useMemo(() => [...topProduits].sort((a, b) => (b.ca / 1.10) - (a.ca / 1.10)), [topProduits]);

  const produitsAvecMarge = useMemo(() =>
    topProduits
      .map(p => {
        const cout = coutParNom.get(p.nom.toLowerCase());
        if (typeof cout !== 'number' || cout <= 0) return null;
        const caHT = p.ca / 1.10;
        const marge = caHT - cout * p.qty;
        const foodCostPct = (cout * p.qty) / caHT;
        const cat = catParNom.get(p.nom.toLowerCase()) || '—';
        return { ...p, marge, foodCostPct: foodCostPct * 100, cat };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.marge > 0)
      .sort((a, b) => b.marge - a.marge),
  [topProduits, coutParNom, catParNom]);

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
