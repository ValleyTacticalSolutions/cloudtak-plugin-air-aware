import type { Feature, FeatureCollection, Position } from 'geojson';
import type { Map as MLMap } from 'maplibre-gl';
import { groundSampler } from './terrain.ts';
import { COLORS } from './constants.ts';
import { keysFor, manifest, tile } from './data.ts';
import { bearing, circle, distanceM, featureContains, FT_PER_M, M_PER_FT } from './geo.ts';
import type { AirAwareLayers } from './layers.ts';
import { state, type PlanObstacle, type PlanResult } from './store.ts';

type ObstacleRow = [string, string, number, number, number, number, string, string, number, string, string];

const GRID = 25;

export function planShape(): FeatureCollection {
    const p = state.plan;
    if (!p.launch) return { type: 'FeatureCollection', features: [] };
    const c: [number, number] = [p.launch.lon, p.launch.lat];
    return {
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', geometry: circle(c, state.settings.radiusFt * M_PER_FT), properties: { color: COLORS.plan } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { color: COLORS.plan } }
        ]
    };
}

function touches(f: Feature, center: [number, number], ring: Position[]): boolean {
    if (featureContains(f, center)) return true;
    for (let i = 0; i < ring.length; i += 4) {
        if (featureContains(f, [ring[i][0], ring[i][1]])) return true;
    }
    return false;
}

