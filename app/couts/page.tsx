'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Treemap, ResponsiveContainer } from 'recharts';
import TimePeriodFilter, { isInPeriod, type TimePeriod } from '@/components/TimePeriodFilter';

interface Achat {
  id: string;
  pfId: string;
  code: string;
  nom: string;
  qte: number;
  prixUnitaire: number;
  total: number;
  date: string;
  fournisseur: string;
}

interface PF {
  id: string;
  categorie: string;
}

type SortKey = 'date' | 'nom' | 'fournisseur' | 'categorie' | 'total' | 'qte' | 'prixUnitaire';
type SortDir = 'asc' | 'desc';

const fmtEur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const fmtDate = (d: string) => {
  if (!d) return '';
  const s = d.slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
};

export default function CoutsPage() {
  const [achats, setAchats] = useState<Achat[]>([]);
  const [pfMap, setPfMap] = useState<Map<string, PF>>(new Map());
  const [loading, setLoading] = useState(true);

  const [filterFournisseur, setFilterFournisseur] = useState<string>('all');
  const [filterCategorie, setFilterCategorie] = useState<string>('all');
  const [timePeriod, setTimePeriod] = useState<TimePeriod | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    (async () => {
      const [aSnap, pfSnap] = await Promise.all([
        getDocs(collection(db, 'achats')),
        getDocs(collection(db, 'produitsFournisseurs')),
      ]);
      setAchats(aSnap.docs.map(d => ({ id: d.id, ...d.data() } as Achat)));
      const m = new Map<string, PF>();
      for (const d of pfSnap.docs) m.set(d.id, { id: d.id, ...d.data() } as PF);
      setPfMap(m);
      setLoading(false);
    })();
  }, []);

  const fournisseurs = useMemo(() => {
    const s = new Set(achats.map(a => a.fournisseur).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [achats]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const a of achats) {
      const pf = pfMap.get(a.pfId);
      if (pf?.categorie) s.add(pf.categorie);
    }
    return ['all', ...Array.from(s).sort()];
  }, [achats, pfMap]);

  const getCategorie = (a: Achat) => pfMap.get(a.pfId)?.categorie || '—';
  const getDateStr = (d: string) => d?.slice(0, 10) || '';

  const filtered = useMemo(() => {
    return achats.filter(a => {
      if (filterFournisseur !== 'all' && a.fournisseur !== filterFournisseur) return false;
      if (filterCategorie !== 'all' && getCategorie(a) !== filterCategorie) return false;
      if (!isInPeriod(a.date, timePeriod)) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achats, pfMap, filterFournisseur, filterCategorie, timePeriod]);

  // Regrouper par produit
  const grouped = useMemo(() => {
    const m = new Map<string, { nom: string; fournisseur: string; categorie: string; qte: number; total: number; nbAchats: number }>();
    for (const a of filtered) {
      const key = a.nom;
      const e = m.get(key) || { nom: a.nom, fournisseur: a.fournisseur, categorie: getCategorie(a), qte: 0, total: 0, nbAchats: 0 };
      e.qte += a.qte;
      e.total += a.total;
      e.nbAchats++;
      m.set(key, e);
    }
    return Array.from(m.values());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, pfMap]);

  const sorted = useMemo(() => {
    return [...grouped].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'nom') { va = a.nom.toLowerCase(); vb = b.nom.toLowerCase(); }
      else if (sortKey === 'fournisseur') { va = a.fournisseur; vb = b.fournisseur; }
      else if (sortKey === 'categorie') { va = a.categorie; vb = b.categorie; }
      else if (sortKey === 'total') { va = a.total; vb = b.total; }
      else if (sortKey === 'qte') { va = a.qte; vb = b.qte; }
      else if (sortKey === 'prixUnitaire') { va = a.total / a.qte; vb = b.total / b.qte; }
      else if (sortKey === 'date') { va = a.total; vb = b.total; } // fallback tri par total
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [grouped, sortKey, sortDir]);

  const totalFiltered = useMemo(() => filtered.reduce((s, a) => s + a.total, 0), [filtered]);

  // Infinite scroll
  const PAGE_SIZE = 100;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Reset visible count when filters/sort change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filterFournisseur, filterCategorie, timePeriod, sortKey, sortDir]);

  const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
  const hasMore = visibleCount < sorted.length;

  const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMore) {
      setVisibleCount(c => Math.min(c + PAGE_SIZE, sorted.length));
    }
  }, [hasMore, sorted.length]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(onIntersect, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [onIntersect]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc'); }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  if (loading) return <div className="max-w-6xl mx-auto p-6"><p className="text-gray-400">Chargement…</p></div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Coûts</h1>

      {/* Filtre période */}
      <TimePeriodFilter
        availableDates={achats.map(a => a.date?.slice(0, 10)).filter(Boolean)}
        value={timePeriod}
        onChange={setTimePeriod}
      />

      {/* Filtres fournisseur / catégorie */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Fournisseur</label>
          <select value={filterFournisseur} onChange={e => setFilterFournisseur(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
            {fournisseurs.map(f => <option key={f} value={f}>{f === 'all' ? 'Tous' : f}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Catégorie</label>
          <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'Toutes' : c}</option>)}
          </select>
        </div>
        <div className="ml-auto text-sm text-gray-500">
          {grouped.length} produits · {filtered.length} achats · <span className="font-bold text-black">{fmtEur(totalFiltered)}</span>
        </div>
      </div>

      {/* Treemaps */}
      <CoutsTreemaps filtered={filtered} getCategorie={getCategorie} />

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-yellow-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort('fournisseur')}>Fournisseur{sortIcon('fournisseur')}</th>
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort('categorie')}>Catégorie{sortIcon('categorie')}</th>
              <th className="py-2 px-3 cursor-pointer select-none" onClick={() => toggleSort('nom')}>Produit{sortIcon('nom')}</th>
              <th className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort('qte')}>Qté{sortIcon('qte')}</th>
              <th className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort('prixUnitaire')}>Prix moy.{sortIcon('prixUnitaire')}</th>
              <th className="py-2 px-3 text-right cursor-pointer select-none" onClick={() => toggleSort('total')}>Total{sortIcon('total')}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((a, i) => (
              <tr key={`${a.nom}-${i}`} className="border-b border-gray-50 hover:bg-yellow-50/30">
                <td className="py-2 px-3">{a.fournisseur}</td>
                <td className="py-2 px-3 text-gray-500">{a.categorie}</td>
                <td className="py-2 px-3">{a.nom}</td>
                <td className="py-2 px-3 text-right font-mono">{a.qte}</td>
                <td className="py-2 px-3 text-right font-mono">{a.qte > 0 ? fmtEur(a.total / a.qte) : '—'}</td>
                <td className="py-2 px-3 text-right font-mono font-semibold">{fmtEur(a.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <div ref={loaderRef} className="py-4 text-center text-xs text-gray-400">
            Chargement…
          </div>
        )}
      </div>
    </div>
  );
}

