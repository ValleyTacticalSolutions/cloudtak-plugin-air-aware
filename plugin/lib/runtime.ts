import type { Map as MLMap } from 'maplibre-gl';
import type { AirAwareLayers } from './layers.ts';

/** The live map and layer manager while the plugin is enabled; empty while disabled. */
export const runtime: {
    map?: MLMap;
    layers?: AirAwareLayers;
} = {};
