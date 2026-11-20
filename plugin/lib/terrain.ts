/**
 * Ground elevation for the planner, read straight from CloudTAK's terrain (raster-dem)
 * tiles so it works whether or not 3D terrain is switched on in the map.
 *
 * Where the DEM comes from, first that works:
 *   1. a raster-dem source already on the map (the terrain overlay the user has loaded)
 *   2. the server's Default Terrain basemap (config `map::terrain`), via its TileJSON
 *   3. MapLibre's own terrain, when 3D terrain is on (queryTerrainElevation)
 */
import type { Map as MLMap, RasterDEMTileSource } from 'maplibre-gl';
import { std, stdurl, getRuntimeToken } from '../../../src/std.ts';
import { FT_PER_M } from './geo.ts';

type Encoding = 'terrarium' | 'mapbox';

export interface DemSource {
    label: string;
    tiles: string[];
    encoding: Encoding;
    maxzoom: number;
    tileSize: number;
}

interface TileJSONish {
    tiles?: string[];
    maxzoom?: number;
    encoding?: string;
    tileSize?: number;
}

const MAX_ZOOM = 12;
const MAX_TILES = 36;

const tileCache = new Map<string, Promise<ImageData | null>>();

function encodingOf(v: unknown): Encoding {
    return String(v || '').toLowerCase() === 'terrarium' ? 'terrarium' : 'mapbox';
}

/** The raster-dem sources the map already has, in style order. */
function mapSources(map: MLMap): DemSource[] {
    const out: DemSource[] = [];
    let style;
    try {
        style = map.getStyle();
    } catch {
        return out;
    }
    for (const [id, spec] of Object.entries(style?.sources || {})) {
        if (spec.type !== 'raster-dem') continue;
        const src = map.getSource(id) as RasterDEMTileSource | undefined;
        const tiles = (src && Array.isArray(src.tiles) ? src.tiles : undefined) || (Array.isArray(spec.tiles) ? spec.tiles : undefined);
        if (!tiles || !tiles.length) continue;
        out.push({
            label: `map terrain source ${id}`,
            tiles,
            encoding: encodingOf((src as unknown as { encoding?: string })?.encoding ?? spec.encoding),
            maxzoom: Number(src?.maxzoom ?? spec.maxzoom ?? MAX_ZOOM),
            tileSize: Number(src?.tileSize ?? spec.tileSize ?? 256)
        });
    }
    // The one the map is drawing 3D terrain from goes first.
    const active = map.getTerrain()?.source;
    if (active) out.sort((a, b) => Number(b.label.endsWith(` ${active}`)) - Number(a.label.endsWith(` ${active}`)));
    return out;
}

let defaultSource: Promise<DemSource | null> | undefined;

/** The server's Default Terrain basemap, set by an admin (e.g. by Terrain Data Downloader). */
function serverDefault(): Promise<DemSource | null> {
    if (!defaultSource) {
        defaultSource = (async (): Promise<DemSource | null> => {
            const cfg = await std('/api/config?keys=map::terrain') as Record<string, unknown>;
            const id = Number(cfg['map::terrain']);
            if (!id || id < 1) return null;
            const token = await getRuntimeToken();
            const q = token ? `?token=${encodeURIComponent(token)}` : '';
            const tj = await std(`/api/basemap/${id}/tiles${q}`) as TileJSONish;
            const tiles = Array.isArray(tj.tiles) && tj.tiles.length ? tj.tiles : [`/api/basemap/${id}/tiles/{z}/{x}/{y}`];
            return {
                label: `default terrain basemap ${id}`,
                tiles,
                encoding: encodingOf(tj.encoding),
                maxzoom: Number(tj.maxzoom ?? MAX_ZOOM),
                tileSize: Number(tj.tileSize ?? 256)
            };
        })().catch(() => {
            defaultSource = undefined;
            return null;
        });
    }
    return defaultSource;
}

