import { reactive, watch } from 'vue';
import type { LayerKey } from './constants.ts';

const STORAGE_KEY = 'air-aware-settings-v2';

export interface Settings {
    layers: Record<LayerKey, boolean>;
    /** Obstacles shorter than this (ft AGL) are not drawn. */
    obstacleMinFt: number;
    /** Obstacle types that are drawn and listed; empty means every type. */
    obstacleTypes: string[];
    /** Draw TFRs and airspace as 3D volumes rather than flat outlines. */
    volumes: boolean;
    /** Hide TFRs that are scheduled but not yet in effect. */
    activeTfrOnly: boolean;
    /** Planner: height the aircraft flies above the terrain, ft. */
    heightAboveTerrainFt: number;
    /** Planner: required vertical separation from obstacles, ft. */
    separationFt: number;
    /** Planner: circle radius, ft. */
    radiusFt: number;
}

export const DEFAULT_SETTINGS: Settings = {
    layers: {
        tfr: false,
        notams: false,
        airspace: false,
        sua: false,
        uasfm: false,
        nsufr: false,
        obstacles: false,
        metars: false
    },
    obstacleMinFt: 200,
    obstacleTypes: [],
    volumes: false,
    activeTfrOnly: false,
    heightAboveTerrainFt: 400,
    separationFt: 100,
    radiusFt: 2640
};

function load(): Settings {
    const base: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as Settings;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return base;
        const saved = JSON.parse(raw) as Partial<Settings>;
        return {
            ...base,
            ...saved,
            layers: { ...base.layers, ...(saved.layers || {}) }
        };
    } catch {
        return base;
    }
}

export type LayerStatus = {
    /** Words for the status line. */
    text: string;
    loading: boolean;
    error?: string;
    count?: number;
    updated?: string;
};

export interface DetailRow {
    label: string;
    value: string;
    href?: string;
}

export interface Detail {
    title: string;
    subtitle?: string;
    color?: string;
    rows: DetailRow[];
    text?: string;
}

export interface PlanObstacle {
    oas: string;
    type: string;
    lat: number;
    lon: number;
    aglFt: number;
    amslFt: number;
    /** Top of the obstacle relative to the takeoff point, when terrain is known. */
    topAboveTakeoffFt?: number;
    lighting: string;
    distanceFt: number;
    bearing: number;
}

export interface PlanResult {
    computedAt: string;
    terrain: 'map' | 'none';
    /** Where the ground elevation came from. */
    terrainSource?: string;
    /** Ground at the takeoff point, ft MSL (internal reference only). */
    launchGroundFt?: number;
    /** Highest / lowest ground in the area relative to takeoff, ft (+ above, - below). */
    riseFt?: number;
    dropFt?: number;
    samples: number;
    /** The altitude the plan uses, ft AGL above takeoff (found, or the one entered). */
    altitudeAgl?: number;
    /** Limit mode: the highest ground you can work over, relative to takeoff. */
    workableRiseFt?: number;
    tooHighPct?: number;
    uasCeilingFt?: number;
    uasAirport?: string;
    obstacles: PlanObstacle[];
    obstaclesAbove: number;
    tfrs: string[];
    nsufr: string[];
    airspace: string[];
    warnings: string[];
}

export interface PlanState {
    picking: boolean;
    launch?: { lon: number; lat: number };
    mode: 'need' | 'given';
    /** Limit mode: max altitude entered, ft AGL above takeoff. */
    givenAltitudeAgl?: number;
    computing: boolean;
    result?: PlanResult;
}

export const state = reactive({
    settings: load(),
    status: {
        tfr: { text: 'Off', loading: false },
        notams: { text: 'Off', loading: false },
        airspace: { text: 'Off', loading: false },
        sua: { text: 'Off', loading: false },
        uasfm: { text: 'Off', loading: false },
        nsufr: { text: 'Off', loading: false },
        obstacles: { text: 'Off', loading: false },
        metars: { text: 'Off', loading: false }
    } as Record<LayerKey, LayerStatus>,
    /** The pinned line: the UAS ceiling where the map is centred. */
    here: '' as string,
    details: [] as Detail[],
    plan: {
        picking: false,
        mode: 'need',
        computing: false
    } as PlanState,
    /** Bumped when a layer needs a reload (settings changed, manual refresh). */
    revision: 0
});

let watching = false;

export function persistSettings(): void {
    if (watching) return;
    watching = true;
    watch(() => state.settings, (s) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch {
            // Private mode or blocked storage: the settings live for this session only.
        }
    }, { deep: true });
}
