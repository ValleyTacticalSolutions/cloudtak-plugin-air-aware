import type { App } from 'vue';
import { h, markRaw } from 'vue';
import type { PluginAPI, PluginInstance } from '@tak-ps/cloudtak';
import { IconDrone } from '@tabler/icons-vue';
import MenuTemplate from '../../src/components/CloudTAK/util/MenuTemplate.vue';
import AirAwarePanel from './lib/AirAwarePanel.vue';
import DetailsView from './lib/DetailsView.vue';
import { AirAwareLayers } from './lib/layers.ts';
import { runtime } from './lib/runtime.ts';
import { persistSettings, state } from './lib/store.ts';
import { FLOAT_UID, MENU_KEY, ROUTE_NAME, ROUTE_PATH } from './lib/constants.ts';

export default class AirAware implements PluginInstance {
    api: PluginAPI;
    layers: AirAwareLayers | undefined;

    constructor(api: PluginAPI) {
        this.api = api;

        // Registered once and never removed: CloudTAK may call disable() before enable(),
        // and menu.add silently fails if its route is missing.
        this.api.routes.add({
            path: ROUTE_PATH,
            name: ROUTE_NAME,
            component: {
                render: () => h(MenuTemplate, { name: 'Air Aware', back: false }, {
                    default: () => h(AirAwarePanel)
                })
            }
        }, 'home-menu');
    }

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        return new AirAware(api);
    }

    async enable(): Promise<void> {
        if (this.layers) return;
        persistSettings();

        const map = this.api.map;
        if (!map) return;

        this.layers = new AirAwareLayers(map, () => this.showDetails());
        runtime.map = map;
        runtime.layers = this.layers;
        this.layers.start();

        this.api.menu.add({
            key: MENU_KEY,
            label: 'Air Aware',
            route: ROUTE_NAME,
            tooltip: 'Air Aware',
            description: 'TFRs, NOTAMs, airspace, UAS ceilings, no-fly zones, obstacles, METARs and a UAS flight planner',
            icon: IconDrone
        });
    }

    async disable(): Promise<void> {
        try { this.api.menu.remove(MENU_KEY); } catch { /* not added yet */ }
        try {
            if (this.api.float.has(FLOAT_UID)) this.api.float.remove(FLOAT_UID);
        } catch { /* float store not ready */ }
        if (this.layers) {
            try { this.layers.stop(); } catch { /* map already gone */ }
        }
        this.layers = undefined;
        runtime.map = undefined;
        runtime.layers = undefined;
        state.plan.picking = false;
        state.details = [];
    }

    /** A tap on the map opens its details in a floating pane. */
    private showDetails(): void {
        if (this.api.float.has(FLOAT_UID)) return;
        this.api.float.add({
            uid: FLOAT_UID,
            name: 'Air Aware Details',
            component: markRaw(DetailsView),
            width: 360,
            height: 420
        });
    }
}
