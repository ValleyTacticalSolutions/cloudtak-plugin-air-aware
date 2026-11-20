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
            <div class='small text-secondary px-2 pb-2'>
                Advisory only. Everything here is a picture of published FAA data when it reached CloudTAK.
                It is not a clearance and does not replace charts, NOTAMs or a briefing. A quiet map is not an empty sky:
                each layer's status line says what it is not showing.
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
                    {{ state.plan.picking ? 'Tap the map…' : (state.plan.launch ? 'Move launch point' : 'Set launch point') }}
                </button>
                <button
                    type='button'
                    class='btn btn-sm btn-outline-secondary'
                    :disabled='!state.plan.launch'
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
            <div
                v-if='!state.plan.launch'
                class='small text-secondary'
            >
                Set a launch point. The plan covers a circle around it ({{ fmtDist(state.settings.radiusFt) }}, change in Settings).
                It needs a terrain overlay turned on in CloudTAK to read the ground.
                <button
                    type='button'
                    class='btn btn-link btn-sm p-0'
                    @click='useCenter'
                >
                    Or use the map centre.
                </button>
            </div>

            <template v-else>
                <div class='btn-group w-100 mb-2'>
                    <button
                        type='button'
                        class='btn btn-sm'
                        :class='state.plan.mode === "need" ? "btn-primary" : "btn-outline-secondary"'
                        @click='state.plan.mode = "need"'
                    >
                        Need a ceiling
                    </button>
                    <button
                        type='button'
                        class='btn btn-sm'
                        :class='state.plan.mode === "given" ? "btn-primary" : "btn-outline-secondary"'
                        @click='state.plan.mode = "given"'
                    >
                        Given a ceiling
                    </button>
                </div>
                <div
                    v-if='state.plan.mode === "given"'
                    class='mb-2'
                >
                    <label class='form-label small mb-1'>Assigned ceiling (ft MSL)</label>
                    <input
                        v-model.number='given'
                        type='number'
                        min='0'
                        step='100'
                        class='form-control form-control-sm'
                        placeholder='e.g. 7500'
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
                        Launch {{ state.plan.launch.lat.toFixed(5) }}, {{ state.plan.launch.lon.toFixed(5) }}
                        · {{ fmtDist(state.settings.radiusFt) }} radius
                    </div>

                    <template v-if='state.plan.mode === "need"'>
                        <div
                            v-if='r.needCeilingMsl'
                            class='aa-big'
                        >
                            Ask for {{ fmtFt(r.needCeilingMsl) }} MSL
                        </div>
                        <div
                            v-if='r.needCeilingAboveLaunch !== undefined'
                            class='small'
                        >
                            = {{ fmtFt(r.needCeilingAboveLaunch) }} above the launch point
                        </div>
                        <div class='small text-secondary'>
                            Highest ground {{ fmtFt(r.maxGroundFt) }} + {{ fmtFt(state.settings.heightAboveTerrainFt) }} above terrain, rounded up to the next 100 ft.
                        </div>
                    </template>
                    <template v-else-if='r.givenWorkableGroundFt !== undefined'>
                        <div class='aa-big'>
                            Work over ground up to {{ fmtFt(r.givenWorkableGroundFt) }}
                        </div>
                        <div
                            v-if='r.givenTooHighPct !== undefined'
                            class='small'
                            :class='r.givenTooHighPct > 0 ? "text-warning" : "text-success"'
                        >
                            {{ r.givenTooHighPct }}% of the area is too high at {{ fmtFt(state.settings.heightAboveTerrainFt) }} above terrain
                            (red on the map; blue is workable).
                        </div>
                    </template>

                    <table class='table table-sm mt-2 aa-table'>
                        <tbody>
                            <tr>
                                <td>Ground at launch</td><td>{{ fmtFt(r.launchGroundFt) }}</td>
                            </tr>
                            <tr>
                                <td>Ground in area</td><td>{{ fmtFt(r.minGroundFt) }} – {{ fmtFt(r.maxGroundFt) }}</td>
                            </tr>
                            <tr>
                                <td>UAS Facility Map</td>
                                <td>
                                    <span v-if='r.uasCeilingFt !== undefined'>{{ r.uasCeilingFt }} ft AGL ({{ r.uasAirport }})</span>
                                    <span v-else>Not on the grid at launch</span>
                                </td>
                            </tr>
                            <tr>
                                <td>Obstacles in area</td>
                                <td>
                                    {{ r.obstacles.length }}
                                    <span
                                        v-if='r.obstaclesAbove'
                                        class='text-warning'
                                    >· {{ r.obstaclesAbove }} reach the ceiling (with {{ state.settings.separationFt }} ft separation)</span>
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
                                <td>Airspace at launch</td><td>{{ r.airspace.join('; ') }}</td>
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
                            :class='{ "aa-obs-above": isAbove(o.amslFt) }'
                            @click='flyTo(o.lon, o.lat)'
                        >
                            <span class='fw-bold'>{{ o.type }}</span>
                            {{ o.aglFt }} ft AGL · top {{ o.amslFt.toLocaleString('en-US') }} MSL
                            · {{ lightingName(o.lighting) }}
                            · {{ fmtDist(o.distanceFt) }} {{ compass(o.bearing) }}
                        </div>
                    </div>

                    <div class='mt-3 d-flex flex-column gap-2'>
                        <a
                            class='btn btn-sm btn-outline-primary'
                            :href='LINKS.laanc'
                            target='_blank'
                            rel='noopener noreferrer'
                        >File LAANC (FAA-approved supplier)</a>
                        <a
                            class='btn btn-sm btn-outline-primary'
                            :href='LINKS.dronezone'
                            target='_blank'
                            rel='noopener noreferrer'
                        >FAA DroneZone (anything LAANC does not cover)</a>
                        <a
                            class='btn btn-sm btn-outline-primary'
                            :href='LINKS.flightService'
                            target='_blank'
                            rel='noopener noreferrer'
                        >Notify Flight Service (1800wxbrief)</a>
                    </div>
                    <div class='mt-2'>
                        <div class='small fw-bold mb-1'>
                            For Flight Service (nothing is sent)
                        </div>
                        <pre class='aa-text'>{{ fss }}</pre>
                        <button
                            type='button'
                            class='btn btn-sm btn-outline-secondary'
                            @click='copy'
                        >
                            {{ copied ? 'Copied' : 'Copy' }}
                        </button>
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
            v-else-if='tab === "settings"'
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
            <label class='form-check form-switch'>
                <input
                    v-model='state.settings.activeTfrOnly'
                    class='form-check-input'
                    type='checkbox'
                >
                <span class='form-check-label'>Only TFRs in effect now</span>
            </label>
            <div class='small text-secondary mb-3'>
                Volumes stand at their published heights from the map's ground plane; MSL and AGL limits are not
                corrected for terrain, so read the numbers on the details page, not the picture.
            </div>

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
            <label class='form-label small mb-1'>Height above terrain you fly at (ft)</label>
            <input
                v-model.number='state.settings.heightAboveTerrainFt'
                type='number'
                min='0'
                step='50'
                class='form-control form-control-sm mb-2'
            >
            <label class='form-label small mb-1'>Separation from obstacles (ft)</label>
            <input
                v-model.number='state.settings.separationFt'
                type='number'
                min='0'
                step='50'
                class='form-control form-control-sm mb-2'
            >
            <label class='form-label small mb-1'>Circle radius (ft)</label>
            <input
                v-model.number='state.settings.radiusFt'
                type='number'
                min='100'
                step='100'
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

        <!-- Key -->
        <div
            v-else
            class='p-2'
        >
            <div
                v-for='g in KEY'
                :key='g.title'
                class='mb-2'
            >
                <div class='fw-bold small mb-1'>
                    {{ g.title }}
                </div>
                <div
                    v-for='i in g.items'
                    :key='i[0]'
                    class='d-flex align-items-center gap-2 small'
                >
                    <span
                        class='aa-swatch'
                        :style='{ background: i[1] }'
                    />{{ i[0] }}
                </div>
            </div>
            <div class='small text-secondary mt-2'>
                Data: FAA (TFR, NOTAM Management Service via the takwerx relay, Aeronautical Information Services airspace,
                UAS Facility Map, NSUFR, Digital Obstacle File) and aviationweather.gov METARs. Packs published by takwerx
                for the AirAware ATAK plugin.
            </div>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed, ref, watch, onMounted } from 'vue';
