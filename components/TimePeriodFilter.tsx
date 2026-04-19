'use client';

import { useState, useMemo } from 'react';

// Numéro ISO de semaine — retourne YYYY-Www
export function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type TimePeriod = {
  label: string;
  dateDebut: string;  // YYYY-MM-DD
  dateFin: string;    // YYYY-MM-DD
  // Pour la multi-sélection de mois : liste de plages
  ranges?: { dateDebut: string; dateFin: string }[];
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfYear(year?: number): string {
  return `${year || new Date().getFullYear()}-01-01`;
}

function endOfYear(year?: number): string {
  return `${year || new Date().getFullYear()}-12-31`;
}

function endOfMonth(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
}

const MOIS_NOMS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

interface TimePeriodFilterProps {
  availableDates: string[];
  value: TimePeriod | null;
  onChange: (period: TimePeriod | null) => void;
}

export default function TimePeriodFilter({ availableDates, value, onChange }: TimePeriodFilterProps) {
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  // Mois sélectionnés pour le mode multi : "2025-01", "2025-03", etc.
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const d of availableDates) {
      const y = parseInt(d.slice(0, 4));
      if (!isNaN(y)) years.add(y);
    }
    return Array.from(years).sort().reverse();
  }, [availableDates]);

  const availableMonths = useMemo(() => {
    if (!expandedYear) return new Set<number>();
    const months = new Set<number>();
    for (const d of availableDates) {
      if (d.startsWith(`${expandedYear}-`)) {
        const m = parseInt(d.slice(5, 7));
        if (!isNaN(m)) months.add(m);
      }
    }
    return months;
  }, [availableDates, expandedYear]);

  const isActive = (label: string) => value?.label === label;

  const quickSelect = (label: string, dateDebut: string, dateFin: string) => {
    setSelectedMonths(new Set());
    if (value?.label === label) {
      onChange(null);
    } else {
      onChange({ label, dateDebut, dateFin });
    }
  };

  const selectYear = (year: number) => {
    setSelectedMonths(new Set());
    if (expandedYear === year) {
      setExpandedYear(null);
    } else {
      setExpandedYear(year);
      onChange({ label: `${year}`, dateDebut: startOfYear(year), dateFin: endOfYear(year) });
    }
  };

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const newSet = new Set(selectedMonths);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedMonths(newSet);

    if (newSet.size === 0) {
      // Plus aucun mois sélectionné → sélectionner l'année entière
      onChange({ label: `${year}`, dateDebut: startOfYear(year), dateFin: endOfYear(year) });
      return;
    }

    // Construire les ranges à partir des mois sélectionnés
    const sorted = Array.from(newSet).sort();
    const ranges = sorted.map(k => {
      const [y, m] = k.split('-').map(Number);
      return { dateDebut: `${k}-01`, dateFin: endOfMonth(y, m) };
    });
    const label = sorted.map(k => {
      const [y, m] = k.split('-').map(Number);
      return `${MOIS_NOMS[m - 1]} ${y}`;
    }).join(' + ');

    onChange({
      label,
      dateDebut: ranges[0].dateDebut,
      dateFin: ranges[ranges.length - 1].dateFin,
      ranges,
    });
  };

  const hier = yesterday();

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <PillButton active={isActive('Hier')} onClick={() => quickSelect('Hier', hier, hier)}>
          Hier
        </PillButton>
        <PillButton active={isActive('Cette semaine')} onClick={() => quickSelect('Cette semaine', startOfWeek(), today())}>
          Cette semaine
        </PillButton>
        <PillButton active={isActive('Ce mois')} onClick={() => quickSelect('Ce mois', startOfMonth(), today())}>
          Ce mois
        </PillButton>
        {availableYears.map(year => (
          <PillButton key={year} active={isActive(`${year}`) || expandedYear === year}
            onClick={() => selectYear(year)}>
            {year}
          </PillButton>
        ))}

        {value && (
          <>
            <span className="w-px bg-gray-200 mx-1" />
            <button onClick={() => { onChange(null); setExpandedYear(null); setSelectedMonths(new Set()); }}
              className="px-3 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-400 hover:text-gray-600">
              Tout
            </button>
          </>
        )}
      </div>

      {expandedYear && (
        <div className="flex gap-1.5 flex-wrap pl-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
            const hasData = availableMonths.has(month);
            const key = `${expandedYear}-${String(month).padStart(2, '0')}`;
            const isSelected = selectedMonths.has(key);
            return (
              <button key={month} onClick={() => hasData && toggleMonth(expandedYear, month)}
                disabled={!hasData}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                  ${isSelected ? 'bg-yellow-400 border-yellow-400 text-black' : hasData ? 'border-gray-200 text-gray-500 hover:border-yellow-300' : 'border-gray-100 text-gray-300 cursor-not-allowed'}`}>
                {MOIS_NOMS[month - 1]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
        ${active ? 'bg-yellow-400 border-yellow-400 text-black' : 'border-yellow-200 text-gray-500 hover:border-yellow-300'}`}>
      {children}
    </button>
  );
}

/** Helper : filtre une date par la période sélectionnée (supporte multi-ranges) */
export function isInPeriod(dateStr: string, period: TimePeriod | null): boolean {
  if (!period) return true;
  const d = dateStr.length === 7 ? dateStr + '-01' : dateStr.slice(0, 10);
  // Si multi-ranges, vérifier chaque plage
  if (period.ranges && period.ranges.length > 0) {
    return period.ranges.some(r => d >= r.dateDebut && d <= r.dateFin);
  }
  return d >= period.dateDebut && d <= period.dateFin;
}
