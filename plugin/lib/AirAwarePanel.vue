<template>
    <div class='aa-panel d-flex flex-column gap-2 py-2'>
        <div class='px-2'>
            <TablerPillGroup
                v-model='tab'
                class='aa-pills'
                :options='tabs'
                :rounded='false'
                size='default'
                padding=''
                name='air-aware-tab'
            />
        </div>

        <!-- Layers -->
        <div
            v-if='tab === "layers"'
            class='d-flex flex-column gap-2'
        >
            <div
                v-if='planOn'
                class='aa-note mx-2'
            >
                Flight plan active: the map shows only what overlaps it.
            </div>
            <div
                v-else-if='state.here'
                class='aa-note mx-2'
            >
                {{ state.here }}
            </div>
            <div>
                <label
                    v-for='l in LAYERS'
                    :key='l.key'
                    class='aa-row d-flex align-items-start gap-3 m-0'
                >
                    <span class='form-switch flex-shrink-0'>
                        <input
                            v-model='state.settings.layers[l.key]'
                            class='form-check-input aa-switch'
                            type='checkbox'
                        >
                    </span>
                    <span class='aa-grow'>
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
            <div class='d-flex gap-2 px-2'>
                <TablerButton
                    class='btn-outline-primary aa-action flex-fill'
                    title='Reload every layer that is on'
                    @click='refresh'
                >
                    <IconRefresh
                        :size='20'
                        stroke='1'
                        class='me-2'
                    />
                    Refresh
                </TablerButton>
                <TablerButton
                    class='btn-outline-secondary aa-action flex-fill'
                    title='Switch every layer off'
                    @click='allOff'
                >
                    <IconEyeOff
                        :size='20'
                        stroke='1'
                        class='me-2'
                    />
                    All Off
                </TablerButton>
            </div>
        </div>

        <!-- UAS Flight Planner -->
        <div
            v-else-if='tab === "plan"'
            class='d-flex flex-column gap-3 px-2'
        >
            <!-- Home -->
            <section>
                <div class='aa-step'>
                    <IconHome
                        :size='18'
                        stroke='1.5'
                    />
                    Home / Takeoff Point
                    <IconCheck
                        v-if='state.plan.home'
                        :size='16'
                        class='text-success ms-auto'
                    />
                </div>
                <TablerButton
                    class='aa-action w-100'
                    :class='pickClass("home")'
                    title='Click the map to place Home'
                    @click='pick("home")'
                >
                    <IconPointer
                        :size='20'
                        stroke='1'
                        class='me-2'
                    />
                    {{ state.plan.picking === 'home' ? 'Click The Map…' : 'Click Map To Set Home' }}
                </TablerButton>
                <div
                    v-if='state.plan.home'
                    class='aa-sub'
                >
                    {{ fmtLL(state.plan.home) }}
                    <template v-if='homeInfo'>
                        <span v-if='homeInfo.groundFt !== undefined'> · {{ fmtH(homeInfo.groundFt) }} MSL</span>
                        <span> · {{ homeInfo.onGrid ? `Grid ${fmtH(homeInfo.ceilingFt)}` : 'No grid' }}</span>
                    </template>
                </div>
            </section>

            <!-- Target -->
            <section v-if='state.plan.home'>
                <div class='aa-step'>
                    <IconTarget
                        :size='18'
                        stroke='1.5'
                    />
                    Target / Area Of Interest
                    <IconCheck
                        v-if='state.plan.target'
                        :size='16'
                        class='text-success ms-auto'
                    />
                </div>
                <div class='d-flex flex-column gap-2'>
                    <TablerButton
                        class='aa-action w-100'
                        :class='pickClass("target")'
                        title='Click the map to place the target'
                        @click='pick("target")'
                    >
                        <IconPointer
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                        {{ state.plan.picking === 'target' ? 'Click The Map…' : 'Click Map To Set Target' }}
                    </TablerButton>
                    <TablerButton
                        class='btn-outline-secondary aa-action w-100'
                        title='Work over the takeoff point itself'
                        @click='homeAsTarget'
                    >
                        <IconHome
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                        Set Home As Target
                    </TablerButton>
                </div>
                <div
                    v-if='state.plan.target'
                    class='aa-sub'
                >
                    <template v-if='targetDistanceFt < 3'>
                        At Home
                    </template>
                    <template v-else>
                        {{ fmtDist(targetDistanceFt) }} {{ compass(targetBearing) }} ({{ Math.round(targetBearing) }}°)
                        <span v-if='targetRel !== undefined'> · Ground {{ fmtRel(targetRel) }}</span>
                    </template>
                    <span v-if='targetInfo?.onGrid'> · Grid {{ fmtH(targetInfo.ceilingFt) }}</span>
                </div>
            </section>

            <template v-if='planOn'>
                <!-- Mission -->
                <section>
                    <div class='aa-step'>
                        <IconRoute
                            :size='18'
                            stroke='1.5'
                        />
                        Mission
                    </div>
                    <div class='aa-label'>
                        Range
                    </div>
                    <TablerPillGroup
                        v-model='rangeKey'
                        class='aa-pills'
                        :options='rangeOptions'
                        :rounded='false'
                        size='default'
                        padding=''
                        name='air-aware-range'
                    />
                    <div
                        v-if='rangeKey === "custom"'
                        class='input-group mt-1'
                    >
                        <input
                            v-model.number='customMi'
                            type='number'
                            min='0.05'
                            max='40'
                            step='0.05'
                            class='form-control'
                            placeholder='Range'
                        >
                        <span class='input-group-text'>{{ dUnit() }}</span>
                    </div>
                    <div class='aa-label'>
                        Standoff
                    </div>
                    <TablerPillGroup
                        v-model='standoffKey'
                        class='aa-pills'
                        :options='standoffOptions'
                        :rounded='false'
                        size='default'
                        padding=''
                        name='air-aware-standoff'
                    />
                    <div
                        v-if='standoffKey === "custom"'
                        class='input-group mt-1'
                    >
                        <input
                            v-model.number='customStandoff'
                            type='number'
                            min='0'
                            :step='metric() ? 10 : 50'
                            class='form-control'
                            placeholder='Standoff'
                        >
                        <span class='input-group-text'>{{ hUnit() }}</span>
                    </div>
                    <div
                        v-if='r?.gimbalDeg !== undefined && r.altitudeAgl !== undefined'
                        class='aa-gimbal mt-2'
                        :title='`Camera angle below level to see the target from the standoff point at ${fmtH(r.altitudeAgl)}`'
                    >
                        <IconCamera
                            :size='18'
                            stroke='1.5'
                        />
                        <span>Gimbal <b>−{{ r.gimbalDeg }}°</b></span>
                        <span class='text-secondary'>at {{ fmtH(r.altitudeAgl) }} · {{ fmtDist(r.slantRangeFt ?? 0) }} slant</span>
                    </div>
                    <div
                        v-if='r'
                        class='aa-stats mt-2'
                    >
                        <div>
                            <span>Furthest</span>
                            <b :class='r.maxReachFt > state.settings.radiusFt ? "text-warning" : ""'>{{ fmtDist(r.maxReachFt) }}</b>
                        </div>
                        <div v-if='r.transitMin !== undefined'>
                            <span>Transit</span>
                            <b>{{ fmtMin(r.transitMin) }}</b>
                        </div>
                        <div v-if='r.onStationMin !== undefined'>
                            <span>On Station</span>
                            <b :class='r.onStationMin <= 0 ? "text-danger" : ""'>{{ r.onStationMin > 0 ? fmtMin(r.onStationMin) : 'None' }}</b>
                        </div>
                    </div>
                </section>

                <!-- Altitude -->
                <section>
                    <div class='aa-step'>
                        <IconMountain
                            :size='18'
                            stroke='1.5'
                        />
                        Altitude
                    </div>
                    <TablerPillGroup
                        v-model='state.plan.mode'
                        class='aa-pills'
                        :options='modeOptions'
                        :rounded='false'
                        size='default'
                        padding=''
                        name='air-aware-mode'
                    />
                    <div
                        v-if='state.plan.mode === "given"'
                        class='input-group mt-2'
                    >
                        <input
                            v-model.number='given'
                            type='number'
                            min='0'
                            :max='r?.allowedMaxAgl !== undefined ? Math.floor(toH(r.allowedMaxAgl)) : undefined'
                            :step='metric() ? 5 : 10'
                            class='form-control'
                            placeholder='Altitude'
                            @change='clampGiven'
                        >
                        <span class='input-group-text'>{{ hUnit() }}</span>
                    </div>
                    <template v-if='r'>
                        <div
                            v-if='r.altitudeAgl !== undefined'
                            class='aa-big mt-2'
                        >
                            {{ fmtH(r.altitudeAgl) }} <span class='small fw-normal text-secondary'>above Home</span>
                        </div>
                        <div class='aa-sub'>
                            Max {{ fmtH(r.allowedMaxAgl) }} · {{ maxReason }}
                        </div>
                        <div
                            v-if='r.floorAgl !== undefined || r.obstacleNeedAgl !== undefined'
                            class='aa-sub'
                        >
                            Needs
                            <span v-if='r.floorAgl !== undefined'>{{ fmtH(r.floorAgl) }} terrain</span>
                            <span v-if='r.floorAgl !== undefined && r.obstacleNeedAgl !== undefined'> · </span>
                            <span v-if='r.obstacleNeedAgl !== undefined'>{{ fmtH(r.obstacleNeedAgl) }} obstacles</span>
                        </div>
                        <div
                            v-if='r.clamped || clampNote'
                            class='aa-sub text-warning'
                        >
                            Lowered to {{ fmtH(r.allowedMaxAgl) }}.
                        </div>
                        <div
                            v-if='r.tooHighPct'
                            class='aa-sub text-warning'
                        >
                            {{ r.tooHighPct }}% of the area is too high (red on the map).
                        </div>
                    </template>
                </section>

                <!-- Flight area check -->
                <section>
                    <div class='aa-step'>
                        <IconListCheck
                            :size='18'
                            stroke='1.5'
                        />
                        Flight Area Check
                        <span
                            v-if='state.plan.computing'
                            class='spinner-border spinner-border-sm ms-auto'
                        />
                    </div>
                    <div
                        v-if='!r'
                        class='aa-sub'
                    >
                        Checking…
                    </div>
                    <template v-else>
                        <div
                            v-for='w in r.warnings'
                            :key='w'
                            class='aa-warn'
                        >
                            <IconAlertTriangle
                                :size='16'
                                class='flex-shrink-0'
                            />
                            <span>{{ w }}</span>
                        </div>
                        <table class='table table-sm mb-0 aa-table'>
                            <tbody>
                                <tr>
                                    <td>UAS Grid</td>
                                    <td>{{ r.uasCells.length ? `${gridCeilings.map((c) => fmtH(c)).join(', ')} (${r.uasCells[0].airport})` : 'None' }}</td>
                                </tr>
                                <tr>
                                    <td>Terrain</td>
                                    <td>{{ r.terrain === 'map' ? `${fmtRel(r.dropFt)} to ${fmtRel(r.riseFt)}` : 'No data' }}</td>
                                </tr>
                                <tr>
                                    <td>Obstacles</td>
                                    <td>
                                        {{ r.obstacles.length }}
                                        <span
                                            v-if='r.obstaclesAbove'
                                            class='text-warning'
                                        >· {{ r.obstaclesAbove }} at your altitude</span>
                                    </td>
                                </tr>
                                <tr v-if='r.tfrs.length'>
                                    <td class='text-danger'>
                                        TFR
                                    </td>
                                    <td class='text-danger'>
                                        {{ r.tfrs.join('; ') }}
                                    </td>
                                </tr>
                                <tr v-if='r.nsufr.length'>
                                    <td class='text-danger'>
                                        UAS No-Fly
                                    </td>
                                    <td class='text-danger'>
                                        {{ r.nsufr.join('; ') }}
                                    </td>
                                </tr>
                                <tr v-if='r.airspace.length'>
                                    <td>Airspace</td>
                                    <td>{{ r.airspace.join('; ') }}</td>
                                </tr>
                                <tr v-if='r.sua.length'>
                                    <td class='text-warning'>
                                        Special Use
                                    </td>
                                    <td>{{ r.sua.join('; ') }}</td>
                                </tr>
                                <tr v-if='r.notams.length'>
                                    <td>NOTAMs</td>
                                    <td>{{ r.notams.slice(0, 10).join('; ') }}<span v-if='r.notams.length > 10'> +{{ r.notams.length - 10 }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                        <div
                            v-for='o in r.obstacles.slice(0, 50)'
                            :key='o.oas'
                            class='aa-obs'
                            :class='{ "aa-obs-above": isAbove(o.topAboveTakeoffFt) }'
                            @click='flyTo(o.lon, o.lat)'
                        >
                            <b>{{ o.type }}</b> {{ fmtH(o.aglFt) }}
                            <span v-if='o.topAboveTakeoffFt !== undefined'>· top {{ fmtRel(o.topAboveTakeoffFt) }}</span>
                            · {{ fmtDist(o.distanceFt) }} {{ compass(o.bearing) }}
                        </div>
                        <div class='aa-sub'>
                            Advisory only. Not an authorization.
                        </div>
                    </template>
                </section>
            </template>

            <TablerButton
                v-if='state.plan.home || state.plan.target'
                class='btn-outline-danger aa-action w-100'
                title='Remove the flight plan from the map'
                @click='clearPlan'
            >
                <IconTrash
                    :size='20'
                    stroke='1'
                    class='me-2'
                />
                Clear Plan
            </TablerButton>
        </div>

        <!-- Settings -->
        <div
            v-else
            class='d-flex flex-column gap-2 px-2'
        >
            <div class='fw-bold'>
                Units
            </div>
            <TablerPillGroup
                v-model='state.settings.units'
                class='aa-pills'
                :options='unitOptions'
                :rounded='false'
                size='default'
                padding=''
                name='air-aware-units'
            />

            <div class='fw-bold mt-2'>
                Map
            </div>
            <label class='d-flex align-items-start gap-3 m-0'>
                <span class='form-switch flex-shrink-0'>
                    <input
                        v-model='state.settings.volumes'
                        class='form-check-input aa-switch'
                        type='checkbox'
                    >
                </span>
                <span class='aa-grow'>Draw TFRs and airspace as 3D volumes (tilt the map)</span>
            </label>
            <label class='d-flex align-items-start gap-3 m-0'>
                <span class='form-switch flex-shrink-0'>
                    <input
                        v-model='state.settings.activeTfrOnly'
                        class='form-check-input aa-switch'
                        type='checkbox'
                    >
                </span>
                <span class='aa-grow'>Only TFRs in effect now</span>
            </label>

            <div class='fw-bold mt-2'>
                Obstacles
            </div>
            <label class='form-label mb-0'>Taller Than ({{ hUnit() }} AGL)</label>
            <input
                v-model.number='obstacleMin'
                type='number'
                min='0'
                step='50'
                class='form-control'
            >
            <div class='small text-secondary'>
                Types (none ticked = all)
            </div>
            <div class='d-flex flex-wrap gap-2'>
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

            <div class='fw-bold mt-2'>
                UAS Flight Planner
            </div>
            <label class='form-label mb-0'>Height Over Terrain ({{ hUnit() }})</label>
            <input
                v-model.number='heightOverTerrain'
                type='number'
                min='0'
                step='10'
                class='form-control'
            >
            <label class='form-label mb-0'>Obstacle Clearance ({{ hUnit() }})</label>
            <input
                v-model.number='separation'
                type='number'
                min='0'
                step='10'
                class='form-control'
            >
            <label class='form-label mb-0'>Corridor Half-Width ({{ hUnit() }})</label>
            <input
                v-model.number='corridor'
                type='number'
                min='25'
                step='25'
                class='form-control'
            >
            <label class='form-label mb-0'>Cruise Speed ({{ sUnit() }})</label>
            <input
                v-model.number='cruise'
                type='number'
                min='1'
                step='1'
                class='form-control'
            >
            <label class='form-label mb-0'>Battery Endurance (min)</label>
            <input
                v-model.number='state.settings.enduranceMin'
                type='number'
                min='1'
                step='1'
                class='form-control'
            >
            <TablerButton
                v-if='!confirmReset'
                class='btn-outline-secondary aa-action w-100 mt-2'
                title='Put every setting back to its default'
                @click='confirmReset = true'
            >
                <IconRefresh
                    :size='20'
                    stroke='1'
                    class='me-2'
                />
                Reset Settings
            </TablerButton>
            <div
                v-else
                class='aa-confirm mt-2'
            >
                <div class='fw-bold mb-2'>
                    Reset All Settings To Defaults?
                </div>
                <div class='d-flex gap-2'>
                    <TablerButton
                        class='btn-outline-secondary aa-action flex-fill'
                        title='Keep the current settings'
                        @click='confirmReset = false'
                    >
                        Cancel
                    </TablerButton>
                    <TablerButton
                        class='btn-danger aa-action flex-fill'
                        title='Reset every setting'
                        @click='reset'
                    >
                        Reset
                    </TablerButton>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed, ref, watch, onMounted } from 'vue';
