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
                v-if='state.here && !planOn'
                class='aa-here mx-2'
            >
                {{ state.here }}
            </div>
            <div
                v-if='planOn'
                class='px-2'
            >
                <TablerInlineAlert
                    severity='info'
                    title='A Flight Plan Is Up'
                    description='The map shows only what overlaps the flight area. Clear the plan on the UAS Flight Planner tab to browse these layers.'
                />
            </div>
            <div>
                <label
                    v-for='l in LAYERS'
                    :key='l.key'
                    class='aa-row form-check form-switch m-0 d-flex align-items-start gap-3'
                >
                    <input
                        v-model='state.settings.layers[l.key]'
                        class='form-check-input aa-switch flex-shrink-0'
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
            class='d-flex flex-column'
        >
            <!-- Step 1: Home -->
            <SlideDownHeader
                v-model='open.home'
                label='1. Home / Takeoff Point'
            >
                <template #icon>
                    <IconHome
                        :size='20'
                        stroke='1'
                        class='me-2'
                    />
                </template>
                <template #right>
                    <IconCheck
                        v-if='state.plan.home'
                        :size='18'
                        class='text-success me-2'
                    />
                </template>
                <div class='d-flex flex-column gap-2 px-2 pt-2 pb-2'>
                    <p class='text-secondary small mb-0'>
                        Where the aircraft takes off. Every height in the plan is above this point, the way the drone's altimeter reads it.
                    </p>
                    <TablerButton
                        class='aa-action w-100'
                        :class='state.plan.picking === "home" ? "btn-warning" : "btn-primary"'
                        title='Tap the map to place Home'
                        @click='pick("home")'
                    >
                        <IconPointer
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                        {{ state.plan.picking === 'home' ? 'Tap The Map…' : (state.plan.home ? 'Move Home On The Map' : 'Tap Map To Set Home') }}
                    </TablerButton>
                    <TablerButton
                        class='btn-outline-primary aa-action w-100'
                        title='Put Home at the center of the map'
                        @click='useCenter("home")'
                    >
                        <IconFocusCentered
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                        Use Map Center
                    </TablerButton>
                </div>
            </SlideDownHeader>
            <div
                v-if='state.plan.home && !open.home'
                class='aa-summary'
                @click='open.home = true'
            >
                {{ fmtLL(state.plan.home) }}
                <template v-if='homeInfo'>
                    <span v-if='homeInfo.groundFt !== undefined'> · Ground {{ Math.round(homeInfo.groundFt).toLocaleString('en-US') }} ft MSL</span>
                    <span v-if='homeInfo.onGrid'> · Grid {{ homeInfo.ceilingFt }} ft</span>
                    <span v-else> · Not on the UAS grid</span>
                </template>
            </div>

            <!-- Step 2: Target -->
            <template v-if='state.plan.home'>
                <SlideDownHeader
                    v-model='open.target'
                    label='2. Target / Area Of Interest'
                >
                    <template #icon>
                        <IconTarget
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                    </template>
                    <template #right>
                        <IconCheck
                            v-if='state.plan.target'
                            :size='18'
                            class='text-success me-2'
                        />
                    </template>
                    <div class='d-flex flex-column gap-2 px-2 pt-2 pb-2'>
                        <p class='text-secondary small mb-0'>
                            What you need to see. The aircraft flies out to a standoff point short of it, and the plan checks that corridor and the area around the target.
                        </p>
                        <TablerButton
                            class='aa-action w-100'
                            :class='state.plan.picking === "target" ? "btn-warning" : "btn-primary"'
                            title='Tap the map to place the target'
                            @click='pick("target")'
                        >
                            <IconPointer
                                :size='20'
                                stroke='1'
                                class='me-2'
                            />
                            {{ state.plan.picking === 'target' ? 'Tap The Map…' : (state.plan.target ? 'Move Target On The Map' : 'Tap Map To Set Target') }}
                        </TablerButton>
                        <TablerButton
                            class='btn-outline-primary aa-action w-100'
                            title='Put the target at the center of the map'
                            @click='useCenter("target")'
                        >
                            <IconFocusCentered
                                :size='20'
                                stroke='1'
                                class='me-2'
                            />
                            Use Map Center
                        </TablerButton>
                    </div>
                </SlideDownHeader>
                <div
                    v-if='state.plan.target && !open.target'
                    class='aa-summary'
                    @click='open.target = true'
                >
                    {{ fmtDist(targetDistanceFt) }} {{ compass(targetBearing) }} of Home ({{ Math.round(targetBearing) }}°)
                    <span v-if='targetRel !== undefined'> · Ground {{ fmtRel(targetRel) }} vs Home</span>
                    <span v-if='targetInfo?.onGrid'> · Grid {{ targetInfo.ceilingFt }} ft</span>
                </div>
            </template>

            <template v-if='planOn'>
                <!-- Step 3: Mission profile -->
                <SlideDownHeader
                    v-model='open.mission'
                    label='3. Mission Profile'
                >
                    <template #icon>
                        <IconRoute
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                    </template>
                    <div class='d-flex flex-column gap-2 px-2 pt-2 pb-2'>
                        <div class='form-label mb-0'>
                            Operating Range From Home
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
                            class='input-group'
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

                        <div class='form-label mb-0 mt-1'>
                            Target Standoff
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
                            class='input-group'
                        >
                            <input
                                v-model.number='customStandoff'
                                type='number'
                                min='0'
                                max='26400'
                                step='50'
                                class='form-control'
                                placeholder='Standoff'
                            >
                            <span class='input-group-text'>ft</span>
                        </div>
                        <p class='text-secondary small mb-0'>
                            How far from the target the aircraft holds. The plan covers a {{ fmtDist(state.settings.corridorFt * 2) }} wide corridor out to that point and a ring around the target.
                        </p>

                        <table
                            v-if='r'
                            class='table table-sm mb-0 aa-table'
                        >
                            <tbody>
                                <tr>
                                    <td>Home To Target</td>
                                    <td>{{ fmtDist(r.targetDistanceFt) }} {{ compass(r.targetBearing) }}</td>
                                </tr>
                                <tr>
                                    <td>Home To Standoff</td>
                                    <td>{{ fmtDist(r.standoffDistanceFt) }}</td>
                                </tr>
                                <tr>
                                    <td>Furthest Point</td>
                                    <td :class='r.maxReachFt > state.settings.radiusFt ? "text-warning" : ""'>
                                        {{ fmtDist(r.maxReachFt) }} from Home
                                        <span v-if='r.maxReachFt > state.settings.radiusFt'>· past your range</span>
                                    </td>
                                </tr>
                                <tr v-if='r.slantRangeFt !== undefined'>
                                    <td>Slant Range To Target</td>
                                    <td>{{ fmtDist(r.slantRangeFt) }}</td>
                                </tr>
                                <tr v-if='r.transitMin !== undefined'>
                                    <td>Transit Each Way</td>
                                    <td>{{ fmtMin(r.transitMin) }} at {{ state.settings.cruiseMph }} mph</td>
                                </tr>
                                <tr v-if='r.onStationMin !== undefined'>
                                    <td>Time On Station</td>
                                    <td :class='r.onStationMin <= 0 ? "text-danger" : ""'>
                                        {{ r.onStationMin > 0 ? fmtMin(r.onStationMin) : 'None' }}
                                        <span class='text-secondary'>({{ state.settings.enduranceMin }} min battery, 20% reserve)</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </SlideDownHeader>

                <!-- Step 4: Altitude -->
                <SlideDownHeader
                    v-model='open.altitude'
                    label='4. Altitude'
                >
                    <template #icon>
                        <IconMountain
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                    </template>
                    <template #right>
                        <span
                            v-if='r?.altitudeAgl !== undefined'
                            class='small fw-bold me-2'
                        >{{ r.altitudeAgl }} ft</span>
                    </template>
                    <div class='d-flex flex-column gap-2 px-2 pt-2 pb-2'>
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
                            class='input-group'
                        >
                            <input
                                v-model.number='given'
                                type='number'
                                min='0'
                                :max='r?.allowedMaxAgl'
                                step='10'
                                class='form-control'
                                placeholder='Altitude'
                                @change='clampGiven'
                            >
                            <span class='input-group-text'>ft above Home</span>
                        </div>

                        <template v-if='r'>
                            <div
                                v-if='r.altitudeAgl !== undefined'
                                class='aa-big'
                            >
                                Fly At {{ r.altitudeAgl }} ft
                                <span class='small fw-normal text-secondary'>above Home</span>
                            </div>
                            <TablerInlineAlert
                                v-if='r.clamped || clampNote'
                                severity='warning'
                                :title='`Lowered To ${r.allowedMaxAgl} ft`'
                                :description='r.raisedBy ? "That is as high as clearing the terrain and obstacles needs." : "That is the legal maximum over this flight area."'
                            />
                            <TablerInlineAlert
                                v-if='r.raisedBy && r.altitudeAgl !== undefined && r.altitudeAgl > (r.maxAltitudeAgl ?? 0)'
                                severity='info'
                                :title='`Above The ${r.maxAltitudeAgl} ft Limit To Clear ${r.raisedBy === "obstacle" ? "An Obstacle" : "Terrain"}`'
                                description='Allowed up to what clearing the highest terrain or obstacle needs, and no higher.'
                            />
                            <table class='table table-sm mb-0 aa-table'>
                                <tbody>
                                    <tr>
                                        <td>Legal Maximum</td>
                                        <td>
                                            {{ r.maxAltitudeAgl }} ft
                                            <span class='text-secondary'>
                                                ({{ r.uasCeilingUsedFt !== undefined && r.uasCeilingUsedFt < 400 ? `lowest UAS grid ${r.capFt} ft` : 'Part 107, 400 ft' }}<template v-if='r.dropFt && Math.round(r.dropFt) < 0'>, less {{ Math.abs(Math.round(r.dropFt)) }} ft where the ground drops below Home</template>)
                                            </span>
                                        </td>
                                    </tr>
                                    <tr v-if='r.floorAgl !== undefined'>
                                        <td>Terrain Needs</td>
                                        <td>
                                            {{ r.floorAgl }} ft
                                            <span class='text-secondary'>(highest ground {{ fmtRel(r.riseFt) }} + {{ state.settings.heightAboveTerrainFt }} ft)</span>
                                        </td>
                                    </tr>
                                    <tr v-if='r.obstacleNeedAgl !== undefined'>
                                        <td>Obstacles Need</td>
                                        <td>
                                            {{ r.obstacleNeedAgl }} ft
                                            <span class='text-secondary'>(tallest top + {{ state.settings.separationFt }} ft)</span>
                                        </td>
                                    </tr>
                                    <tr v-if='r.tooHighPct !== undefined'>
                                        <td>Clearance</td>
                                        <td :class='r.tooHighPct > 0 ? "text-warning" : "text-success"'>
                                            {{ r.tooHighPct > 0 ? `${r.tooHighPct}% of the area is too high (red on the map)` : `Holds ${state.settings.heightAboveTerrainFt} ft over all ground` }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </template>
                    </div>
                </SlideDownHeader>

                <!-- Step 5: Flight area check -->
                <SlideDownHeader
                    v-model='open.check'
                    label='5. Flight Area Check'
                >
                    <template #icon>
                        <IconListCheck
                            :size='20'
                            stroke='1'
                            class='me-2'
                        />
                    </template>
                    <template #right>
                        <span
                            v-if='state.plan.computing'
                            class='spinner-border spinner-border-sm me-2'
                        />
                        <IconAlertTriangle
                            v-else-if='r && r.warnings.length'
                            :size='18'
                            class='text-warning me-2'
                        />
                    </template>
                    <div
                        v-if='r'
                        class='d-flex flex-column gap-2 px-2 pt-2 pb-2'
                    >
                        <TablerInlineAlert
                            v-for='w in r.warnings'
                            :key='w'
                            severity='warning'
                            :title='w'
                        />
                        <p class='text-secondary small mb-0'>
                            Only what overlaps the flight area is listed and drawn.
                        </p>
                        <table class='table table-sm mb-0 aa-table'>
                            <tbody>
                                <tr>
                                    <td>UAS Grid</td>
                                    <td>
                                        <template v-if='r.uasCells.length'>
                                            {{ gridCeilings.join(', ') }} ft
                                            <span class='text-secondary'>· {{ r.uasCeilingUsedFt }} ft used ({{ r.uasCells[0].airport }})</span>
                                        </template>
                                        <span v-else>Not on the grid (no LAANC ceiling here; check airspace class)</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>Terrain</td>
                                    <td>
                                        <span v-if='r.terrain === "map"'>{{ fmtRel(r.dropFt) }} to {{ fmtRel(r.riseFt) }} from Home</span>
                                        <span v-else>No data</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>Obstacles</td>
                                    <td>
                                        {{ r.obstacles.length }}
                                        <span
                                            v-if='r.obstaclesAbove'
                                            class='text-warning'
                                        >· {{ r.obstaclesAbove }} reach your altitude (with {{ state.settings.separationFt }} ft clearance)</span>
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
                                    <td>{{ r.notams.slice(0, 20).join('; ') }}<span v-if='r.notams.length > 20'> and {{ r.notams.length - 20 }} more</span></td>
                                </tr>
                                <tr v-if='r.terrainSource'>
                                    <td>Terrain Data</td>
                                    <td>{{ r.terrainSource }}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div v-if='r.obstacles.length'>
                            <div class='fw-bold small mb-1'>
                                Obstacles, Nearest Home First
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
                                <span v-if='o.topAboveTakeoffFt !== undefined'>· top {{ fmtRel(o.topAboveTakeoffFt) }} from Home</span>
                                · {{ lightingName(o.lighting) }}
                                · {{ fmtDist(o.distanceFt) }} {{ compass(o.bearing) }}
                            </div>
                        </div>
                        <p class='text-secondary small mb-0'>
                            Advisory only: a picture of published data when it reached this device. Not a clearance or an authorization.
                        </p>
                    </div>
                    <div
                        v-else
                        class='text-secondary small px-2 py-2'
                    >
                        Checking the flight area…
                    </div>
                </SlideDownHeader>
            </template>

            <div
                v-if='state.plan.home || state.plan.target'
                class='px-2 pt-3'
            >
                <TablerButton
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
        </div>

        <!-- Settings -->
        <div
            v-else
            class='d-flex flex-column gap-2 px-2'
        >
            <div class='fw-bold'>
                Map
            </div>
            <label class='form-check form-switch m-0'>
                <input
                    v-model='state.settings.volumes'
                    class='form-check-input aa-switch'
                    type='checkbox'
                >
                <span class='form-check-label ms-2'>Draw TFRs and airspace as 3D volumes (tilt the map)</span>
            </label>
            <label class='form-check form-switch m-0'>
                <input
                    v-model='state.settings.activeTfrOnly'
                    class='form-check-input aa-switch'
                    type='checkbox'
                >
                <span class='form-check-label ms-2'>Only TFRs in effect now</span>
            </label>

            <div class='fw-bold mt-2'>
                Obstacles
            </div>
            <label class='form-label mb-0'>Taller Than (ft AGL)</label>
            <input
                v-model.number='state.settings.obstacleMinFt'
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
            <label class='form-label mb-0'>Height To Hold Over Terrain (ft)</label>
            <input
                v-model.number='state.settings.heightAboveTerrainFt'
                type='number'
                min='0'
                step='10'
                class='form-control'
            >
            <label class='form-label mb-0'>Clearance Over Obstacles (ft)</label>
            <input
                v-model.number='state.settings.separationFt'
                type='number'
                min='0'
                step='10'
                class='form-control'
            >
            <label class='form-label mb-0'>Corridor Half-Width (ft)</label>
            <input
                v-model.number='state.settings.corridorFt'
                type='number'
                min='25'
                step='25'
                class='form-control'
            >
            <label class='form-label mb-0'>Cruise Speed (mph)</label>
            <input
                v-model.number='state.settings.cruiseMph'
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
                class='btn-outline-secondary aa-action w-100 mt-2'
                title='Put every setting back to its default'
                @click='reset'
            >
                <IconRefresh
                    :size='20'
                    stroke='1'
                    class='me-2'
                />
                Reset Settings
            </TablerButton>
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { TablerButton, TablerInlineAlert, TablerPillGroup } from '@tak-ps/vue-tabler';
import {
    IconAlertTriangle,
    IconCheck,
    IconEyeOff,
    IconFocusCentered,
    IconHome,
    IconListCheck,
    IconMountain,
    IconPointer,
    IconRefresh,
    IconRoute,
    IconTarget,
    IconTrash
} from '@tabler/icons-vue';
import SlideDownHeader from '../../../src/components/CloudTAK/util/SlideDownHeader.vue';
import { LAYERS } from './constants.ts';
import { state, DEFAULT_SETTINGS, type Pick } from './store.ts';
import { runtime } from './runtime.ts';
import { computePlan, planShape, pointInfo, type PointInfo } from './planner.ts';
import { bearing, compass, distanceM, fmtDist, fmtRel, FT_PER_M } from './geo.ts';
import { lightingName, planActive } from './layers.ts';

const tabs = [
    { value: 'layers', label: 'Layers' },
    { value: 'plan', label: 'UAS Flight Planner' },
    { value: 'settings', label: 'Settings' }
];
const tab = ref('layers');

const OBSTACLE_TYPES = ['TOWER', 'T-L TWR', 'POLE', 'BLDG', 'WINDMILL', 'STACK', 'CRANE', 'CATENARY', 'TANK', 'ANTENNA', 'PLANT', 'RIG', 'BRIDGE', 'DAM', 'ELEVATOR', 'LGTHOUSE', 'MONUMENT', 'SIGN', 'SPIRE', 'UTILITY POLE', 'OTHER'];

const planOn = computed(planActive);
const r = computed(() => state.plan.result);

// ---- step sections ----

const open = reactive({
    home: !state.plan.home,
    target: Boolean(state.plan.home && !state.plan.target),
    mission: true,
    altitude: true,
    check: true
});

watch(() => state.plan.home, (h, was) => {
    if (h && !was) {
        open.home = false;
        if (!state.plan.target) open.target = true;
    }
});

watch(() => state.plan.target, (t, was) => {
    if (t && !was) {
        open.target = false;
        open.mission = open.altitude = open.check = true;
    }
});

// ---- operating range ----

const RANGES = [0.25, 0.5, 0.75, 1, 1.5];
const rangeOptions = [
    { value: '0.25', label: '¼ mi' },
    { value: '0.5', label: '½' },
    { value: '0.75', label: '¾' },
    { value: '1', label: '1' },
    { value: '1.5', label: '1½' },
    { value: 'custom', label: 'Custom' }
];
const rangeMi = (): number => Math.round((state.settings.radiusFt / 5280) * 1000) / 1000;
const customRange = ref(!RANGES.includes(rangeMi()));
const customMi = ref<number | undefined>(rangeMi());

const rangeKey = computed({
    get: () => customRange.value ? 'custom' : String(rangeMi()),
    set: (v: string) => {
        if (v === 'custom') {
            customRange.value = true;
            customMi.value = rangeMi();
            return;
        }
        customRange.value = false;
        state.settings.radiusFt = Number(v) * 5280;
    }
});

watch(customMi, (v) => {
    if (!customRange.value) return;
    if (typeof v === 'number' && isFinite(v) && v >= 0.05 && v <= 25) state.settings.radiusFt = v * 5280;
});

// ---- target standoff ----

const STANDOFFS = [0, 250, 500, 1000, 1320];
const standoffOptions = [
    { value: '0', label: 'Overhead' },
    { value: '250', label: '250 ft' },
    { value: '500', label: '500' },
    { value: '1000', label: '1000' },
    { value: '1320', label: '¼ mi' },
    { value: 'custom', label: 'Custom' }
];
const customStandoffOn = ref(!STANDOFFS.includes(state.settings.standoffFt));
const customStandoff = ref<number | undefined>(state.settings.standoffFt);

const standoffKey = computed({
    get: () => customStandoffOn.value ? 'custom' : String(state.settings.standoffFt),
    set: (v: string) => {
        if (v === 'custom') {
            customStandoffOn.value = true;
            customStandoff.value = state.settings.standoffFt;
            return;
        }
        customStandoffOn.value = false;
        state.settings.standoffFt = Number(v);
    }
});

watch(customStandoff, (v) => {
    if (!customStandoffOn.value) return;
    if (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 26400) state.settings.standoffFt = v;
});

// ---- altitude ----

const modeOptions = [
    { value: 'need', label: 'Recommend' },
    { value: 'given', label: 'Set My Own' }
];
const given = ref<number | undefined>(state.plan.givenAltitudeAgl);
const clampNote = ref(false);

watch(given, (v) => {
    state.plan.givenAltitudeAgl = typeof v === 'number' && isFinite(v) && v > 0 ? v : undefined;
});

/** An entered altitude never stands above the legal maximum for the area. */
function clampGiven(): void {
    const max = state.plan.result?.allowedMaxAgl;
    clampNote.value = false;
    if (typeof given.value === 'number' && max !== undefined && given.value > max) {
        given.value = max;
        clampNote.value = true;
    }
}

watch(() => state.plan.mode, () => {
    clampNote.value = false;
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
    if (!planActive()) {
        clearResult();
        return;
    }
    const mine = ++seq;
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

function clearResult(): void {
    seq++;
    state.plan.result = undefined;
    state.plan.computing = false;
    runtime.layers?.setPlanHazards({ type: 'FeatureCollection', features: [] });
    runtime.layers?.setIslands({ type: 'FeatureCollection', features: [] });
}

function pick(which: Exclude<Pick, false>): void {
    state.plan.picking = state.plan.picking === which ? false : which;
    if (runtime.map) runtime.map.getCanvas().style.cursor = state.plan.picking ? 'crosshair' : '';
}

function useCenter(which: 'home' | 'target'): void {
    if (!runtime.map) return;
    const c = runtime.map.getCenter();
    state.plan.picking = false;
    runtime.map.getCanvas().style.cursor = '';
    state.plan[which] = { lon: c.lng, lat: c.lat };
}

function clearPlan(): void {
    state.plan.home = undefined;
    state.plan.target = undefined;
    state.plan.picking = false;
    if (runtime.map) runtime.map.getCanvas().style.cursor = '';
    clearResult();
    drawPlan();
    open.home = true;
    open.target = false;
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

function reset(): void {
    const d = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    Object.assign(state.settings, d);
    customRange.value = false;
    customStandoffOn.value = false;
}
</script>

<style scoped>
.aa-panel {
    font-size: 0.875rem;
}
.aa-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
/* Six labels must fit a 360 px phone without pushing the pane wider. */
.aa-pills :deep(.btn) {
    min-width: 0;
    padding-inline: 0.4rem;
}
.aa-here {
    padding: 8px 10px;
    border-radius: 4px;
    background: rgba(33, 150, 243, 0.15);
    font-size: 0.8rem;
}
.aa-row {
    padding: 10px 8px 10px 8px;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
    cursor: pointer;
}
.aa-switch {
    width: 2.4em;
    height: 1.3em;
    margin-left: 0;
    margin-top: 0.1em;
    float: none;
}
.aa-summary {
    padding: 0 10px 8px 38px;
    font-size: 0.8rem;
    color: var(--tblr-secondary, #9aa0ac);
    cursor: pointer;
}
.aa-big {
    font-size: 1.25rem;
    font-weight: 700;
}
.aa-table td {
    padding: 3px 4px;
    background: transparent;
    font-size: 0.8rem;
    vertical-align: top;
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
