<template>
    <div class='aa-panel'>
        <div class='aa-tabs'>
            <button
                v-for='t in tabs'
                :key='t.key'
                type='button'
                class='btn btn-sm'
                :class='tab === t.key ? "btn-primary" : "btn-ghost-secondary"'
                @click='tab = t.key'
                v-text='t.label'
            />
        </div>

        <div
            v-if='state.here'
            class='aa-here'
        >
            {{ state.here }}
        </div>

        <!-- Layers -->
        <div v-if='tab === "layers"'>
            <div
                v-for='l in LAYERS'
                :key='l.key'
                class='aa-row'
            >
                <label class='form-check form-switch m-0 d-flex align-items-start gap-2'>
                    <input
                        v-model='state.settings.layers[l.key]'
                        class='form-check-input mt-1'
                        type='checkbox'
                    >
                    <span class='flex-grow-1'>
                        <span class='fw-bold'>{{ l.label }}</span>
                        <span
                            v-if='state.status[l.key].loading'
                            class='spinner-border spinner-border-sm ms-2'
                        />
                        <span class='d-block small text-secondary'>{{ l.description }}</span>
                        <span
                            v-if='state.settings.layers[l.key]'
                            class='d-block small'
                            :class='state.status[l.key].error ? "text-warning" : "text-info"'
                            :title='state.status[l.key].error || ""'
                        >{{ state.status[l.key].text }}</span>
                    </span>
                </label>
            </div>
            <div class='d-flex gap-2 p-2'>
                <button
                    type='button'
                    class='btn btn-sm btn-outline-secondary'
                    @click='refresh'
                >
                    Refresh
                </button>
                <button
                    type='button'
                    class='btn btn-sm btn-outline-secondary'
                    @click='allOff'
                >
                    All off
                </button>
            </div>
        </div>

        <!-- Planner -->
        <div
            v-else-if='tab === "plan"'
            class='p-2'
        >
            <div class='d-flex gap-2 mb-2 flex-wrap'>
                <button
                    type='button'
                    class='btn btn-sm'
                    :class='state.plan.picking ? "btn-warning" : "btn-primary"'
                    @click='pick'
                >
                    {{ state.plan.picking ? 'Tap the map…' : (state.plan.launch ? 'Move takeoff point' : 'Set takeoff point') }}
                </button>
                <button
                    type='button'
                    class='btn btn-sm btn-outline-secondary'
                    @click='useCenter'
                >
                    Use map centre
                </button>
                <button
                    v-if='state.plan.launch'
                    type='button'
                    class='btn btn-sm btn-outline-danger'
                    @click='clearPlan'
                >
                    Clear
                </button>
            </div>

            <div class='mb-2'>
                <div class='form-label small mb-1'>
                    Operating range from takeoff
                </div>
                <div class='btn-group w-100 flex-wrap'>
                    <button
                        v-for='o in RANGES'
                        :key='o.mi'
                        type='button'
                        class='btn btn-sm'
                        :class='!customRange && rangeMi === o.mi ? "btn-primary" : "btn-outline-secondary"'
                        @click='setRange(o.mi)'
                        v-text='o.label'
                    />
                    <button
                        type='button'
                        class='btn btn-sm'
                        :class='customRange ? "btn-primary" : "btn-outline-secondary"'
                        @click='customRange = true'
                    >
                        Custom
                    </button>
                </div>
                <div
                    v-if='customRange'
                    class='input-group input-group-sm mt-1'
                >
                    <input
                        v-model.number='customMi'
                        type='number'
                        min='0.05'
                        max='25'
                        step='0.05'
                        class='form-control'
                        placeholder='Range'
                    >
                    <span class='input-group-text'>mi</span>
                </div>
            </div>

            <div
                v-if='!state.plan.launch'
                class='small text-secondary'
            >
                Set a takeoff point to see the ground, obstacles and restrictions inside the ring.
                Heights are AGL from takeoff, the way the drone's altimeter reads them.
            </div>

            <template v-else>
                <div class='btn-group w-100 mb-2'>
                    <button
                        type='button'
                        class='btn btn-sm'
                        :class='state.plan.mode === "need" ? "btn-primary" : "btn-outline-secondary"'
                        @click='state.plan.mode = "need"'
                    >
                        Find my altitude
                    </button>
                    <button
                        type='button'
                        class='btn btn-sm'
                        :class='state.plan.mode === "given" ? "btn-primary" : "btn-outline-secondary"'
                        @click='state.plan.mode = "given"'
                    >
                        I have an altitude limit
                    </button>
                </div>
                <div
                    v-if='state.plan.mode === "given"'
                    class='mb-2'
                >
                    <label class='form-label small mb-1'>Max altitude (ft AGL above takeoff)</label>
                    <input
                        v-model.number='given'
                        type='number'
                        min='0'
                        step='10'
                        class='form-control form-control-sm'
                        placeholder='e.g. 400'
                    >
                </div>
                <div class='d-flex gap-2 mb-2'>
                    <button
                        type='button'
                        class='btn btn-sm btn-primary'
                        :disabled='state.plan.computing'
                        @click='compute'
                    >
                        <span
                            v-if='state.plan.computing'
                            class='spinner-border spinner-border-sm me-1'
                        />
                        Recompute
                    </button>
                </div>

                <div
                    v-if='r'
                    class='aa-readout'
                >
                    <div class='small text-secondary'>
                        Takeoff {{ state.plan.launch.lat.toFixed(5) }}, {{ state.plan.launch.lon.toFixed(5) }}
                        · {{ fmtDist(state.settings.radiusFt) }} range
                    </div>

                    <template v-if='state.plan.mode === "need"'>
                        <div
                            v-if='r.altitudeAgl !== undefined'
                            class='aa-big'
                        >
                            Fly at {{ r.altitudeAgl }} ft AGL
                        </div>
                        <div
                            v-if='r.altitudeAgl !== undefined'
                            class='small text-secondary'
                        >
                            Highest ground is {{ fmtRel(r.riseFt) }} from takeoff, plus {{ state.settings.heightAboveTerrainFt }} ft over the terrain,
                            rounded up to the next 10 ft. This keeps {{ state.settings.heightAboveTerrainFt }} ft AGL over the highest ground in range.
                        </div>
                    </template>
                    <template v-else-if='r.workableRiseFt !== undefined'>
                        <div class='aa-big'>
                            {{ r.altitudeAgl }} ft AGL limit
                        </div>
                        <div class='small'>
                            Works over ground up to {{ fmtRel(r.workableRiseFt) }} from takeoff
                            while holding {{ state.settings.heightAboveTerrainFt }} ft over the terrain.
                        </div>
                        <div
                            v-if='r.tooHighPct !== undefined'
                            class='small'
                            :class='r.tooHighPct > 0 ? "text-warning" : "text-success"'
                        >
                            {{ r.tooHighPct }}% of the range is too high (red on the map; blue is workable).
                        </div>
                    </template>

                    <table class='table table-sm mt-2 aa-table'>
                        <tbody>
                            <tr>
                                <td>UAS Facility Map</td>
                                <td>
                                    <span v-if='r.uasCeilingFt !== undefined'>{{ r.uasCeilingFt }} ft AGL max without authorization ({{ r.uasAirport }})</span>
                                    <span v-else>Not on the grid at takeoff</span>
                                </td>
                            </tr>
                            <tr>
                                <td>Terrain in range</td>
                                <td>
                                    <span v-if='r.riseFt !== undefined'>{{ fmtRel(r.dropFt) }} to {{ fmtRel(r.riseFt) }} from takeoff</span>
                                    <span v-else>—</span>
                                </td>
                            </tr>
                            <tr>
                                <td>Obstacles in range</td>
                                <td>
                                    {{ r.obstacles.length }}
                                    <span
                                        v-if='r.obstaclesAbove'
                                        class='text-warning'
                                    >· {{ r.obstaclesAbove }} reach your altitude (with {{ state.settings.separationFt }} ft separation)</span>
                                </td>
                            </tr>
                            <tr v-if='r.tfrs.length'>
                                <td class='text-danger'>
                                    TFR
                                </td><td class='text-danger'>
                                    {{ r.tfrs.join('; ') }}
                                </td>
                            </tr>
                            <tr v-if='r.nsufr.length'>
                                <td class='text-danger'>
                                    UAS No-Fly
                                </td><td class='text-danger'>
                                    {{ r.nsufr.join('; ') }}
                                </td>
                            </tr>
                            <tr v-if='r.airspace.length'>
                                <td>Airspace at takeoff</td><td>{{ r.airspace.join('; ') }}</td>
                            </tr>
                            <tr v-if='r.terrainSource'>
                                <td>Terrain data</td><td>{{ r.terrainSource }}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div
                        v-for='w in r.warnings'
                        :key='w'
                        class='small text-warning mb-1'
                    >
                        {{ w }}
                    </div>

                    <div
                        v-if='r.obstacles.length'
                        class='mt-2'
                    >
                        <div class='fw-bold small mb-1'>
                            Obstacles, nearest first
                        </div>
                        <div
                            v-for='o in r.obstacles.slice(0, 50)'
                            :key='o.oas'
                            class='aa-obs'
                            :class='{ "aa-obs-above": isAbove(o.topAboveTakeoffFt) }'
                            @click='flyTo(o.lon, o.lat)'
                        >
                            <span class='fw-bold'>{{ o.type }}</span>
                            {{ o.aglFt }} ft tall
                            <span v-if='o.topAboveTakeoffFt !== undefined'>· top {{ fmtRel(o.topAboveTakeoffFt) }} from takeoff</span>
                            · {{ lightingName(o.lighting) }}
                            · {{ fmtDist(o.distanceFt) }} {{ compass(o.bearing) }}
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- Details -->
        <div v-else-if='tab === "details"'>
            <DetailsView />
        </div>

        <!-- Settings -->
        <div
            v-else
            class='p-2'
        >
            <div class='fw-bold mb-1'>
                Map
            </div>
            <label class='form-check form-switch'>
                <input
                    v-model='state.settings.volumes'
                    class='form-check-input'
                    type='checkbox'
                >
                <span class='form-check-label'>Draw TFRs and airspace as 3D volumes (tilt the map)</span>
            </label>
            <label class='form-check form-switch mb-3'>
                <input
                    v-model='state.settings.activeTfrOnly'
                    class='form-check-input'
                    type='checkbox'
                >
                <span class='form-check-label'>Only TFRs in effect now</span>
            </label>

            <div class='fw-bold mb-1'>
                Obstacles
            </div>
            <label class='form-label small mb-1'>Taller than (ft AGL)</label>
            <input
                v-model.number='state.settings.obstacleMinFt'
                type='number'
                min='0'
                step='50'
                class='form-control form-control-sm mb-2'
            >
            <div class='small mb-1'>
                Types (none ticked = all)
            </div>
            <div class='d-flex flex-wrap gap-2 mb-3'>
                <label
                    v-for='t in OBSTACLE_TYPES'
                    :key='t'
                    class='form-check m-0'
                >
                    <input
                        v-model='state.settings.obstacleTypes'
                        class='form-check-input'
                        type='checkbox'
                        :value='t'
                    >
                    <span class='form-check-label small'>{{ t }}</span>
                </label>
            </div>

            <div class='fw-bold mb-1'>
                Planner
            </div>
            <label class='form-label small mb-1'>Height to hold over the terrain (ft AGL)</label>
            <input
                v-model.number='state.settings.heightAboveTerrainFt'
                type='number'
                min='0'
                step='10'
                class='form-control form-control-sm mb-2'
            >
            <label class='form-label small mb-1'>Clearance over obstacles (ft)</label>
            <input
                v-model.number='state.settings.separationFt'
                type='number'
                min='0'
                step='10'
                class='form-control form-control-sm mb-3'
            >
            <button
                type='button'
                class='btn btn-sm btn-outline-secondary'
                @click='reset'
            >
                Reset settings
            </button>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed, ref, watch, onMounted } from 'vue';