import { TablerButton, TablerPillGroup } from '@tak-ps/vue-tabler';
import {
    IconAlertTriangle,
    IconCamera,
    IconCheck,
    IconEyeOff,
    IconHome,
    IconListCheck,
    IconMountain,
    IconPointer,
    IconRefresh,
    IconRoute,
    IconTarget,
    IconTrash
} from '@tabler/icons-vue';
import { LAYERS } from './constants.ts';
import { state, DEFAULT_SETTINGS, type Pick } from './store.ts';
import { runtime } from './runtime.ts';
import { clearPlan, computePlan, planShape, pointInfo, PART_107_FT, type PointInfo } from './planner.ts';
import { bearing, compass, distanceM, FT_PER_M } from './geo.ts';
import { dUnit, fmtDist, fmtH, fmtRel, fromD, fromH, fromS, hUnit, metric, sUnit, toD, toH, toS } from './units.ts';
import { planActive } from './layers.ts';

const tabs = [
    { value: 'layers', label: 'Layers' },
    { value: 'plan', label: 'UAS Flight Planner' },
    { value: 'settings', label: 'Settings' }
];
const tab = ref(planActive() ? 'plan' : 'layers');

const OBSTACLE_TYPES = ['TOWER', 'T-L TWR', 'POLE', 'BLDG', 'WINDMILL', 'STACK', 'CRANE', 'CATENARY', 'TANK', 'ANTENNA', 'PLANT', 'RIG', 'BRIDGE', 'DAM', 'ELEVATOR', 'LGTHOUSE', 'MONUMENT', 'SIGN', 'SPIRE', 'UTILITY POLE', 'OTHER'];

