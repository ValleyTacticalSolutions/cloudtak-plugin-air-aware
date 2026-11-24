<template>
    <button
        v-if='state.plan.home || state.plan.target'
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
</template>

<script setup lang='ts'>
import { IconTrash } from '@tabler/icons-vue';
import { state } from './store.ts';
import { clearPlan } from './planner.ts';
</script>
