import { useState } from 'react';
import { num } from '../lib/utils';

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));

/** Vertical bar chart. data: [{ label, value }] */
export function BarChart({ data, height = 220, color = 'var(--color-brand-600)', format = num }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const W = 600;
  const H = height;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / data.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart">
        {ticks.map((t) => {
          const y = pad.t + ih - t * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#e2e8f0" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">{compact(top * t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / top) * ih;
          const x = pad.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
              <rect x={x} y={pad.t + ih - h} width={w} height={Math.max(h, 0)} rx="4" fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
              <text x={x + w / 2} y={H - 9} textAnchor="middle" fontSize="11" fill="#475569">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          <div className="font-semibold">{data[hover].label}</div>
          <div className="tabular-nums">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars — good for long category names. data: [{ label, value, color? }] */
export function HBarChart({ data, format = num, color = 'var(--color-brand-600)' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-600">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: d.color || color }} />
          </span>
          <span className="w-20 text-right font-semibold text-slate-800 tabular-nums">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Donut chart with legend. data: [{ label, value, color }] */
export function Donut({ data, size = 160, center, format = num }) {
  const total = data.reduce((t, d) => t + d.value, 0) || 1;
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label="Donut chart" className="shrink-0">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#f1f5f9" strokeWidth="22" />
        {data.map((d) => {
          const len = (d.value / total) * c;
          const el = (
            <circle key={d.label} cx="80" cy="80" r={r} fill="none" stroke={d.color} strokeWidth="22"
              strokeDasharray={`${Math.max(len - 1.5, 0)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />
          );
          offset += len;
          return el;
        })}
        {center && (
          <>
            <text x="80" y="78" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0f172a">{center.value}</text>
            <text x="80" y="96" textAnchor="middle" fontSize="10" fill="#64748b">{center.label}</text>
          </>
        )}
      </svg>
      <ul className="min-w-36 flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-600"><span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.label}</span>
            <span className="font-semibold text-slate-800 tabular-nums">{format(d.value)} <span className="font-normal text-slate-400">({Math.round((d.value / total) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Progress({ value, max, tone = 'bg-brand-600' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