const planOn = computed(planActive);
const r = computed(() => state.plan.result);

// ---- operating range (presets in the display units) ----

const rangePresets = computed(() => metric()
    ? [{ v: 0.5, label: '0.5 km' }, { v: 1, label: '1' }, { v: 1.5, label: '1.5' }, { v: 2, label: '2' }, { v: 2.5, label: '2.5' }]
    : [{ v: 0.25, label: '¼ mi' }, { v: 0.5, label: '½' }, { v: 0.75, label: '¾' }, { v: 1, label: '1' }, { v: 1.5, label: '1½' }]);
const rangeOptions = computed(() => [
    ...rangePresets.value.map((o) => ({ value: String(o.v), label: o.label })),
    { value: 'custom', label: 'Custom' }
]);
const rangeNow = (): number => Math.round(toD(state.settings.radiusFt) * 1000) / 1000;
const isRangePreset = (): boolean => rangePresets.value.some((o) => o.v === rangeNow());
const customRange = ref(!isRangePreset());
const customMi = ref<number | undefined>(rangeNow());

const rangeKey = computed({
    get: () => customRange.value ? 'custom' : String(rangeNow()),
    set: (v: string) => {
        if (v === 'custom') {
            customRange.value = true;
            customMi.value = rangeNow();
            return;
        }
        customRange.value = false;
        state.settings.radiusFt = fromD(Number(v));
    }
});

