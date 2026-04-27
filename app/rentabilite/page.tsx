'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Treemap } from 'recharts';
import TimePeriodFilter, { isInPeriod, type TimePeriod } from '@/components/TimePeriodFilter';

interface Rapport {
  date: string;
  mois: string;
  caTTC: number;
  caHT: number;
  couverts: number;
  categories: Record<string, { qty: number; ca: number }>;
}

interface Vente {
  nom: string; quantity: number; ttc: number;
  menuNom: string; mois: string; jour?: string;
}

interface Recette {
  id: string; nom: string; coutCalcule?: number; prixVente?: number;
}

interface Achat {
  date: string;
  total: number;
  fournisseur: string;
}

const fmtEur = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function RentabilitePage() {
  const [rapports, setRapports] = useState<Rapport[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [ventesN1, setVentesN1] = useState<Vente[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [achats, setAchats] = useState<Achat[]>([]);
  const [achatsAll, setAchatsAll] = useState<Achat[]>([]); // pour le graph mensuel
  const [chartPeriod, setChartPeriod] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Default = Hier
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const hierStr = hier.toISOString().slice(0, 10);
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>({ label: 'Hier', dateDebut: hierStr, dateFin: hierStr });

  // 1) Petites collections : load une seule fois (rapports 34 + recettes 286)
  useEffect(() => {
    (async () => {
      const [rSnap, recSnap] = await Promise.all([
        getDocs(collection(db, 'rapportsJournaliers')),
        getDocs(collection(db, 'recettes')),
      ]);
      setRapports(rSnap.docs.map(d => d.data() as Rapport));
      setRecettes(recSnap.docs.map(d => ({ id: d.id, ...d.data() } as Recette)));
    })();
  }, []);

  // 2) Achats globaux : 1 fetch léger pour le graphique mensuel uniquement
  // (juste les champs utilisés : date, total, fournisseur)
  useEffect(() => {
    (async () => {
      const aSnap = await getDocs(collection(db, 'achats'));
      setAchatsAll(aSnap.docs.map(d => d.data() as Achat));
    })();
  }, []);

  // 3) Ventes + achats filtrés par période
  useEffect(() => {
    (async () => {
      setRefreshing(true);
      if (timePeriod) {
        const [vSnap, aSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'ventes'),
            where('jour', '>=', timePeriod.dateDebut),
            where('jour', '<=', timePeriod.dateFin),
          )),
          getDocs(query(
            collection(db, 'achats'),
            where('date', '>=', timePeriod.dateDebut),
            where('date', '<=', timePeriod.dateFin + 'T23:59:59.999Z'),
          )),
        ]);
        setVentes(vSnap.docs.map(d => d.data() as Vente));
        setAchats(aSnap.docs.map(d => d.data() as Achat));
      } else {
        const [vSnap, aSnap] = await Promise.all([
          getDocs(collection(db, 'ventes')),
          getDocs(collection(db, 'achats')),
        ]);
        setVentes(vSnap.docs.map(d => d.data() as Vente));
        setAchats(aSnap.docs.map(d => d.data() as Achat));
      }
      setLoading(false);
      setRefreshing(false);
    })();
  }, [timePeriod]);

  // 4) N-1 : ventes l'an passé sur la même période
  const periodN1 = useMemo((): TimePeriod | null => {
    if (!timePeriod) return null;
    const shift = (d: string) => {
      const m = d.match(/^(\d{4})-(.*)$/);
      return m ? `${parseInt(m[1]) - 1}-${m[2]}` : d;
    };
    return { label: 'N-1', dateDebut: shift(timePeriod.dateDebut), dateFin: shift(timePeriod.dateFin) };
  }, [timePeriod]);

  useEffect(() => {
    (async () => {
      if (!periodN1) { setVentesN1([]); return; }
      const snap = await getDocs(query(
        collection(db, 'ventes'),
        where('jour', '>=', periodN1.dateDebut),
        where('jour', '<=', periodN1.dateFin),
      ));
      setVentesN1(snap.docs.map(d => d.data() as Vente));
    })();
  }, [periodN1]);

  // Map nom → coût unitaire
  const coutParNom = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recettes) {
      if (r.nom && typeof r.coutCalcule === 'number') m.set(r.nom.toLowerCase(), r.coutCalcule);
    }
    return m;
  }, [recettes]);

  // Map nom → food cost %
  const foodCostPctParNom = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recettes) {
      if (r.nom && typeof r.coutCalcule === 'number' && typeof r.prixVente === 'number' && r.prixVente > 0) {
        const prixHT = r.prixVente / 1.10;
        const pct = r.coutCalcule / prixHT;
        m.set(r.nom.toLowerCase(), pct);
      }
    }
    return m;
  }, [recettes]);

  // KPIs (période courante)
  const kpi = useMemo(() => {
    // CA = somme des TTC des ventes filtrées (source de vérité)
    let caTTC = 0;
    for (const v of ventes) caTTC += v.ttc || 0;
    const caHT = caTTC / 1.10;

    // Food cost
    let foodCost = 0;
    for (const v of ventes) {
      const c = coutParNom.get(v.nom.toLowerCase());
      if (typeof c === 'number') foodCost += c * v.quantity;
    }
    const margeBrute = caHT - foodCost;

    // Total achats
    let totalAchats = 0;
    for (const a of achats) totalAchats += a.total || 0;

    return { caTTC, caHT, foodCost, margeBrute, totalAchats };
  }, [ventes, achats, coutParNom]);

  // CA N-1
  const caN1 = useMemo(() => ventesN1.reduce((s, v) => s + (v.ttc || 0), 0), [ventesN1]);

  // Graphique Ventes vs Achats par mois
  const chartYears = useMemo(() => {
    const years = new Set<string>();
    for (const r of rapports) {
      const y = (r.mois || r.date)?.slice(0, 4);
      if (y) years.add(y);
    }
    return ['all', ...Array.from(years).sort()];
  }, [rapports]);

  // Le graphique mensuel utilise TOUTE l'historique (pas le filtre période global)
  const chartData = useMemo(() => {
    const ventesParMois = new Map<string, number>();
    for (const r of rapports) {
      const m = r.mois || r.date?.slice(0, 7);
      if (!m) continue;
      if (chartPeriod !== 'all' && !m.startsWith(chartPeriod)) continue;
      ventesParMois.set(m, (ventesParMois.get(m) || 0) + (r.caTTC || 0));
    }

    const achatsParMois = new Map<string, number>();
    for (const a of achatsAll) {
      const d = a.date?.slice(0, 7);
      if (!d) continue;
      if (chartPeriod !== 'all' && !d.startsWith(chartPeriod)) continue;
      achatsParMois.set(d, (achatsParMois.get(d) || 0) + (a.total || 0));
    }

    const allMonths = new Set([...ventesParMois.keys(), ...achatsParMois.keys()]);
    return Array.from(allMonths).sort().map(m => ({
      mois: m,
      ventes: Math.round(ventesParMois.get(m) || 0),
      achats: Math.round(achatsParMois.get(m) || 0),
    }));
  }, [rapports, achatsAll, chartPeriod]);

  // Achats par fournisseur
  const achatsParFournisseur = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of achats) {
      const f = a.fournisseur || 'Inconnu';
      m.set(f, (m.get(f) || 0) + (a.total || 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [achats]);

  // Top produits par ventes pour le calcul de marge
  const topProduits = useMemo(() => {
    const m = new Map<string, { qty: number; ca: number }>();
    for (const v of ventes) {
      const e = m.get(v.nom) || { qty: 0, ca: 0 };
      e.qty += v.quantity;
      e.ca += v.ttc;
      m.set(v.nom, e);
    }
    return Array.from(m.entries())
      .map(([nom, v]) => ({ nom, ...v }))
      .sort((a, b) => b.qty - a.qty);
  }, [ventes]);

  const pctFoodCost = kpi.caHT > 0 ? (kpi.foodCost / kpi.caHT) * 100 : 0;
  const pctMarge = kpi.caHT > 0 ? (kpi.margeBrute / kpi.caHT) * 100 : 0;
  const ratioAchatsCA = kpi.caTTC > 0 ? (kpi.totalAchats / kpi.caTTC) * 100 : 0;
  const deltaN1 = caN1 > 0 ? ((kpi.caTTC - caN1) / caN1) * 100 : null;

  // Années dispos pour le filtre (3 dernières)
  const availableDatesUI = useMemo(() => {
    const y = new Date().getFullYear();
    return [`${y}-01-01`, `${y - 1}-01-01`, `${y - 2}-01-01`];
  }, []);

  if (loading) return <div className="max-w-6xl mx-auto p-6"><p className="text-gray-400">Chargement...</p></div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Rentabilité</h1>
        {refreshing && <span className="text-xs text-gray-400">Actualisation…</span>}
      </div>

      <TimePeriodFilter
        availableDates={availableDatesUI}
        value={timePeriod}
        onChange={setTimePeriod}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="CA TTC" value={fmtEur(kpi.caTTC)}
          sub={deltaN1 !== null ? `${deltaN1 >= 0 ? '+' : ''}${deltaN1.toFixed(1)}% vs N-1 (${fmtEur(caN1)})` : caN1 === 0 && timePeriod ? 'Pas de données N-1' : undefined}
          color={deltaN1 !== null ? (deltaN1 >= 0 ? 'text-green-600' : 'text-orange-500') : undefined} />
        <Kpi label="Food cost" value={fmtPct(pctFoodCost)} sub={fmtEur(kpi.foodCost)} color={pctFoodCost > 32 ? 'text-red-500' : 'text-gray-800'} />
        <Kpi label="Marge brute" value={fmtEur(kpi.margeBrute)} sub={fmtPct(pctMarge)} color={pctMarge < 60 ? 'text-orange-500' : 'text-green-600'} />
        <Kpi label="Total achats" value={fmtEur(kpi.totalAchats)} sub={`${fmtPct(ratioAchatsCA)} du CA TTC`} />
      </div>

      {/* Répartition achats par fournisseur */}
      {achatsParFournisseur.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <h2 className="font-semibold mb-3">Achats par fournisseur</h2>
          <div className="space-y-2">
            {achatsParFournisseur.map(([f, total]) => {
              const pct = kpi.totalAchats > 0 ? (total / kpi.totalAchats) * 100 : 0;
              return (
                <div key={f} className="flex items-center gap-3">
                  <span className="text-sm w-32 truncate">{f}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div className="bg-yellow-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-mono w-24 text-right">{fmtEur(total)}</span>
                  <span className="text-xs text-gray-400 w-12 text-right">{fmtPct(pct)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Graphique Ventes vs Achats */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Ventes vs Achats</h2>
            <div className="flex gap-1">
              {chartYears.map(y => (
                <button key={y} onClick={() => setChartPeriod(y)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${chartPeriod === y ? 'bg-black border-black text-white' : 'border-gray-200 text-gray-500'}`}>
                  {y === 'all' ? 'Tout' : y}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
              <Legend />
              <Bar dataKey="ventes" name="Ventes (CA TTC)" fill="#facc15" radius={[4, 4, 0, 0]} />
              <Bar dataKey="achats" name="Achats fournisseurs" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top marge + Treemap */}
      <TopMarge topProduits={topProduits} foodCostPctParNom={foodCostPctParNom} />
    </div>
  );
}

// ============================================================================
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

function TopMarge({ topProduits, foodCostPctParNom }: { topProduits: { nom: string; qty: number; ca: number }[]; foodCostPctParNom: Map<string, number> }) {
  const [showMarge, setShowMarge] = useState(15);

  const produitsAvecMarge = useMemo(() =>
    topProduits
      .map(p => {
        const pct = foodCostPctParNom.get(p.nom.toLowerCase());
        if (typeof pct !== 'number') return null;
        const caHT = p.ca / 1.10;
        const marge = caHT * (1 - pct);
        const foodCostPct = pct * 100;
        return { ...p, marge, foodCostPct };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.marge > 0)
      .sort((a, b) => b.marge - a.marge),
  [topProduits, foodCostPctParNom]);

  const treemapData = useMemo(() =>
    produitsAvecMarge.slice(0, 30).map(p => ({ name: p.nom, value: Math.round(p.marge) })),
  [produitsAvecMarge]);

  return (
    <>
      <div className="bg-white rounded-xl border border-yellow-100 p-5">
        <h2 className="font-semibold mb-3">Top marge par produit</h2>
        <div className="space-y-1 text-sm">
          {produitsAvecMarge.slice(0, showMarge).map((p, i) => (
            <div key={p.nom} className="flex justify-between border-b border-gray-50 py-1">
              <span className="truncate mr-2"><span className="text-gray-400 text-xs mr-1">{i + 1}.</span>{p.nom}</span>
              <div className="flex gap-4 items-center">
                <span className={`text-xs ${p.foodCostPct > 32 ? 'text-red-400' : 'text-gray-400'}`}>FC {p.foodCostPct.toFixed(0)}%</span>
                <span className="text-green-600 font-mono whitespace-nowrap w-20 text-right">{fmtEur(p.marge)}</span>
              </div>
            </div>
          ))}
        </div>
        {showMarge < produitsAvecMarge.length && (
          <button onClick={() => setShowMarge(v => v + 15)} className="mt-2 text-xs text-yellow-600 hover:underline">Voir plus</button>
        )}
      </div>

      {treemapData.length > 0 && (
        <div className="bg-white rounded-xl border border-yellow-100 p-5">
          <h2 className="font-semibold mb-3">Répartition marge par produit</h2>
          <ResponsiveContainer width="100%" height={400}>
            <Treemap data={treemapData} dataKey="value" nameKey="name" content={<TreemapContent />} />
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-yellow-100 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color || ''}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}
