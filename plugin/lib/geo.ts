import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';

export const FT_PER_M = 3.28084;
export const M_PER_FT = 0.3048;
const EARTH_M = 6371008.8;

export function emptyCollection(): FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
}

export function rad(d: number): number {
    return d * Math.PI / 180;
}

export function deg(r: number): number {
    return r * 180 / Math.PI;
}

/** Great circle distance in metres. */
export function distanceM(a: [number, number], b: [number, number]): number {
    const dLat = rad(b[1] - a[1]);
    const dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing, degrees true, 0-360. */
export function bearing(a: [number, number], b: [number, number]): number {
    const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
    const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
    return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(from: [number, number], distM: number, brgDeg: number): [number, number] {
    const d = distM / EARTH_M;
    const b = rad(brgDeg);
    const lat1 = rad(from[1]);
    const lon1 = rad(from[0]);
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return [deg(lon2), deg(lat2)];
}

export function circle(center: [number, number], radiusM: number, steps = 64): Polygon {
    const ring: Position[] = [];
    for (let i = 0; i <= steps; i++) ring.push(destination(center, radiusM, (i / steps) * 360));
    return { type: 'Polygon', coordinates: [ring] };
}

/** Ray-casting point in ring test (lon/lat). */
export function inRing(pt: [number, number], ring: Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

export function inPolygon(pt: [number, number], rings: Position[][]): boolean {
    if (!rings.length || !inRing(pt, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) if (inRing(pt, rings[i])) return false;
    return true;
}

export function featureContains(f: Feature, pt: [number, number]): boolean {
    const g = f.geometry;
    if (!g) return false;
    if (g.type === 'Polygon') return inPolygon(pt, g.coordinates);
    if (g.type === 'MultiPolygon') return g.coordinates.some((p) => inPolygon(pt, p));
    return false;
}

/** Ensure a ring is closed. */
export function closeRing(ring: Position[]): Position[] {
    if (ring.length < 3) return ring;
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) return [...ring, [a[0], a[1]]];
    return ring;
}

/**
 * ArcGIS rings to a GeoJSON geometry. ArcGIS writes outer rings clockwise and holes
 * counter-clockwise, all in one flat list, so they are regrouped by orientation.
 */
export function esriRings(rings: number[][][]): Polygon | { type: 'MultiPolygon'; coordinates: Position[][][] } | null {
    const polys: Position[][][] = [];
    for (const raw of rings) {
        const ring = closeRing(raw.map((p) => [p[0], p[1]]));
        if (ring.length < 4) continue;
        let area = 0;
        for (let i = 0; i < ring.length - 1; i++) area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
        const clockwise = area > 0;
        if (clockwise || !polys.length) {
            polys.push([ring]);
        } else {
            polys[polys.length - 1].push(ring);
        }
    }
    if (!polys.length) return null;
    if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] };
    return { type: 'MultiPolygon', coordinates: polys };
}

export function fmtFt(ft: number | undefined): string {
    if (ft === undefined || !isFinite(ft)) return '—';
    return Math.round(ft).toLocaleString('en-US') + ' ft';
}

export function fmtDist(ft: number): string {
    if (ft < 1000) return Math.round(ft).toLocaleString('en-US') + ' ft';
    return (ft / 5280).toFixed(2).replace(/\.?0+$/, '') + ' mi';
}

/** Signed height relative to takeoff, e.g. "+120 ft" / "-40 ft". */
export function fmtRel(ft: number | undefined): string {
    if (ft === undefined || !isFinite(ft)) return '—';
    const r = Math.round(ft);
    return (r > 0 ? '+' : '') + r.toLocaleString('en-US') + ' ft';
}

export function fmtTime(iso: string | number | undefined): string {
    if (iso === undefined || iso === '' || iso === 0) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toISOString().replace('T', ' ').replace(/:\d\d\.\d+Z$/, 'Z');
}

export function compass(b: number): string {
    const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return names[Math.round(b / 22.5) % 16];
}