watch(customMi, (v) => {
    if (!customRange.value) return;
    if (typeof v === 'number' && isFinite(v) && v >= 0.05 && v <= 40) state.settings.radiusFt = fromD(v);
});

// ---- target standoff ----

const standoffPresets = computed(() => metric()
    ? [{ v: 0, label: 'Over' }, { v: 75, label: '75 m' }, { v: 150, label: '150' }, { v: 300, label: '300' }, { v: 400, label: '400' }]
    : [{ v: 0, label: 'Over' }, { v: 250, label: '250 ft' }, { v: 500, label: '500' }, { v: 1000, label: '1000' }, { v: 1320, label: '¼ mi' }]);
const standoffOptions = computed(() => [
    ...standoffPresets.value.map((o) => ({ value: String(o.v), label: o.label })),
    { value: 'custom', label: 'Custom' }
]);
const standoffNow = (): number => Math.round(toH(state.settings.standoffFt));
const isStandoffPreset = (): boolean => standoffPresets.value.some((o) => o.v === standoffNow());
const customStandoffOn = ref(!isStandoffPreset());
const customStandoff = ref<number | undefined>(standoffNow());

const standoffKey = computed({
    get: () => customStandoffOn.value ? 'custom' : String(standoffNow()),
    set: (v: string) => {
        if (v === 'custom') {
            customStandoffOn.value = true;
            customStandoff.value = standoffNow();
            return;
        }
        customStandoffOn.value = false;
        state.settings.standoffFt = fromH(Number(v));
    }
});

