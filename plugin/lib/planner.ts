import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { Map as MLMap } from 'maplibre-gl';
import { groundSampler } from './terrain.ts';
import { COLORS, uasColor } from './constants.ts';
import { keysFor, manifest, tile } from './data.ts';
import {
    bearing, circle, corridor, destination, distanceM, inArea, makeArea, overlapsArea,
    FT_PER_M, M_PER_FT, type Area
} from './geo.ts';
import { airportName, obstacleDetail, ICON_HOME, ICON_TARGET, type AirAwareLayers, type ObstacleRow, type PlanHazardKind } from './layers.ts';
import { runtime } from './runtime.ts';
import { fmtDist, fmtH } from './units.ts';
import { state, type Detail, type PlanObstacle, type PlanResult, type PlanUasCell } from './store.ts';

type LL = [number, number];

/** Part 107 ceiling, ft AGL. */
export const PART_107_FT = 400;
/** Battery held back for the return and landing. */
const RESERVE = 0.2;
const GRID = 40;
const UAS_PER_DEG = 120;

export interface PlanGeometry {
    home: LL;
    target: LL;
    /** Where the aircraft holds, on the Home side of the target. */
    standoff: LL;
    /** Distance actually held from the target, m (shorter when Home is closer than the standoff). */
    standoffM: number;
    corridor: Polygon;
    orbit: Polygon;
    area: Area;
}

export function planGeometry(): PlanGeometry | undefined {
    const p = state.plan;
    if (!p.home || !p.target) return undefined;
    const s = state.settings;
    const home: LL = [p.home.lon, p.home.lat];
    const target: LL = [p.target.lon, p.target.lat];
    const dist = distanceM(home, target);
    const halfW = Math.max(25, s.corridorFt) * M_PER_FT;
    const wantM = Math.max(0, s.standoffFt) * M_PER_FT;
    const standoffM = Math.min(wantM, dist);
    const standoff: LL = standoffM > 0 ? destination(target, standoffM, bearing(target, home)) : target;
    const corridorPoly = corridor(home, standoff, halfW);
    const orbit = circle(target, wantM + halfW);
    return { home, target, standoff, standoffM, corridor: corridorPoly, orbit, area: makeArea([corridorPoly, orbit]) };
}

/** What the plan layer draws: range ring, flight area, track and the three points. */
export function planShape(): FeatureCollection {
    const p = state.plan;
    const features: Feature[] = [];
    if (!p.home) return { type: 'FeatureCollection', features };
    const home: LL = [p.home.lon, p.home.lat];
    features.push({
        type: 'Feature',
        geometry: circle(home, state.settings.radiusFt * M_PER_FT),
        properties: { color: COLORS.plan, ring: true }
    });
    const g = planGeometry();
    if (g) {
        features.push(
            { type: 'Feature', geometry: g.corridor, properties: { color: COLORS.plan } },
            { type: 'Feature', geometry: g.orbit, properties: { color: COLORS.target } },
            { type: 'Feature', geometry: { type: 'LineString', coordinates: [g.home, g.standoff] }, properties: { color: COLORS.plan } }
        );
        if (g.standoffM > 0) {
            features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: g.standoff }, properties: { color: COLORS.plan, radius: 5, label: 'Standoff' } });
        }
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: g.target }, properties: { icon: ICON_TARGET, label: 'Target' } });
    } else if (p.target) {
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.target.lon, p.target.lat] }, properties: { icon: ICON_TARGET, label: 'Target' } });
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: home }, properties: { icon: ICON_HOME, label: 'Home' } });
    return { type: 'FeatureCollection', features };
}

interface UasCellHit extends PlanUasCell {
    li: number;
    lo: number;
}

