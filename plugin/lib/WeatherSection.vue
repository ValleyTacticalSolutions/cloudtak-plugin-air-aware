<template>
    <section>
        <div class='aa-wx-head'>
            <IconCloud
                :size='18'
                stroke='1.5'
            />
            Weather
            <span
                v-if='w.loading'
                class='spinner-border spinner-border-sm'
            />
            <span
                v-if='wxChecks.length'
                class='aa-wx-badge ms-auto'
                :class='`aa-wx-${overall}`'
            >{{ BADGES[overall] }}</span>
        </div>

        <div
            v-if='w.error'
            class='aa-wx-note text-warning'
        >
            {{ w.error }}
        </div>

        <div
            v-if='w.station'
            class='aa-wx-note'
        >
            {{ w.station.row.icaoId }} · {{ wxFormat.vis(w.station.distanceMi) }} from Home<template v-if='ageMin !== undefined'>
                · {{ Math.round(ageMin) }} min old
            </template><template v-if='w.station.row.fltCat'>
                · {{ w.station.row.fltCat }}
            </template><template v-if='w.edited'>
                · <span class='text-warning'>edited by hand</span>
            </template>
        </div>

        <div
            v-for='c in wxChecks'
            :key='c.key'
            class='aa-wx-row'
            :class='`aa-wx-row-${c.level}`'
        >
            <component
                :is='ICONS[c.level]'
                :size='16'
                class='flex-shrink-0 aa-wx-icon'
            />
            <span class='aa-wx-label'>{{ c.label }}</span>
            <span class='aa-wx-value'>
                <b>{{ c.value }}</b>
                <span
                    v-if='c.note'
                    class='d-block'
                >{{ c.note }}</span>
            </span>
        </div>

        <div class='d-flex gap-2 mt-2'>
            <TablerButton
                class='btn-outline-primary aa-wx-action flex-fill'
                title='Fetch the latest report; replaces values typed in'
                :disabled='w.loading'
                @click='loadWeather(true)'
            >
                <IconRefresh
                    :size='18'
                    stroke='1'
                    class='me-2'
                />
                Refresh
            </TablerButton>
            <TablerButton
                class='btn-outline-secondary aa-wx-action flex-fill'
                title='Change the station or the values'
                @click='editing = !editing'
            >
                <IconPencil
                    :size='18'
                    stroke='1'
                    class='me-2'
                />
                {{ editing ? 'Done' : 'Edit' }}
            </TablerButton>
        </div>

        <div
            v-if='editing'
            class='mt-2'
        >
            <template v-if='w.stations.length'>
                <label class='form-label mb-0'>Station</label>
                <select
                    class='form-select'
                    :value='w.station?.row.icaoId'
                    @change='useStation(($event.target as HTMLSelectElement).value)'
                >
                    <option
                        v-for='s in w.stations'
                        :key='s.row.icaoId'
                        :value='s.row.icaoId'
                    >
                        {{ s.row.icaoId }} · {{ wxFormat.vis(s.distanceMi) }}{{ s.row.name ? ` · ${s.row.name}` : '' }}
                    </option>
                </select>
            </template>
            <label class='form-label mb-0 mt-1'>Conditions</label>
            <select
                class='form-select'
                :value='w.values.sky ?? ""'
                @change='setSky(($event.target as HTMLSelectElement).value)'
            >
                <option value=''>
                    Unknown
                </option>
                <option
                    v-for='(label, key) in SKY_LABELS'
                    :key='key'
                    :value='key'
                >
                    {{ label }}
                </option>
            </select>
            <div class='aa-wx-grid'>
                <label
                    v-for='field in fields'
                    :key='field.key'
                    class='m-0'
                >
                    <span class='form-label mb-0'>{{ field.label }}</span>
                    <input
                        type='number'
                        step='any'
                        class='form-control'
                        :value='shown(field)'
                        :placeholder='field.key === "ceilingFt" && w.values.noCeiling ? "None" : ""'
                        @change='setValue(field, ($event.target as HTMLInputElement).value)'
                    >
                </label>
            </div>
        </div>

        <div
            v-if='w.station?.row.rawOb'
            class='aa-wx-raw'
        >
            {{ w.station.row.rawOb }}
        </div>
        <div class='aa-wx-note'>
            Surface report at the station. Wind aloft and cloud height at your site can differ.
        </div>
    </section>
</template>

<script setup lang='ts'>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { TablerButton } from '@tak-ps/vue-tabler';
import {
    IconAlertTriangle,
    IconCircleCheck,
    IconCircleX,
    IconCloud,
    IconPencil,
    IconRefresh
} from '@tabler/icons-vue';
import { state } from './store.ts';
import { fromH, hUnit, metric, sUnit, fromS, toH, toS } from './units.ts';
import { SKY_LABELS, worst, type Level, type Sky, type WxValues } from './wx.ts';
import { ageMin, KM_PER_MI, loadWeather, now, useStation, wxChecks, wxFormat } from './weather.ts';