watch(customStandoff, (v) => {
    if (!customStandoffOn.value) return;
    if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 26400) state.settings.standoffFt = fromH(v);
});

// ---- units ----

const unitOptions = [
    { value: 'imperial', label: 'Imperial' },
    { value: 'metric', label: 'Metric' }
];

/** A setting kept in feet, edited in the display unit. */
function heightModel(key: 'obstacleMinFt' | 'heightAboveTerrainFt' | 'separationFt' | 'corridorFt') {
    return computed({
        get: () => Math.round(toH(state.settings[key])),
        set: (v: number | string) => {
            if (typeof v === 'number' && isFinite(v)) state.settings[key] = fromH(v);
        }
    });
}
const obstacleMin = heightModel('obstacleMinFt');
const heightOverTerrain = heightModel('heightAboveTerrainFt');
const separation = heightModel('separationFt');
const corridor = heightModel('corridorFt');
const cruise = computed({
    get: () => Math.round(toS(state.settings.cruiseMph)),
    set: (v: number | string) => {
        if (typeof v === 'number' && isFinite(v)) state.settings.cruiseMph = fromS(v);
    }
});

// Switching units re-reads every entry box in the new unit.
watch(() => state.settings.units, () => {
    customRange.value = !isRangePreset();
    customMi.value = rangeNow();
    customStandoffOn.value = !isStandoffPreset();
    customStandoff.value = standoffNow();
    const g = state.plan.givenAltitudeAgl;
    given.value = g !== undefined ? Math.round(toH(g)) : undefined;
});

