<template>
    <div
        v-if='state.plan.home || state.plan.target'
        class='d-inline-flex align-items-center gap-1'
    >
        <button
            type='button'
            class='btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1'
            title='Restart Flight Plan'
            aria-label='Restart Flight Plan'
            @click='startPlan'
        >
            <IconRefresh
                :size='16'
                stroke='1'
            />
            <span>Restart Flight Plan</span>
        </button>
        <button
            type='button'
            class='btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1'
            title='Clear Plan'
            aria-label='Clear Plan'
            @click='clearPlan'
        >
            <IconTrash
                :size='16'
                stroke='1'
            />
            <span>Clear Plan</span>
        </button>
    </div>
</template>

<script setup lang='ts'>
import { IconRefresh, IconTrash } from '@tabler/icons-vue';
import { state } from './store.ts';
import { clearPlan, startPlan } from './planner.ts';
</script>