export async function computePlan(map: MLMap, layers: AirAwareLayers): Promise<PlanResult | undefined> {
    const p = state.plan;
    if (!p.launch) return undefined;
    const s = state.settings;
    const center: [number, number] = [p.launch.lon, p.launch.lat];
    const radiusM = s.radiusFt * M_PER_FT;
    const shape = circle(center, radiusM);
    const ring = shape.coordinates[0];
    const warnings: string[] = [];

    // ---- terrain ----
    const lats = ring.map((q) => q[1]);
    const lons = ring.map((q) => q[0]);
    const south = Math.min(...lats), north = Math.max(...lats);
    const west = Math.min(...lons), east = Math.max(...lons);

    const { sampler, tried } = await groundSampler(map, south, west, north, east);
    const groundFt = (lon: number, lat: number): number | null => sampler ? sampler.sample(lon, lat) : null;
    const launchGround = groundFt(center[0], center[1]);
    const samples: Array<{ lon: number; lat: number; ft: number }> = [];
    let missing = 0;
    for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
            const lat = south + (north - south) * (i + 0.5) / GRID;
            const lon = west + (east - west) * (j + 0.5) / GRID;
            if (distanceM(center, [lon, lat]) > radiusM) continue;
            const ft = groundFt(lon, lat);
            if (ft === null) {
                missing++;
                continue;
            }
            samples.push({ lon, lat, ft });
        }
    }
    const terrain = samples.length && launchGround !== null ? 'map' : 'none';
    if (terrain === 'none') {
        warnings.push(`No terrain data for this area (tried: ${tried.join('; ') || 'nothing'}). Nothing was computed from data that is not there.`);
    } else if (missing) {
        warnings.push(`${missing} sample points had no terrain data and were left out.`);
    }

    // Everything below is relative to the takeoff point: what the drone's altimeter reads.
    const base = launchGround ?? 0;
    const rel = samples.map((q) => ({ ...q, rel: q.ft - base }));
    const rise = rel.length ? Math.max(...rel.map((q) => q.rel)) : undefined;
    const drop = rel.length ? Math.min(...rel.map((q) => q.rel)) : undefined;

    const result: PlanResult = {
        computedAt: new Date().toISOString(),
        terrain,
        terrainSource: sampler?.source,
        launchGroundFt: launchGround ?? undefined,
        riseFt: rise,
        dropFt: drop,
        samples: samples.length,
        obstacles: [],
        obstaclesAbove: 0,
        tfrs: [],
        nsufr: [],
        airspace: [],
        warnings
    };

    const islands: Feature[] = [];
    if (terrain === 'map' && p.mode === 'need' && rise !== undefined) {
        // Highest ground in the area plus the height you hold over it, rounded up to 10 ft.
        result.altitudeAgl = Math.ceil((Math.max(0, rise) + s.heightAboveTerrainFt) / 10) * 10;
    } else if (p.mode === 'given' && p.givenAltitudeAgl) {
        result.altitudeAgl = p.givenAltitudeAgl;
        if (terrain === 'map') {
            const workable = p.givenAltitudeAgl - s.heightAboveTerrainFt;
            result.workableRiseFt = workable;
            let high = 0;
            for (const q of rel) {
                const over = q.rel > workable;
                if (over) high++;
                islands.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
                    properties: { color: over ? COLORS.island : COLORS.mvfr }
                });
            }
            result.tooHighPct = rel.length ? Math.round((high / rel.length) * 100) : undefined;
        }
    } else if (p.mode === 'given') {
        warnings.push('Enter your max altitude (ft AGL above takeoff).');
    }
    layers.setIslands({ type: 'FeatureCollection', features: islands });

    // ---- UAS facility map at the launch point ----
    try {
        const m = await manifest('uasfm');
        for (const k of keysFor(m, center[1], center[0], center[1], center[0])) {
            const t = await tile<{ airports: string[]; cells: Array<[number, number, number, number]> }>('uasfm', k, m);
            const li = Math.floor(center[1] * 120), lo = Math.floor(center[0] * 120);
            const cell = (t.cells || []).find((c) => c[0] === li && c[1] === lo);
            if (cell) {
                result.uasCeilingFt = cell[2];
                const ap = (t.airports || [])[cell[3]] || '';
                const [id, name] = ap.split('|');
                result.uasAirport = name ? `${id} ${name}` : id;
            }
        }
    } catch {
        warnings.push('The UAS Facility Map could not be read for the launch point.');
    }

    // ---- obstacles ----
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
                const d = distanceM(center, [lon, lat]);
                if (d > radiusM) continue;
                seen.add(oas);
                const po: PlanObstacle = {
                    oas, type, lat, lon, aglFt: agl, amslFt: amsl, lighting,
                    topAboveTakeoffFt: launchGround !== null ? amsl - launchGround : undefined,
                    distanceFt: d * FT_PER_M,
                    bearing: bearing(center, [lon, lat])
                };
                result.obstacles.push(po);
            }
        }
        result.obstacles.sort((a, b) => a.distanceFt - b.distanceFt);
        const alt = result.altitudeAgl;
        if (alt !== undefined) {
            result.obstaclesAbove = result.obstacles.filter((o) => o.topAboveTakeoffFt !== undefined && o.topAboveTakeoffFt + s.separationFt > alt).length;
        }
    } catch {
        warnings.push('The obstacle file could not be read for this area.');
    }

    // ---- altitude limits, in drone terms ----
    const alt = result.altitudeAgl;
    if (alt !== undefined) {
        if (alt > 400) warnings.unshift(`${alt} ft AGL is above the Part 107 limit of 400 ft AGL (higher is allowed only within 400 ft of a structure).`);
        if (result.uasCeilingFt !== undefined && alt > result.uasCeilingFt) {
            warnings.unshift(result.uasCeilingFt <= 0
                ? 'The UAS Facility Map grid at takeoff is 0 ft: any flight here needs an FAA authorization.'
                : `${alt} ft AGL is above the UAS Facility Map ceiling of ${result.uasCeilingFt} ft at takeoff: needs an FAA authorization for that altitude.`);
        }
    }

    // ---- restrictions touching the plan ----
    const L = s.layers;
    if (L.tfr) {
        result.tfrs = [...new Set(layers.tfrFeatures.filter((f) => touches(f, center, ring)).map((f) => String(f.properties?.name || 'TFR')))];
    } else {
        warnings.push('TFR layer is off: TFRs were not checked.');
    }
    if (L.nsufr) {
        result.nsufr = [...new Set(layers.nsufrFeatures.filter((f) => touches(f, center, ring)).map((f) => String(f.properties?.name || 'NSUFR')))];
    } else {
        warnings.push('UAS No-Fly layer is off: national security restrictions were not checked.');
    }
    if (L.airspace) {
        result.airspace = [...new Set(layers.airspaceFeatures.filter((f) => featureContains(f, center)).map((f) => String(f.properties?.label || '').split('\n')[0]))];
    }

    return result;
}