import { LAYERS, LINKS, COLORS } from './constants.ts';
import { state, DEFAULT_SETTINGS } from './store.ts';
import { runtime } from './runtime.ts';
import { computePlan, flightServiceText, planShape } from './planner.ts';
import { fmtDist, fmtFt, compass } from './geo.ts';
import { lightingName } from './layers.ts';
import DetailsView from './DetailsView.vue';

const tabs = [
    { key: 'layers', label: 'Layers' },
    { key: 'plan', label: 'Planner' },
    { key: 'details', label: 'Details' },
    { key: 'settings', label: 'Settings' },
    { key: 'key', label: 'Key' }
];
const tab = ref('layers');

const OBSTACLE_TYPES = ['TOWER', 'T-L TWR', 'POLE', 'BLDG', 'WINDMILL', 'STACK', 'CRANE', 'CATENARY', 'TANK', 'ANTENNA', 'PLANT', 'RIG', 'BRIDGE', 'DAM', 'ELEVATOR', 'LGTHOUSE', 'MONUMENT', 'SIGN', 'SPIRE', 'UTILITY POLE', 'OTHER'];

const KEY: Array<{ title: string; items: Array<[string, string]> }> = [
    { title: 'TFR', items: [['In effect', COLORS.tfrActive], ['Scheduled', COLORS.tfrScheduled]] },
    { title: 'Airspace', items: [['Class B', COLORS.classB], ['Class C', COLORS.classC], ['Class D', COLORS.classD], ['Class E (700 ft AGL / surface)', COLORS.classE], ['Class E (1,200 ft AGL)', COLORS.classE1200], ['Class A', COLORS.classA]] },
    { title: 'Special Use', items: [['Prohibited', COLORS.prohibited], ['Restricted', COLORS.restricted], ['Warning', COLORS.warning], ['Alert', COLORS.alert], ['MOA', COLORS.moa]] },
    { title: 'UAS ceilings (ft AGL)', items: [['0 — no automatic authorization', '#d32f2f'], ['100', '#f4511e'], ['200', '#ffb300'], ['300', '#c0ca33'], ['400', '#43a047']] },
    { title: 'UAS No-Fly', items: [['Full-time', COLORS.nsufrFull], ['Part-time', COLORS.nsufrPart], ['Pending', COLORS.nsufrPending]] },
    { title: 'NOTAMs', items: [['Airspace activity', COLORS.notamAirspace], ['Obstacle', COLORS.notamObstacle], ['Airfield', COLORS.notamAirfield], ['Navigation / procedures', COLORS.notamNavigation], ['Other', COLORS.notamOther]] },
    { title: 'METARs', items: [['VFR', COLORS.vfr], ['MVFR', COLORS.mvfr], ['IFR', COLORS.ifr], ['LIFR', COLORS.lifr]] },
    { title: 'Planner', items: [['Plan area / launch', COLORS.plan], ['Ground too high for the ceiling', COLORS.island], ['Workable ground', COLORS.mvfr], ['Obstacle', COLORS.obstacle]] }
];

