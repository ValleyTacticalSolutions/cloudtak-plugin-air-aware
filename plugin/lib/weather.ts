/** The planner's weather: the METAR near Home, the values in use and their checks. */
import { computed, ref } from 'vue';
import { loadMetars, type MetarRow } from './data.ts';
import { distanceM, FT_PER_M } from './geo.ts';
import { state } from './store.ts';
import { fmtH, metric, sUnit, toS } from './units.ts';
import { evaluate, fromMetar, obsTimeMs, type WxCheck, type WxFormat } from './wx.ts';

export const KM_PER_MI = 1.609344;
/** Stations offered in the picker. */
const MAX_STATIONS = 8;
/** Search half-widths in degrees of latitude: widened only when nothing is close. */
const SEARCH_DEG = [0.75, 2.5, 5];

export interface WxStation {
    row: MetarRow;
    distanceMi: number;
}

const n1 = (v: number): string => String(Math.round(v * 10) / 10);

export const wxFormat: WxFormat = {
    temp: (f) => metric() ? `${n1((f - 32) * 5 / 9)}°C` : `${Math.round(f)}°F`,
    delta: (f) => metric() ? `${n1(f * 5 / 9)}°C` : `${n1(f)}°F`,
    speed: (mph) => `${Math.round(toS(mph))} ${sUnit()}`,
    vis: (sm) => metric() ? `${n1(sm * KM_PER_MI)} km` : `${n1(sm)} mi`,
    height: (ft) => fmtH(ft)
};

/** Ticks while the weather is on screen, so the report ages. */
export const now = ref(Date.now());

export const ageMin = computed((): number | undefined => {
    const row = state.weather.station?.row;
    const t = row ? obsTimeMs(row) : undefined;
    return t === undefined ? undefined : Math.max(0, (now.value - t) / 60_000);
});

export const wxChecks = computed((): WxCheck[] => {
    const w = state.weather;
    // Nothing to check until a report arrives, a fetch fails or a value is typed in.
    if (!w.station && !w.error && !w.edited) return [];
    return evaluate(w.values, state.settings.weather, wxFormat, {
        altitudeFt: state.plan.result?.altitudeAgl,
        ageMin: ageMin.value,
        stationMi: w.station?.distanceMi
    });
});

let seq = 0;

export function clearWeather(): void {
    seq++;
    state.weather = { loading: false, stations: [], values: {}, edited: false };
}

/** Use a station's report, replacing anything typed in. */
export function useStation(id: string): void {
    const station = state.weather.stations.find((s) => s.row.icaoId === id);
    if (!station) return;
    state.weather.station = station;
    state.weather.values = fromMetar(station.row);
    state.weather.edited = false;
}

async function nearby(lat: number, lon: number): Promise<WxStation[]> {
    for (const half of SEARCH_DEG) {
        // Longitude degrees shrink with latitude; the server refuses a box wider than 16.
        const halfLon = Math.min(7.9, half / Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        const rows = await loadMetars(lat - half, lon - halfLon, lat + half, lon + halfLon);
        const found = rows
            .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
            .map((row) => ({ row, distanceMi: distanceM([lon, lat], [row.lon, row.lat]) * FT_PER_M / 5280 }))
            .sort((a, b) => a.distanceMi - b.distanceMi)
            .slice(0, MAX_STATIONS);
        if (found.length) return found;
    }
    return [];
}

/**
 * Fill the weather for Home. Without `force` it does nothing when Home has not moved since
 * the last fetch, so reopening the panel keeps what the pilot typed.
 */
export async function loadWeather(force = false): Promise<void> {
    const home = state.plan.home;
    if (!home) return;
    const key = `${home.lat.toFixed(4)},${home.lon.toFixed(4)}`;
    if (!force && state.weather.key === key) return;
    const moved = state.weather.key !== key;
    const picked = moved ? undefined : state.weather.station?.row.icaoId;
    const mine = ++seq;
    // Another place's weather must never stand in for this one.
    if (moved) state.weather = { loading: true, stations: [], values: {}, edited: false, key };
    else state.weather = { ...state.weather, loading: true, error: undefined };
    now.value = Date.now();
    try {
        const stations = await nearby(home.lat, home.lon);
        if (mine !== seq) return;
        state.weather.stations = stations;
        const choice = stations.find((s) => s.row.icaoId === picked)
            // Prefer the nearest station reporting within the age limit.
            || stations.find((s) => {
                const t = obsTimeMs(s.row);
                const max = state.settings.weather.maxAgeMin;
                return t !== undefined && (max === null || Date.now() - t <= max * 60_000);
            })
            || stations[0];
        if (choice) useStation(choice.row.icaoId);
        else state.weather.error = 'No METAR station found near Home. Enter the weather by hand.';
    } catch (err) {
        if (mine !== seq) return;
        state.weather.error = `Weather could not be read: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
        if (mine === seq) state.weather.loading = false;
    }
}
