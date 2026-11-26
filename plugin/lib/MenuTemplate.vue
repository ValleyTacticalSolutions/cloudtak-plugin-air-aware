<!--
    Menu frame matching CloudTAK's own MenuTemplate, which a runtime bundle cannot import.
    Narrow screens get the swipeable sheet; wider ones the side menu.
-->
<template>
    <TablerModal
        v-if='isMobile'
        v-model:height='sheetHeight'
        size='xl'
        swipeable
        :min-height='0.5'
        @close='router.push("/")'
    >
        <div class='air-aware-sheet w-100 d-flex flex-column overflow-hidden'>
            <div
                class='modal-header d-flex align-items-center py-2 px-2 flex-shrink-0'
                data-modal-swipe
            >
                <div class='modal-title flex-grow-1 px-1'>
                    {{ name }}
                </div>
                <div class='btn-list align-items-center flex-nowrap'>
                    <slot name='buttons' />
                    <TablerIconButton
                        title='Close Menu'
                        @click='router.push("/")'
                    >
                        <IconCircleX
                            :size='28'
                            stroke='1'
                        />
                    </TablerIconButton>
                </div>
            </div>
            <div
                class='d-flex flex-column overflow-x-hidden overflow-y-auto flex-grow-1 px-2'
                style='min-height: 0'
            >
                <slot />
                <div class='air-aware-spacer flex-shrink-0' />
            </div>
        </div>
    </TablerModal>
    <div
        v-else
        class='w-100 d-flex flex-column overflow-hidden'
        style='height: 100%; max-height: 100%'
    >
        <div class='col-12 cloudtak-header border-bottom flex-shrink-0'>
            <div class='card-header d-flex align-items-center py-2 px-0 mx-2'>
                <div class='strong user-select-none flex-grow-1 px-2'>
                    {{ name }}
                </div>
                <div class='btn-list align-items-center air-aware-buttons'>
                    <slot name='buttons' />
                </div>
            </div>
        </div>
        <div class='d-flex flex-column overflow-x-hidden overflow-y-auto flex-grow-1 px-2'>
            <slot />
            <div class='air-aware-spacer flex-shrink-0' />
        </div>
    </div>
</template>

<script setup lang='ts'>
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { TablerModal, TablerIconButton } from '@tak-ps/vue-tabler';
import { IconCircleX } from '@tabler/icons-vue';

defineProps<{ name: string }>();

const router = useRouter();
const sheetHeight = ref(1);

// The same breakpoint CloudTAK's map uses
function narrow(): boolean {
    return window.innerWidth <= 576 || window.innerHeight <= 576;
}

const isMobile = ref(narrow());

function onResize(): void {
    isMobile.value = narrow();
}

onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));
</script>

<style scoped>
.air-aware-sheet {
    height: calc((100dvh - 2rem - 2 * var(--status-bar-height, 0px)) * var(--tblr-modal-sheet, 1));
}

.air-aware-buttons {
    min-height: 34px;
}

.air-aware-spacer {
    height: calc(env(safe-area-inset-bottom, 0px) + 32px);
}
</style>
