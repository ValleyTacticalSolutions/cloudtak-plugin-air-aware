import { state } from './store.ts';
import { M_PER_FT } from './geo.ts';

/**
 * Display units. Everything is computed and stored in feet and mph; these turn it into
 * what the user reads and back. Published records (TFR and airspace limits, obstacle
 * heights in the details pane) stay in the feet they were published in.
 */

export type Units = 'imperial' | 'metric';

const FT_PER_MI = 5280;
const KMH_PER_MPH = 1.609344;

export function metric(): boolean {
    return state.settings.units === 'metric';
}

const n0 = (v: number): string => Math.round(v).toLocaleString('en-US');
const n2 = (v: number): string => v.toFixed(2).replace(/\.?0+$/, '');

/** Short unit for heights: "ft" or "m". */
export function hUnit(): string {
    return metric() ? 'm' : 'ft';
}

/** A height in feet as a display number. */
export function toH(ft: number): number {
    return metric() ? ft * M_PER_FT : ft;
}

/** A display height back to feet. */
export function fromH(v: number): number {
    return metric() ? v / M_PER_FT : v;
}

/** "200 ft" or "61 m". */
export function fmtH(ft: number | undefined): string {
    if (ft === undefined || !isFinite(ft)) return '—';
    return `${n0(toH(ft))} ${hUnit()}`;
}

/** Signed height relative to Home: "+120 ft" / "-12 m". */
export function fmtRel(ft: number | undefined): string {
    if (ft === undefined || !isFinite(ft)) return '—';
    const r = Math.round(toH(ft));
    return `${r > 0 ? '+' : ''}${r.toLocaleString('en-US')} ${hUnit()}`;
}

/** Distance: feet under 1,000 ft, else "0.62 mi / 3,274 ft". Metric: "850 m" or "1.23 km / 1,230 m". */
export function fmtDist(ft: number): string {
    if (metric()) {
        const m = ft * M_PER_FT;
        return m < 1000 ? `${n0(m)} m` : `${n2(m / 1000)} km / ${n0(m)} m`;
    }
    return ft < 1000 ? `${n0(ft)} ft` : `${n2(ft / FT_PER_MI)} mi / ${n0(ft)} ft`;
}

/** Long-distance unit: "mi" or "km". */
export function dUnit(): string {
    return metric() ? 'km' : 'mi';
}

/** Feet as miles or km. */
export function toD(ft: number): number {
    return metric() ? ft * M_PER_FT / 1000 : ft / FT_PER_MI;
}

export function fromD(v: number): number {
    return metric() ? v * 1000 / M_PER_FT : v * FT_PER_MI;
}

export function sUnit(): string {
    return metric() ? 'km/h' : 'mph';
}

export function toS(mph: number): number {
    return metric() ? mph * KMH_PER_MPH : mph;
}

export function fromS(v: number): number {
    return metric() ? v / KMH_PER_MPH : v;
}