// ---- altitude ----

const modeOptions = [
    { value: 'need', label: 'Recommend' },
    { value: 'given', label: 'Set My Own' }
];
const given = ref<number | undefined>(state.plan.givenAltitudeAgl !== undefined ? Math.round(toH(state.plan.givenAltitudeAgl)) : undefined);
const clampNote = ref(false);

watch(given, (v) => {
    state.plan.givenAltitudeAgl = typeof v === 'number' && isFinite(v) && v > 0 ? fromH(v) : undefined;
});

/** An entered altitude never stands above what the area allows. */
function clampGiven(): void {
    const maxFt = state.plan.result?.allowedMaxAgl;
    clampNote.value = false;
    if (maxFt === undefined) return;
    const max = Math.floor(toH(maxFt));
    if (typeof given.value === 'number' && given.value > max) {
        given.value = max;
        clampNote.value = true;
    }
}

watch(tab, () => {
    confirmReset.value = false;
});

watch(() => state.plan.mode, () => {
    clampNote.value = false;
});

const maxReason = computed(() => {
    const res = r.value;
    if (!res) return '';
    if (res.raisedBy) return `raised to clear ${res.raisedBy === 'obstacle' ? 'an obstacle' : 'terrain'}`;
    if (res.uasCeilingUsedFt !== undefined && res.uasCeilingUsedFt < PART_107_FT) return `${fmtH(res.uasCeilingUsedFt)} UAS grid`;
    return 'Part 107';
});