import { LAYERS } from './constants.ts';
import { state, DEFAULT_SETTINGS } from './store.ts';
import { runtime } from './runtime.ts';
import { computePlan, planShape } from './planner.ts';
import { fmtDist, fmtRel, compass } from './geo.ts';
import { lightingName } from './layers.ts';
import DetailsView from './DetailsView.vue';

const tabs = [
    { key: 'layers', label: 'Layers' },
    { key: 'plan', label: 'Planner' },
    { key: 'details', label: 'Details' },
    { key: 'settings', label: 'Settings' }
];
const tab = ref('layers');

const OBSTACLE_TYPES = ['TOWER', 'T-L TWR', 'POLE', 'BLDG', 'WINDMILL', 'STACK', 'CRANE', 'CATENARY', 'TANK', 'ANTENNA', 'PLANT', 'RIG', 'BRIDGE', 'DAM', 'ELEVATOR', 'LGTHOUSE', 'MONUMENT', 'SIGN', 'SPIRE', 'UTILITY POLE', 'OTHER'];

const RANGES = [
    { mi: 0.25, label: '¼ mi' },
    { mi: 0.5, label: '½ mi' },
    { mi: 1, label: '1 mi' },
    { mi: 1.5, label: '1½ mi' }
];

const rangeMi = computed(() => Math.round((state.settings.radiusFt / 5280) * 1000) / 1000);
const customRange = ref(!RANGES.some((o) => o.mi === rangeMi.value));
const customMi = ref<number | undefined>(rangeMi.value);