const BADGES: Record<Level, string> = { ok: 'Within Limits', warn: 'Caution', fail: 'Out Of Limits' };
const ICONS = { ok: IconCircleCheck, warn: IconAlertTriangle, fail: IconCircleX };

const w = computed(() => state.weather);
const overall = computed(() => worst(wxChecks.value));
const editing = ref(false);

type NumberKey = 'windMph' | 'windDirDeg' | 'gustMph' | 'tempF' | 'dewF' | 'visSm' | 'ceilingFt';

interface Field {
    key: NumberKey;
    label: string;
    to(v: number): number;
    from(v: number): number;
}

const same = (v: number): number => v;
const temp = {
    to: (f: number): number => metric() ? (f - 32) * 5 / 9 : f,
    from: (v: number): number => metric() ? v * 9 / 5 + 32 : v
};

const fields = computed((): Field[] => [
    { key: 'windMph', label: `Wind (${sUnit()})`, to: toS, from: fromS },
    { key: 'windDirDeg', label: 'Wind From (°)', to: same, from: same },
    { key: 'gustMph', label: `Gusts (${sUnit()})`, to: toS, from: fromS },
    { key: 'visSm', label: `Visibility (${metric() ? 'km' : 'mi'})`, to: (v) => metric() ? v * KM_PER_MI : v, from: (v) => metric() ? v / KM_PER_MI : v },
    { key: 'tempF', label: `Temp (${metric() ? '°C' : '°F'})`, ...temp },
    { key: 'dewF', label: `Dew Point (${metric() ? '°C' : '°F'})`, ...temp },
    { key: 'ceilingFt', label: `Ceiling (${hUnit()})`, to: toH, from: fromH }
]);

function shown(field: Field): number | '' {
    const v = state.weather.values[field.key];
    return v === undefined ? '' : Math.round(field.to(v) * 10) / 10;
}

function setValue(field: Field, text: string): void {
    const n = text.trim() === '' ? undefined : Number(text);
    if (n !== undefined && !Number.isFinite(n)) return;
    const patch: WxValues = { [field.key]: n === undefined ? undefined : field.from(n) };
    if (field.key === 'visSm') patch.visPlus = false;
    if (field.key === 'ceilingFt') patch.noCeiling = false;
    if (field.key === 'windDirDeg') patch.windVariable = false;
    state.weather.values = { ...state.weather.values, ...patch };
    state.weather.edited = true;
}

function setSky(v: string): void {
    state.weather.values = { ...state.weather.values, sky: (v || undefined) as Sky | undefined, thunder: undefined, freezing: false };
    state.weather.edited = true;
}

watch(() => [state.plan.home?.lat, state.plan.home?.lon], () => { void loadWeather(); });

let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
    now.value = Date.now();
    clock = setInterval(() => { now.value = Date.now(); }, 60_000);
    void loadWeather();
});
onUnmounted(() => {
    if (clock) clearInterval(clock);
});
</script>

<style scoped>
.aa-wx-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    margin-bottom: 6px;
}
.aa-wx-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    text-transform: uppercase;
}
.aa-wx-ok { background: #2f9e44; color: #fff; }
.aa-wx-warn { background: #ffb300; color: #000; }
.aa-wx-fail { background: #e01b24; color: #fff; }
.aa-wx-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 6px;
    font-size: 0.8rem;
    border-bottom: 1px solid rgba(127, 127, 127, 0.15);
}
.aa-wx-row-ok .aa-wx-icon { color: #2f9e44; }
.aa-wx-row-warn { background: rgba(255, 179, 0, 0.15); }
.aa-wx-row-warn .aa-wx-icon { color: #ffb300; }
.aa-wx-row-fail { background: rgba(224, 27, 36, 0.2); }
.aa-wx-row-fail .aa-wx-icon { color: #ff4d55; }
.aa-wx-label {
    flex: 0 0 7.5em;
    color: var(--tblr-secondary, #9aa0ac);
}
.aa-wx-value {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
}
.aa-wx-note {
    font-size: 0.8rem;
    color: var(--tblr-secondary, #9aa0ac);
    margin: 4px 0;
}
.aa-wx-raw {
    font-family: monospace;
    font-size: 0.72rem;
    margin-top: 6px;
    overflow-wrap: anywhere;
}
.aa-wx-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 6px;
}
.aa-wx-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
@media (pointer: coarse) {
    .aa-wx-action { min-height: 44px; }
}
</style>
