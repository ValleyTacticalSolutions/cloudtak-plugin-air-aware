import type { Feature, FeatureCollection, Position } from 'geojson';
import type { Map as MLMap } from 'maplibre-gl';
import { COLORS } from './constants.ts';
import { keysFor, manifest, tile } from './data.ts';
import { bearing, circle, distanceM, featureContains, FT_PER_M, fmtFt, M_PER_FT } from './geo.ts';
import type { AirAwareLayers } from './layers.ts';
import { state, type PlanObstacle, type PlanResult } from './store.ts';

type ObstacleRow = [string, string, number, number, number, number, string, string, number, string, string];

const GRID = 25;

function groundFt(map: MLMap, lon: number, lat: number): number | null {
    try {
        const raw = map.queryTerrainElevation([lon, lat]);
        if (raw === null || raw === undefined || !isFinite(raw)) return null;
        const ex = map.getTerrain()?.exaggeration || 1;
        return (raw / ex) * FT_PER_M;
    } catch {
        return null;
    }
}

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

    const launchGround = groundFt(map, center[0], center[1]);
    const samples: Array<{ lon: number; lat: number; ft: number }> = [];
    let missing = 0;
    for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
            const lat = south + (north - south) * (i + 0.5) / GRID;
            const lon = west + (east - west) * (j + 0.5) / GRID;
            if (distanceM(center, [lon, lat]) > radiusM) continue;
            const ft = groundFt(map, lon, lat);
            if (ft === null) {
                missing++;
                continue;
            }
            samples.push({ lon, lat, ft });
        }
    }
    const terrain = samples.length && launchGround !== null ? 'map' : 'none';
    if (terrain === 'none') {
        warnings.push('No terrain data: turn on a terrain overlay in CloudTAK (Overlays → Terrain) and keep the plan area on screen. Nothing was computed from data that is not there.');
    } else if (missing) {
        warnings.push(`${missing} sample points had no terrain loaded and were left out. Keep the whole circle on screen for a complete read.`);
    }

    const maxGround = samples.length ? Math.max(...samples.map((q) => q.ft)) : undefined;
    const minGround = samples.length ? Math.min(...samples.map((q) => q.ft)) : undefined;

    const result: PlanResult = {
        computedAt: new Date().toISOString(),
        terrain,
        launchGroundFt: launchGround ?? undefined,
        maxGroundFt: maxGround,
        minGroundFt: minGround,
        samples: samples.length,
        obstacles: [],
        obstaclesAbove: 0,
        tfrs: [],
        nsufr: [],
        airspace: [],
        warnings
    };

    let ceilingMsl: number | undefined;
    const islands: Feature[] = [];
    if (p.mode === 'need' && maxGround !== undefined) {
        result.needCeilingMsl = Math.ceil((maxGround + s.heightAboveTerrainFt) / 100) * 100;
        if (launchGround !== null) result.needCeilingAboveLaunch = result.needCeilingMsl - launchGround;
        ceilingMsl = result.needCeilingMsl;
    } else if (p.mode === 'given' && p.givenCeilingMsl) {
        ceilingMsl = p.givenCeilingMsl;
        const workable = p.givenCeilingMsl - s.heightAboveTerrainFt;
        result.givenWorkableGroundFt = workable;
        if (samples.length) {
            let high = 0;
            for (const q of samples) {
                const over = q.ft > workable;
                if (over) high++;
                islands.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
                    properties: { color: over ? COLORS.island : COLORS.mvfr }
                });
            }
            result.givenTooHighPct = Math.round((high / samples.length) * 100);
        }
    } else if (p.mode === 'given') {
        warnings.push('Type the ceiling you were given (ft MSL).');
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
                    distanceFt: d * FT_PER_M,
                    bearing: bearing(center, [lon, lat])
                };
                result.obstacles.push(po);
            }
        }
        result.obstacles.sort((a, b) => a.distanceFt - b.distanceFt);
        if (ceilingMsl !== undefined) {
            result.obstaclesAbove = result.obstacles.filter((o) => o.amslFt + s.separationFt > ceilingMsl).length;
        }
    } catch {
        warnings.push('The obstacle file could not be read for this area.');
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

/** What Flight Service will ask for, ready to read out or paste. Nothing is sent. */
export function flightServiceText(r: PlanResult | undefined): string {
    const p = state.plan;
    const s = state.settings;
    if (!p.launch) return '';
    const lat = p.launch.lat, lon = p.launch.lon;
    const dms = (v: number, pos: string, neg: string): string => {
        const a = Math.abs(v);
        const d = Math.floor(a);
        const m = Math.floor((a - d) * 60);
        const sec = Math.round(((a - d) * 60 - m) * 60);
        return `${d}°${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}"${v >= 0 ? pos : neg}`;
    };
    const ceiling = p.mode === 'given' ? p.givenCeilingMsl : r?.needCeilingMsl;
    const lines = [
        'UAS OPERATION',
        `Launch point: ${lat.toFixed(5)}, ${lon.toFixed(5)} (${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')})`,
        `Area: ${(s.radiusFt / 6076.12).toFixed(2)} NM radius (${Math.round(s.radiusFt).toLocaleString('en-US')} ft) around the launch point`,
        `Ceiling: ${ceiling ? fmtFt(ceiling) + ' MSL' : '—'}` + (r?.needCeilingAboveLaunch && p.mode === 'need' ? ` (${fmtFt(r.needCeilingAboveLaunch)} above launch)` : ''),
        `Ground elevation at launch: ${fmtFt(r?.launchGroundFt)} MSL`,
        'Time: ____ to ____ local',
        'Operator / contact: ____'
    ];
    return lines.join('\n');
}