function setRange(mi: number): void {
    customRange.value = false;
    customMi.value = mi;
    state.settings.radiusFt = mi * 5280;
}

watch(customMi, (v) => {
    if (!customRange.value) return;
    if (typeof v === 'number' && isFinite(v) && v >= 0.05 && v <= 25) state.settings.radiusFt = v * 5280;
});

const given = ref<number | undefined>(state.plan.givenAltitudeAgl);
const r = computed(() => state.plan.result);

onMounted(() => {
    if (state.details.length && tab.value === 'layers') tab.value = 'details';
});

watch(() => state.details, () => {
    if (state.details.length) tab.value = 'details';
});

watch(given, (v) => {
    state.plan.givenAltitudeAgl = typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;
});

// The ring follows the range instantly; the readouts follow once the inputs settle.
watch(() => [state.plan.launch?.lon, state.plan.launch?.lat, state.settings.radiusFt], () => drawPlan());

let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => [
    state.plan.launch?.lon,
    state.plan.launch?.lat,
    state.plan.mode,
    state.plan.givenAltitudeAgl,
    state.settings.radiusFt,
    state.settings.heightAboveTerrainFt,
    state.settings.separationFt
], () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void compute(); }, 250);
});

function drawPlan(): void {
    runtime.layers?.setPlan(planShape());
}

