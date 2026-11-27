<template>
    <div class='d-flex flex-column gap-2'>
        <div class='fw-bold mt-2'>
            Weather Alarms
        </div>
        <div class='small text-secondary'>
            The planner flags weather outside these limits. Leave a box empty to switch that alarm off.
        </div>
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
                placeholder='Off'
                :value='shown(field)'
                @change='setLimit(field, ($event.target as HTMLInputElement).value)'
            >
        </label>
        <label
            v-for='t in toggles'
            :key='t.key'
            class='d-flex align-items-start gap-3 m-0'
        >
            <span class='form-switch flex-shrink-0'>
                <input
                    v-model='state.settings.weather[t.key]'
                    class='form-check-input aa-wx-switch'
                    type='checkbox'
                >
            </span>
            <span>{{ t.label }}</span>
        </label>
        <div class='small text-secondary'>
            Thunderstorms and freezing precipitation always alarm. A low temperature / dew point
            spread is out of limits at {{ wxFormat.temp(ICING_TEMP_F) }} or colder.
        </div>
    </div>
</template>

<script setup lang='ts'>
import { computed } from 'vue';
import { state } from './store.ts';
import { fromH, fromS, hUnit, metric, sUnit, toH, toS } from './units.ts';
import { ICING_TEMP_F, type WxLimits } from './wx.ts';
import { KM_PER_MI, wxFormat } from './weather.ts';

type NumberKey = { [K in keyof WxLimits]: WxLimits[K] extends boolean ? never : K }[keyof WxLimits];

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
const delta = {
    to: (f: number): number => metric() ? f * 5 / 9 : f,
    from: (v: number): number => metric() ? v * 9 / 5 : v
};
const miles = {
    to: (v: number): number => metric() ? v * KM_PER_MI : v,
    from: (v: number): number => metric() ? v / KM_PER_MI : v
};

const fields = computed((): Field[] => {
    const deg = metric() ? '°C' : '°F';
    const dist = metric() ? 'km' : 'mi';
    return [
        { key: 'maxWindMph', label: `Max Wind (${sUnit()})`, to: toS, from: fromS },
        { key: 'maxGustMph', label: `Max Gusts (${sUnit()})`, to: toS, from: fromS },
        { key: 'minTempF', label: `Min Temperature (${deg})`, ...temp },
        { key: 'maxTempF', label: `Max Temperature (${deg})`, ...temp },
        { key: 'minSpreadF', label: `Min Temp / Dew Point Spread (${deg})`, ...delta },
        { key: 'minVisSm', label: `Min Visibility (${dist})`, ...miles },
        { key: 'minCeilingFt', label: `Min Ceiling (${hUnit()})`, to: toH, from: fromH },
        { key: 'cloudClearanceFt', label: `Min Distance Below Clouds (${hUnit()})`, to: toH, from: fromH },
        { key: 'maxAgeMin', label: 'Max Report Age (min)', to: same, from: same },
        { key: 'maxStationMi', label: `Max Station Distance (${dist})`, ...miles }
    ];
});

const toggles = [
    { key: 'alarmRain', label: 'Alarm on rain' },
    { key: 'alarmSnow', label: 'Alarm on snow or ice' },
    { key: 'alarmCloudy', label: 'Caution when cloudy' }
] as const;

function shown(field: Field): number | '' {
    const v = state.settings.weather[field.key];
    return v === null ? '' : Math.round(field.to(v) * 10) / 10;
}

function setLimit(field: Field, text: string): void {
    const n = text.trim() === '' ? null : Number(text);
    if (n !== null && !Number.isFinite(n)) return;
    state.settings.weather[field.key] = n === null ? null : field.from(n);
}
</script>

<style scoped>
.aa-wx-switch {
    width: 2.4em !important;
    height: 1.3em;
    margin: 0.1em 0 0 0 !important;
    float: none !important;
    cursor: pointer;
}
</style>