function tileUrl(src: DemSource, z: number, x: number, y: number): string {
    const tpl = src.tiles[(x + y) % src.tiles.length];
    return tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

async function fetchTile(url: string): Promise<ImageData | null> {
    let blob: Blob;
    const abs = stdurl(url);
    if (abs.origin === stdurl('/').origin) {
        // CloudTAK's own API: std adds the session token.
        const res = await std(abs) as Response;
        if (!(res instanceof Response)) return null;
        blob = await res.blob();
    } else {
        // A separate tile host: the URL already carries its token, as MapLibre uses it.
        const res = await fetch(abs);
        if (!res.ok) return null;
        blob = await res.blob();
    }
    if (!blob.size) return null;
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function tile(src: DemSource, z: number, x: number, y: number): Promise<ImageData | null> {
    const url = tileUrl(src, z, x, y);
    const key = `${src.label}|${z}/${x}/${y}`;
    let p = tileCache.get(key);
    if (!p) {
        p = fetchTile(url).catch(() => null);
        tileCache.set(key, p);
        if (tileCache.size > 256) {
            const oldest = tileCache.keys().next();
            if (!oldest.done) tileCache.delete(oldest.value);
        }
    }
    return p;
}

function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number; fx: number; fy: number } {
    const n = 2 ** z;
    const x = (lon + 180) / 360 * n;
    const r = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    return { x: Math.floor(x), y: Math.floor(y), fx: x - Math.floor(x), fy: y - Math.floor(y) };
}

function decode(img: ImageData, fx: number, fy: number, encoding: Encoding): number | null {
    const px = Math.min(img.width - 1, Math.max(0, Math.floor(fx * img.width)));
    const py = Math.min(img.height - 1, Math.max(0, Math.floor(fy * img.height)));
    const i = (py * img.width + px) * 4;
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2], a = img.data[i + 3];
    if (a === 0) return null;
    const m = encoding === 'terrarium'
        ? (r * 256 + g + b / 256) - 32768
        : -10000 + (r * 65536 + g * 256 + b) * 0.1;
    if (!isFinite(m) || m < -500 || m > 9000) return null;
    return m;
}

export interface GroundSampler {
    /** What the elevation came from, for the readout. */
    source: string;
    /** Ground elevation in feet MSL, or null where the DEM has no data. */
    sample: (lon: number, lat: number) => number | null;
}

/** Pick a zoom so the area needs at most MAX_TILES tiles. */
function zoomFor(src: DemSource, south: number, west: number, north: number, east: number): number {
    for (let z = Math.min(MAX_ZOOM, src.maxzoom); z > 0; z--) {
        const a = lonLatToTile(west, north, z), b = lonLatToTile(east, south, z);
        if ((b.x - a.x + 1) * (b.y - a.y + 1) <= MAX_TILES) return z;
    }
    return 0;
}

async function fromDem(src: DemSource, south: number, west: number, north: number, east: number): Promise<GroundSampler | null> {
    const z = zoomFor(src, south, west, north, east);
    const a = lonLatToTile(west, north, z), b = lonLatToTile(east, south, z);
    const imgs = new Map<string, ImageData>();
    const jobs: Array<Promise<void>> = [];
    for (let x = a.x; x <= b.x; x++) {
        for (let y = a.y; y <= b.y; y++) {
            jobs.push(tile(src, z, x, y).then((img) => {
                if (img) imgs.set(`${x}/${y}`, img);
            }));
        }
    }
    await Promise.all(jobs);
    if (!imgs.size) return null;
    const sampler: GroundSampler = {
        source: `${src.label}, zoom ${z}`,
        sample: (lon, lat) => {
            const t = lonLatToTile(lon, lat, z);
            const img = imgs.get(`${t.x}/${t.y}`);
            if (!img) return null;
            const m = decode(img, t.fx, t.fy, src.encoding);
            return m === null ? null : m * FT_PER_M;
        }
    };
    // A source that answers but has nothing here (outside the downloaded states) does not count.
    const c = sampler.sample((west + east) / 2, (south + north) / 2);
    return c === null ? null : sampler;
}

function fromMapTerrain(map: MLMap): GroundSampler | null {
    if (!map.getTerrain()) return null;
    const ex = map.getTerrain()?.exaggeration || 1;
    return {
        source: '3D map terrain',
        sample: (lon, lat) => {
            try {
                const raw = map.queryTerrainElevation([lon, lat]);
                // MapLibre answers 0 where no DEM tile has loaded; that is not sea level.
                if (raw === null || !isFinite(raw) || raw === 0) return null;
                return (raw / ex) * FT_PER_M;
            } catch {
                return null;
            }
        }
    };
}

export async function groundSampler(map: MLMap, south: number, west: number, north: number, east: number): Promise<{ sampler: GroundSampler | null; tried: string[] }> {
    const tried: string[] = [];
    for (const src of mapSources(map)) {
        tried.push(src.label);
        const s = await fromDem(src, south, west, north, east).catch(() => null);
        if (s) return { sampler: s, tried };
    }
    const def = await serverDefault();
    if (def) {
        tried.push(def.label);
        const s = await fromDem(def, south, west, north, east).catch(() => null);
        if (s) return { sampler: s, tried };
    } else {
        tried.push('no default terrain configured on the server');
    }
    const live = fromMapTerrain(map);
    if (live) {
        tried.push(live.source);
        return { sampler: live, tried };
    }
    return { sampler: null, tried };
}