/** UAS Facility Map cells whose squares fall in a box. */
async function uasCellsIn(south: number, west: number, north: number, east: number): Promise<UasCellHit[]> {
    const m = await manifest('uasfm');
    const out = new Map<string, UasCellHit>();
    const size = 1 / UAS_PER_DEG;
    for (const k of keysFor(m, south, west, north, east)) {
        const t = await tile<{ airports: string[]; cells: Array<[number, number, number, number]> }>('uasfm', k, m);
        for (const [li, lo, ceiling, ai] of t.cells || []) {
            const lat = li / UAS_PER_DEG, lon = lo / UAS_PER_DEG;
            if (lat + size < south || lat > north || lon + size < west || lon > east) continue;
            out.set(`${li}_${lo}`, { li, lo, ceilingFt: ceiling, airport: airportName(t.airports?.[ai]) });
        }
    }
    return [...out.values()];
}

function cellFeature(c: UasCellHit): Feature {
    const size = 1 / UAS_PER_DEG;
    const lat = c.li / UAS_PER_DEG, lon = c.lo / UAS_PER_DEG;
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]] },
        properties: { kind: 'uasfm', ceiling: c.ceilingFt, airport: c.airport, color: uasColor(c.ceilingFt), label: String(c.ceilingFt), fillOpacity: 0.22 }
    };
}

export interface PointInfo {
    groundFt?: number;
    ceilingFt?: number;
    airport?: string;
    /** On the facility map at all; false means no LAANC grid here. */
    onGrid: boolean;
}

/** Ground elevation and UAS grid ceiling at one point, for the step summaries. */
export async function pointInfo(map: MLMap, lon: number, lat: number): Promise<PointInfo> {
    const d = 0.002;
    const [ground, cells] = await Promise.all([
        groundSampler(map, lat - d, lon - d, lat + d, lon + d).catch(() => ({ sampler: null })),
        uasCellsIn(lat, lon, lat, lon).catch(() => [] as UasCellHit[])
    ]);
    const li = Math.floor(lat * UAS_PER_DEG), lo = Math.floor(lon * UAS_PER_DEG);
    const cell = cells.find((c) => c.li === li && c.lo === lo);
    const g = ground.sampler ? ground.sampler.sample(lon, lat) : null;
    return { groundFt: g ?? undefined, ceilingFt: cell?.ceilingFt, airport: cell?.airport, onGrid: Boolean(cell) };
}

export interface PlanOutput {
    result: PlanResult;
    hazards: FeatureCollection;
    islands: FeatureCollection;
    bag: Map<string, Detail>;
}

const HAZARD_NAMES: Record<PlanHazardKind, string> = {
    tfr: 'TFRs',
    nsufr: 'UAS No-Fly areas',
    airspace: 'Airspace',
    sua: 'Special use airspace',
    notams: 'NOTAMs'
};

