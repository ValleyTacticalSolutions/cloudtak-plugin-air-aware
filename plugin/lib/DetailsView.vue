<template>
    <div class='aa-details'>
        <div
            v-if='!state.details.length'
            class='text-secondary small p-2'
        >
            Tap a TFR, airspace shelf, grid cell, obstacle, NOTAM or METAR on the map to read it here.
        </div>
        <div
            v-for='(d, i) in state.details'
            :key='i'
            class='aa-card mb-2'
            :style='{ borderLeftColor: d.color || "#888" }'
        >
            <div class='fw-bold'>
                {{ d.title }}
            </div>
            <div
                v-if='d.subtitle'
                class='small text-secondary mb-1'
            >
                {{ d.subtitle }}
            </div>
            <table class='table table-sm mb-1 aa-table'>
                <tbody>
                    <tr
                        v-for='r in d.rows'
                        :key='r.label'
                    >
                        <td class='text-secondary pe-2'>
                            {{ r.label }}
                        </td>
                        <td>
                            <a
                                v-if='r.href'
                                :href='r.href'
                                target='_blank'
                                rel='noopener noreferrer'
                            >{{ r.value }}</a>
                            <span v-else>{{ r.value }}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <pre
                v-if='d.text'
                class='aa-text'
            >{{ d.text }}</pre>
        </div>
        <div
            v-if='state.details.length'
            class='small text-secondary px-1'
        >
            Advisory only: a picture of published data when it reached this device. Not a clearance.
        </div>
    </div>
</template>

<script setup lang='ts'>
import { state } from './store.ts';
</script>

<style scoped>
.aa-details {
    padding: 6px;
}
.aa-card {
    border-left: 4px solid #888;
    padding: 6px 8px;
    background: rgba(127, 127, 127, 0.08);
    border-radius: 4px;
}
.aa-table td {
    padding: 1px 0;
    background: transparent;
    font-size: 0.8rem;
    vertical-align: top;
}
.aa-text {
    white-space: pre-wrap;
    font-size: 0.75rem;
    max-height: 220px;
    overflow: auto;
    margin: 0;
    padding: 4px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
</style>