const gridCeilings = computed(() => [...new Set((r.value?.uasCells || []).map((c) => c.ceilingFt))].sort((a, b) => a - b));

// ---- point summaries ----

const homeInfo = ref<PointInfo | undefined>();
const targetInfo = ref<PointInfo | undefined>();

async function loadInfo(which: 'home' | 'target'): Promise<void> {
    const p = state.plan[which];
    const out = which === 'home' ? homeInfo : targetInfo;
    out.value = undefined;
    if (!p || !runtime.map) return;
    try {
        const info = await pointInfo(runtime.map, p.lon, p.lat);
        if (state.plan[which] === p) out.value = info;
    } catch {
        // The summary simply leaves the numbers out.
    }
}

watch(() => state.plan.home, () => { void loadInfo('home'); });
watch(() => state.plan.target, () => { void loadInfo('target'); });

const targetDistanceFt = computed(() => {
    const h = state.plan.home, t = state.plan.target;
    return h && t ? distanceM([h.lon, h.lat], [t.lon, t.lat]) * FT_PER_M : 0;
});
const targetBearing = computed(() => {
    const h = state.plan.home, t = state.plan.target;
    return h && t ? bearing([h.lon, h.lat], [t.lon, t.lat]) : 0;
});
const targetRel = computed(() => {
    const a = homeInfo.value?.groundFt, b = targetInfo.value?.groundFt;
    return a !== undefined && b !== undefined ? b - a : undefined;
});

// ---- drawing and recalculating ----

// The shapes follow every input at once; the readouts follow once the inputs settle.
watch(() => [
    state.plan.home?.lon, state.plan.home?.lat,
    state.plan.target?.lon, state.plan.target?.lat,
    state.settings.radiusFt, state.settings.standoffFt, state.settings.corridorFt
], () => drawPlan());

let timer: ReturnType<typeof setTimeout> | undefined;
watch(() => [
    state.plan.home?.lon, state.plan.home?.lat,
    state.plan.target?.lon, state.plan.target?.lat,
    state.plan.mode,
    state.plan.givenAltitudeAgl,
    state.settings.radiusFt,
    state.settings.standoffFt,
    state.settings.corridorFt,
    state.settings.heightAboveTerrainFt,
    state.settings.separationFt,
    state.settings.cruiseMph,
    state.settings.enduranceMin,
    state.settings.units,
    state.settings.obstacleTypes.join(','),
    state.settings.activeTfrOnly,
    state.revision
], () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void compute(); }, 250);
});

onMounted(() => {
    if (state.plan.home) void loadInfo('home');
    if (state.plan.target) void loadInfo('target');
    if (planOn.value && !state.plan.result) void compute();
});

function drawPlan(): void {
    runtime.layers?.setPlan(planShape());
}

let seq = 0;

async function compute(): Promise<void> {
    if (!runtime.map || !runtime.layers) return;
    const mine = ++seq;
    if (!planActive()) {
        state.plan.result = undefined;
        state.plan.computing = false;
        runtime.layers.setPlanHazards({ type: 'FeatureCollection', features: [] });
        runtime.layers.setIslands({ type: 'FeatureCollection', features: [] });
        return;
    }
    state.plan.computing = true;
    try {
        const out = await computePlan(runtime.map, runtime.layers);
        if (mine !== seq || !out || !planActive()) return;
        state.plan.result = out.result;
        runtime.layers.setPlanHazards(out.hazards, out.bag);
        runtime.layers.setIslands(out.islands);
    } finally {
        if (mine === seq) state.plan.computing = false;
    }
}

function pickClass(which: 'home' | 'target'): string {
    if (state.plan.picking === which) return 'btn-warning';
    return state.plan[which] ? 'btn-outline-primary' : 'btn-primary';
}