export async function computePlan(map: MLMap, layers: AirAwareLayers): Promise<PlanOutput | undefined> {
    const g = planGeometry();
    if (!g) return undefined;
    const s = state.settings;
    const p = state.plan;
    const [west, south, east, north] = g.area.bbox;
    const warnings: string[] = [];
    const bag = new Map<string, Detail>();
    const hazards: Feature[] = [];

    // Start the restriction loads while the terrain is read.
    const box = { s: south, w: west, n: north, e: east, zoom: 20, center: [(west + east) / 2, (south + north) / 2] as LL };
    const hazardJob = layers.loadForPlan(box, bag);

    // ---- terrain ----
    const { sampler, tried } = await groundSampler(map, south, west, north, east);
    const groundFt = (lon: number, lat: number): number | null => sampler ? sampler.sample(lon, lat) : null;
    const homeGround = groundFt(g.home[0], g.home[1]);
    const targetGround = groundFt(g.target[0], g.target[1]);
    const samples: Array<{ lon: number; lat: number; ft: number }> = [];
    let missing = 0;
    for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
            const lat = south + (north - south) * (i + 0.5) / GRID;
            const lon = west + (east - west) * (j + 0.5) / GRID;
            if (!inArea([lon, lat], g.area)) continue;
            const ft = groundFt(lon, lat);
            if (ft === null) {
                missing++;
                continue;
            }
            samples.push({ lon, lat, ft });
        }
    }
    const terrain = samples.length && homeGround !== null ? 'map' : 'none';
    if (terrain === 'none') {
        warnings.push(`No terrain data for this area (tried: ${tried.join('; ') || 'nothing'}). Ground clearance was not checked.`);
    } else if (missing) {
        warnings.push(`${missing} sample points had no terrain data and were left out.`);
    }
    // Everything below is relative to Home: what the drone's altimeter reads.
    const base = homeGround ?? 0;
    const rel = samples.map((q) => ({ ...q, rel: q.ft - base }));
    const rise = rel.length ? Math.max(0, ...rel.map((q) => q.rel)) : undefined;
    const drop = rel.length ? Math.min(0, ...rel.map((q) => q.rel)) : undefined;

    // ---- distances and timing ----
    const targetDistanceFt = distanceM(g.home, g.target) * FT_PER_M;
    const standoffDistanceFt = distanceM(g.home, g.standoff) * FT_PER_M;
    let maxReachM = 0;
    for (const poly of g.area.polygons) {
        for (const q of poly.coordinates[0]) maxReachM = Math.max(maxReachM, distanceM(g.home, [q[0], q[1]]));
    }
    const maxReachFt = maxReachM * FT_PER_M;
    if (maxReachFt > s.radiusFt) {
        warnings.push(`The flight area reaches ${fmtDist(maxReachFt)} from Home, past your ${fmtDist(s.radiusFt)} operating range.`);
    }

    // ---- UAS Facility Map across the area ----
    const cells: PlanUasCell[] = [];
    try {
        for (const c of await uasCellsIn(south, west, north, east)) {
            const f = cellFeature(c);
            if (!overlapsArea(f, g.area)) continue;
            cells.push({ ceilingFt: c.ceilingFt, airport: c.airport });
            hazards.push(f);
        }
    } catch {
        warnings.push('The UAS Facility Map could not be read for this area.');
    }
    cells.sort((a, b) => a.ceilingFt - b.ceilingFt);
    const lowestGrid = cells.length ? cells[0].ceilingFt : undefined;

    // ---- obstacles (before the altitude: a tall one can raise it) ----
    const obstacles: PlanObstacle[] = [];
    const obstacleRows: ObstacleRow[] = [];
    try {
        const m = await manifest('obstacles');
        const types = new Set(s.obstacleTypes);
        const seen = new Set<string>();
        for (const k of keysFor(m, south, west, north, east)) {
            const t = await tile<{ obstacles: ObstacleRow[] }>('obstacles', k, m);
            for (const o of t.obstacles || []) {
                const [oas, type, lat, lon, agl, amsl, lighting] = o;
                if (seen.has(oas)) continue;
                if (types.size && !types.has(type)) continue;
                if (!inArea([lon, lat], g.area)) continue;
                seen.add(oas);
                obstacleRows.push(o);
                obstacles.push({
                    oas, type, lat, lon, aglFt: agl, amslFt: amsl, lighting,
                    topAboveTakeoffFt: homeGround !== null ? amsl - homeGround : undefined,
                    distanceFt: distanceM(g.home, [lon, lat]) * FT_PER_M,
                    bearing: bearing(g.home, [lon, lat])
                });
            }
        }
    } catch {
        warnings.push('The obstacle file could not be read for this area.');
    }
    const tops = obstacles.map((o) => o.topAboveTakeoffFt).filter((t): t is number => t !== undefined);
    const obstacleNeedAgl = tops.length ? Math.ceil((Math.max(...tops) + s.separationFt) / 10) * 10 : undefined;

    // ---- altitude window ----
    // The legal ceiling is the lower of 400 ft and the lowest grid over the area. Where the ground
    // drops below Home, the same altimeter reading is that much higher above the ground.
    const capFt = Math.max(0, Math.min(PART_107_FT, lowestGrid ?? PART_107_FT));
    const maxAltitudeAgl = Math.max(0, Math.floor((capFt + (drop ?? 0)) / 10) * 10);
    const floorAgl = rise !== undefined ? Math.ceil((rise + s.heightAboveTerrainFt) / 10) * 10 : undefined;
    // Without a grid below 400 ft, clearing terrain and obstacles may take the plan above 400 ft,
    // and only that far. A published grid ceiling is never exceeded.
    const gridBinds = lowestGrid !== undefined && lowestGrid < PART_107_FT;
    const needs = [floorAgl, obstacleNeedAgl].filter((n): n is number => n !== undefined);
    const needAgl = needs.length ? Math.max(...needs) : undefined;
    const allowedMaxAgl = gridBinds ? maxAltitudeAgl : Math.max(maxAltitudeAgl, needAgl ?? 0);
    const raisedBy = !gridBinds && needAgl !== undefined && needAgl > maxAltitudeAgl
        ? (obstacleNeedAgl !== undefined && obstacleNeedAgl === needAgl ? 'obstacle' : 'terrain')
        : undefined;

    let altitudeAgl: number | undefined;
    let clamped = false;
    if (lowestGrid !== undefined && lowestGrid <= 0) {
        warnings.unshift('A UAS Facility Map grid of 0 overlaps the flight area: any flight there needs an FAA authorization.');
    } else if (p.mode === 'need') {
        altitudeAgl = Math.min(needAgl ?? maxAltitudeAgl, allowedMaxAgl);
    } else if (p.givenAltitudeAgl) {
        altitudeAgl = p.givenAltitudeAgl;
        if (altitudeAgl > allowedMaxAgl) {
            altitudeAgl = allowedMaxAgl;
            clamped = true;
        }
    } else {
        warnings.push('Enter your altitude above Home.');
    }

    if (altitudeAgl !== undefined && needAgl !== undefined && needAgl > allowedMaxAgl) {
        warnings.unshift(`Clearing terrain and obstacles needs ${fmtH(needAgl)}; the ${fmtH(lowestGrid)} grid caps you at ${fmtH(allowedMaxAgl)}.`);
    }

    // ---- terrain the altitude cannot clear ----
    const islands: Feature[] = [];
    let tooHighPct: number | undefined;
    if (terrain === 'map' && altitudeAgl !== undefined) {
        const workable = altitudeAgl - s.heightAboveTerrainFt;
        let high = 0;
        for (const q of rel) if (q.rel > workable) high++;
        tooHighPct = rel.length ? Math.round((high / rel.length) * 100) : undefined;
        if (high) {
            for (const q of rel) {
                islands.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
                    properties: { color: q.rel > workable ? COLORS.island : COLORS.mvfr }
                });
            }
        }
    }

    // ---- obstacles that reach the altitude ----
    let obstaclesAbove = 0;
    obstacleRows.forEach((o, i) => {
        const top = obstacles[i].topAboveTakeoffFt;
        const above = altitudeAgl !== undefined && top !== undefined && top + s.separationFt > altitudeAgl;
        if (above) obstaclesAbove++;
        hazards.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [o[3], o[2]] },
            properties: { aaid: layers.planDetail(bag, obstacleDetail(o)), color: above ? COLORS.island : COLORS.obstacle, label: `${o[4]}' AGL` }
        });
    });
    obstacles.sort((a, b) => a.distanceFt - b.distanceFt);

    // ---- restrictions touching the area ----
    const loaded = await hazardJob;
    const named: Record<PlanHazardKind, string[]> = { tfr: [], nsufr: [], airspace: [], sua: [], notams: [] };
    const fill: Record<PlanHazardKind, number> = { tfr: 0.25, nsufr: 0.25, airspace: 0.05, sua: 0.08, notams: 0.18 };
    for (const kind of Object.keys(named) as PlanHazardKind[]) {
        const list = loaded[kind];
        if (!list) {
            warnings.push(`${HAZARD_NAMES[kind]} could not be read: not checked.`);
            continue;
        }
        const names = new Set<string>();
        for (const f of list) {
            const pr = f.properties || {};
            // Class A starts at 18,000 ft MSL: never a drone's concern.
            if (kind === 'airspace' && pr.cls === 'A') continue;
            if (!overlapsArea(f, g.area)) continue;
            const label = String(pr.label || '').split('\n')[0];
            const name = String(pr.name || '');
            names.add(kind === 'airspace' ? (name ? `${name} (${label})` : label)
                : kind === 'notams' ? `NOTAM ${label}`.trim()
                    : name || label);
            hazards.push({ ...f, properties: { ...pr, fillOpacity: fill[kind] } });
        }
        named[kind] = [...names];
    }
    if (named.tfr.length) warnings.unshift(`${named.tfr.length} TFR${named.tfr.length > 1 ? 's' : ''} overlap the flight area.`);
    if (named.nsufr.length) warnings.unshift('A National Security UAS Flight Restriction overlaps the flight area.');

    // ---- mission timing ----
    let slantRangeFt: number | undefined;
    let gimbalDeg: number | undefined;
    if (altitudeAgl !== undefined) {
        const tRel = targetGround !== null && homeGround !== null ? targetGround - homeGround : 0;
        const standoffFt = g.standoffM * FT_PER_M;
        slantRangeFt = Math.sqrt(standoffFt ** 2 + (altitudeAgl - tRel) ** 2);
        // Camera depression from level to the target: 90 straight down when overhead.
        gimbalDeg = Math.round(Math.atan2(altitudeAgl - tRel, standoffFt) * 180 / Math.PI);
    }
    let transitMin: number | undefined;
    let onStationMin: number | undefined;
    if (s.cruiseMph > 0) {
        transitMin = (standoffDistanceFt / 5280) / s.cruiseMph * 60;
        if (s.enduranceMin > 0) {
            onStationMin = s.enduranceMin * (1 - RESERVE) - 2 * transitMin;
            if (onStationMin <= 0) warnings.push('The round trip uses all the usable battery: no time on station.');
        }
    }

    const result: PlanResult = {
        computedAt: new Date().toISOString(),
        terrain,
        terrainSource: sampler?.source,
        homeGroundFt: homeGround ?? undefined,
        targetRelFt: targetGround !== null && homeGround !== null ? targetGround - homeGround : undefined,
        riseFt: rise,
        dropFt: drop,
        samples: samples.length,
        targetDistanceFt,
        targetBearing: bearing(g.home, g.target),
        standoffDistanceFt,
        maxReachFt,
        slantRangeFt,
        gimbalDeg,
        transitMin,
        onStationMin,
        floorAgl,
        obstacleNeedAgl,
        maxAltitudeAgl,
        allowedMaxAgl,
        raisedBy,
        capFt,
        altitudeAgl,
        clamped,
        tooHighPct,
        uasCells: cells,
        uasCeilingUsedFt: lowestGrid,
        obstacles,
        obstaclesAbove,
        tfrs: named.tfr,
        nsufr: named.nsufr,
        airspace: named.airspace,
        sua: named.sua,
        notams: named.notams,
        warnings
    };

    return {
        result,
        hazards: { type: 'FeatureCollection', features: hazards },
        islands: { type: 'FeatureCollection', features: islands },
        bag
    };
}

/** Remove the plan: points, result and everything it drew. */
export function clearPlan(): void {
    state.plan.home = undefined;
    state.plan.target = undefined;
    state.plan.picking = false;
    state.plan.result = undefined;
    state.plan.computing = false;
    if (runtime.map) runtime.map.getCanvas().style.cursor = '';
    runtime.layers?.setPlanHazards({ type: 'FeatureCollection', features: [] });
    runtime.layers?.setIslands({ type: 'FeatureCollection', features: [] });
    runtime.layers?.setPlan(planShape());
}