async function compute(): Promise<void> {
    if (!runtime.map || !runtime.layers || !state.plan.launch) return;
    state.plan.computing = true;
    try {
        state.plan.result = await computePlan(runtime.map, runtime.layers);
    } finally {
        state.plan.computing = false;
    }
}

function pick(): void {
    state.plan.picking = !state.plan.picking;
    if (runtime.map) runtime.map.getCanvas().style.cursor = state.plan.picking ? 'crosshair' : '';
}

function useCenter(): void {
    if (!runtime.map) return;
    const c = runtime.map.getCenter();
    state.plan.launch = { lon: c.lng, lat: c.lat };
}

function clearPlan(): void {
    state.plan.launch = undefined;
    state.plan.result = undefined;
    state.plan.picking = false;
    runtime.layers?.setPlan({ type: 'FeatureCollection', features: [] });
    runtime.layers?.setIslands({ type: 'FeatureCollection', features: [] });
}

function isAbove(top: number | undefined): boolean {
    const alt = state.plan.result?.altitudeAgl;
    return top !== undefined && alt !== undefined && top + state.settings.separationFt > alt;
}

function flyTo(lon: number, lat: number): void {
    runtime.map?.flyTo({ center: [lon, lat], zoom: Math.max(runtime.map.getZoom(), 14) });
}

function refresh(): void {
    state.revision++;
}

function allOff(): void {
    for (const k of Object.keys(state.settings.layers) as Array<keyof typeof state.settings.layers>) state.settings.layers[k] = false;
}

function reset(): void {
    const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    Object.assign(state.settings, d);
    customRange.value = false;
}
</script>

<style scoped>
.aa-panel {
    font-size: 0.875rem;
}
.aa-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.25);
}
.aa-here {
    margin: 6px;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(33, 150, 243, 0.15);
    font-size: 0.8rem;
}
.aa-row {
    padding: 8px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
}
.aa-big {
    font-size: 1.15rem;
    font-weight: 700;
    margin-top: 4px;
}
.aa-table td {
    padding: 2px 4px;
    background: transparent;
    font-size: 0.8rem;
    vertical-align: top;
}
.aa-obs {
    font-size: 0.78rem;
    padding: 3px 4px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
    cursor: pointer;
}
.aa-obs-above {
    color: #ffb300;
}
</style>