const COLORS = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#818cf8','#c084fc','#f472b6','#e879f9',
  '#ef4444','#f97316','#eab308','#84cc16','#10b981','#06b6d4','#6366f1','#a855f7','#ec4899','#d946ef'];

function TreemapCell({ x, y, width, height, name, value }: any) {
  if (width < 30 || height < 20) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        fill={COLORS[Math.abs((name || '').charCodeAt(0) + (name || '').length) % COLORS.length]} fillOpacity={0.85} stroke="#fff" strokeWidth={2} />
      {width > 50 && height > 30 && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#fff">{(name || '').slice(0, Math.floor(width / 7))}</text>
          <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.8)">{value?.toLocaleString('fr-FR')} €</text>
        </>
      )}
    </g>
  );
}

function CoutsTreemaps({ filtered, getCategorie }: { filtered: Achat[]; getCategorie: (a: Achat) => string }) {
  const [treemapCat, setTreemapCat] = useState<string | null>(null);

  const byProduit = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of filtered) {
      m.set(a.nom, (m.get(a.nom) || 0) + a.total);
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30);
  }, [filtered]);

  const byCategorie = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of filtered) {
      const cat = getCategorie(a);
      m.set(cat, (m.get(cat) || 0) + a.total);
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, getCategorie]);

  const byProduitCat = useMemo(() => {
    if (!treemapCat) return [];
    const m = new Map<string, number>();
    for (const a of filtered) {
      if (getCategorie(a) === treemapCat) {
        m.set(a.nom, (m.get(a.nom) || 0) + a.total);
      }
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, getCategorie, treemapCat]);

  if (filtered.length === 0) return null;

  const catData = treemapCat ? byProduitCat : byCategorie;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-yellow-100 p-5">
        <h2 className="font-semibold mb-3">Top produits</h2>
        <ResponsiveContainer width="100%" height={300}>
          <Treemap data={byProduit} dataKey="value" nameKey="name" content={<TreemapCell />} />
        </ResponsiveContainer>
      </div>
      <div className="bg-white rounded-xl border border-yellow-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          {treemapCat ? (
            <>
              <button onClick={() => setTreemapCat(null)} className="text-yellow-600 hover:underline text-sm">← Toutes les catégories</button>
              <h2 className="font-semibold">{treemapCat}</h2>
            </>
          ) : (
            <h2 className="font-semibold">Top catégories</h2>
          )}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <Treemap data={catData} dataKey="value" nameKey="name" content={<TreemapCell />}
            onClick={!treemapCat ? (node: any) => { if (node?.name) setTreemapCat(node.name); } : undefined} style={!treemapCat ? { cursor: 'pointer' } : undefined} />
        </ResponsiveContainer>
      </div>
    </div>
  );
}