function pick(which: Exclude<Pick, false>): void {
    state.plan.picking = state.plan.picking === which ? false : which;
    if (runtime.map) runtime.map.getCanvas().style.cursor = state.plan.picking ? 'crosshair' : '';
}

/** Work over the takeoff point itself: the target sits on Home. */
function homeAsTarget(): void {
    if (!state.plan.home) return;
    state.plan.picking = false;
    if (runtime.map) runtime.map.getCanvas().style.cursor = '';
    state.plan.target = { ...state.plan.home };
}

function isAbove(top: number | undefined): boolean {
    const alt = state.plan.result?.altitudeAgl;
    return top !== undefined && alt !== undefined && top + state.settings.separationFt > alt;
}

function flyTo(lon: number, lat: number): void {
    runtime.map?.flyTo({ center: [lon, lat], zoom: Math.max(runtime.map.getZoom(), 14) });
}

function fmtLL(p: { lon: number; lat: number }): string {
    return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

function fmtMin(m: number): string {
    if (m < 1) return `${Math.max(1, Math.round(m * 60))} s`;
    return `${m.toFixed(1).replace(/\.0$/, '')} min`;
}

function refresh(): void {
    state.revision++;
}

function allOff(): void {
    for (const k of Object.keys(state.settings.layers) as Array<keyof typeof state.settings.layers>) state.settings.layers[k] = false;
}

const confirmReset = ref(false);

function reset(): void {
    confirmReset.value = false;
    const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    Object.assign(state.settings, d);
    customRange.value = !isRangePreset();
    customStandoffOn.value = !isStandoffPreset();
}
</script>

<style scoped>
.aa-panel {
    font-size: 0.875rem;
    overflow-x: hidden;
    min-width: 0;
}
.aa-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
/* Six labels must fit a 360 px phone without pushing the pane wider. */
.aa-pills :deep(.btn) {
    min-width: 0;
    padding-inline: 0.35rem;
}
.aa-note {
    padding: 8px 10px;
    border-radius: 4px;
    background: rgba(33, 150, 243, 0.15);
    font-size: 0.8rem;
}
.aa-row {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
    cursor: pointer;
}
.aa-grow {
    flex: 1 1 auto;
    min-width: 0;
}
/* Bootstrap pulls a switch left of its .form-check padding; here it sits in the flow. */
.aa-switch {
    width: 2.4em !important;
    height: 1.3em;
    margin: 0.1em 0 0 0 !important;
    float: none !important;
    cursor: pointer;
}
.aa-step {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    margin-bottom: 6px;
}
.aa-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--tblr-secondary, #9aa0ac);
    margin: 8px 0 4px;
}
.aa-sub {
    font-size: 0.8rem;
    color: var(--tblr-secondary, #9aa0ac);
    margin-top: 4px;
}
.aa-big {
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1.2;
}
.aa-gimbal {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(127, 127, 127, 0.1);
    font-size: 0.85rem;
}
.aa-confirm {
    padding: 10px;
    border-radius: 4px;
    border: 1px solid rgba(224, 27, 36, 0.5);
}
.aa-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
}
.aa-stats > div {
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
    border-radius: 4px;
    background: rgba(127, 127, 127, 0.1);
}
.aa-stats span {
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--tblr-secondary, #9aa0ac);
}
.aa-warn {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    color: #ffb300;
    font-size: 0.8rem;
    margin-bottom: 4px;
}
.aa-table td {
    padding: 3px 4px;
    background: transparent;
    font-size: 0.8rem;
    vertical-align: top;
    overflow-wrap: anywhere;
}
.aa-table td:first-child {
    white-space: nowrap;
    color: var(--tblr-secondary, #9aa0ac);
    padding-right: 8px;
}
.aa-obs {
    font-size: 0.78rem;
    padding: 6px 4px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
    cursor: pointer;
}
.aa-obs-above {
    color: #ffb300;
}
@media (pointer: coarse) {
    .aa-action,
    :deep(.btn) {
        min-height: 44px;
    }
}
</style>
