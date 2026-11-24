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

/** Great circle distance in meters. */
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

/**
 * A stadium: every point within halfWidthM of the segment a-b (round caps).
 * When a and b coincide it is a circle.
 */
export function corridor(a: [number, number], b: [number, number], halfWidthM: number, capSteps = 24): Polygon {
    if (distanceM(a, b) < 1) return circle(a, halfWidthM, capSteps * 2);
    const brg = bearing(a, b);
    const back = bearing(b, a);
    const ring: Position[] = [];
    // Around b from left of track to right of track, through the far end.
    for (let i = 0; i <= capSteps; i++) ring.push(destination(b, halfWidthM, back + 90 + (i / capSteps) * 180));
    // Around a from right of track back to left, through the near end.
    for (let i = 0; i <= capSteps; i++) ring.push(destination(a, halfWidthM, brg + 90 + (i / capSteps) * 180));
    ring.push([ring[0][0], ring[0][1]]);
    return { type: 'Polygon', coordinates: [ring] };
}

export type BBox = [number, number, number, number];

/** [west, south, east, north] of any geometry's coordinates. */
export function bboxOf(rings: Position[][]): BBox {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const r of rings) {
        for (const p of r) {
            if (p[0] < w) w = p[0];
            if (p[0] > e) e = p[0];
            if (p[1] < s) s = p[1];
            if (p[1] > n) n = p[1];
        }
    }
    return [w, s, e, n];
}

function bboxHit(a: BBox, b: BBox): boolean {
    return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

function orient(a: Position, b: Position, c: Position): number {
    const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Proper or touching intersection of segments p1-p2 and p3-p4. */
export function segmentsIntersect(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
    const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
    const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    const on = (a: Position, b: Position, c: Position): boolean =>
        Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
    if (o1 === 0 && on(p1, p2, p3)) return true;
    if (o2 === 0 && on(p1, p2, p4)) return true;
    if (o3 === 0 && on(p3, p4, p1)) return true;
    if (o4 === 0 && on(p3, p4, p2)) return true;
    return false;
}

/** A flight area: one or more polygons, with their combined bounding box. */
export interface Area {
    polygons: Polygon[];
    bbox: BBox;
}

export function makeArea(polygons: Polygon[]): Area {
    return { polygons, bbox: bboxOf(polygons.flatMap((p) => p.coordinates)) };
}

export function inArea(pt: [number, number], area: Area): boolean {
    if (pt[0] < area.bbox[0] || pt[0] > area.bbox[2] || pt[1] < area.bbox[1] || pt[1] > area.bbox[3]) return false;
    return area.polygons.some((p) => inPolygon(pt, p.coordinates));
}

function polygonsOf(f: Feature): Position[][][] {
    const g = f.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    return [];
}

/** Does a point or polygon feature touch the flight area? */
export function overlapsArea(f: Feature, area: Area): boolean {
    const g = f.geometry;
    if (!g) return false;
    if (g.type === 'Point') return inArea([g.coordinates[0], g.coordinates[1]], area);
    const polys = polygonsOf(f);
    if (!polys.length) return false;
    if (!bboxHit(bboxOf(polys.flat()), area.bbox)) return false;
    for (const poly of polys) {
        const outer = poly[0];
        // A feature corner inside the area.
        for (const p of outer) if (inArea([p[0], p[1]], area)) return true;
        for (const ap of area.polygons) {
            const ring = ap.coordinates[0];
            // An area corner inside the feature (also covers the area sitting wholly inside it).
            for (const p of ring) if (inPolygon([p[0], p[1]], poly)) return true;
            // Edges crossing.
            for (let i = 0; i < outer.length - 1; i++) {
                for (let j = 0; j < ring.length - 1; j++) {
                    if (segmentsIntersect(outer[i], outer[i + 1], ring[j], ring[j + 1])) return true;
                }
            }
        }
    }
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