const given = ref<number | undefined>(state.plan.givenCeilingMsl);
const copied = ref(false);
const r = computed(() => state.plan.result);
const fss = computed(() => flightServiceText(state.plan.result));

onMounted(() => {
    if (state.details.length && tab.value === 'layers') tab.value = 'details';
});

watch(() => state.details, () => {
    if (state.details.length) tab.value = 'details';
});

watch(given, (v) => {
    state.plan.givenCeilingMsl = typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;
});

watch(() => [
    state.plan.launch?.lon,
    state.plan.launch?.lat,
    state.plan.mode,
    state.plan.givenCeilingMsl,
    state.settings.radiusFt,
    state.settings.heightAboveTerrainFt,
    state.settings.separationFt
], () => {
    drawPlan();
    void compute();
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

function isAbove(amsl: number): boolean {
    const ceiling = state.plan.mode === 'given' ? state.plan.givenCeilingMsl : state.plan.result?.needCeilingMsl;
    return ceiling !== undefined && amsl + state.settings.separationFt > ceiling;
}

function flyTo(lon: number, lat: number): void {
    runtime.map?.flyTo({ center: [lon, lat], zoom: Math.max(runtime.map.getZoom(), 14) });
}

async function copy(): Promise<void> {
    try {
        await navigator.clipboard.writeText(fss.value);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1500);
    } catch {
        copied.value = false;
    }
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
.aa-text {
    white-space: pre-wrap;
    font-size: 0.75rem;
    margin: 0 0 4px 0;
    padding: 4px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
.aa-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0, 0, 0, 0.4);
}
</style>
