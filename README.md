# Air Aware

A CloudTAK plugin for crews working under or in the air. It answers two questions: what is in the column of air I am in, and what am I allowed to do here. It is a port of the takwerx [AirAware ATAK plugin](https://github.com/takwerx/air-aware). It reads the same published data packs and FAA feeds, draws them on CloudTAK's map, and adds a UAS flight planner.

**Minimum CloudTAK: v13.124.0**. Built and verified against CloudTAK v13.124.0 (commit 5cb43c9, 2026-11-20). There is no upper limit, and newer CloudTAK versions are expected to work. Please report breakage as an issue.

## What it does

Eight layers, each switched on or off on its own:

| Layer | What you see | Source |
|---|---|---|
| **TFR** | FAA Temporary Flight Restrictions. Red when in effect, amber when scheduled. Optionally drawn as 3D volumes from floor to ceiling. | tfr.faa.gov list and XNOTAM detail documents |
| **NOTAMs** | Drone operations, parachute drops, unlit towers, cranes, closed runways. Colored by kind, with the FAA text as issued. Zoom 7+. | FAA NOTAM Management Service, via the takwerx relay (republished every few minutes) |
| **Airspace** | Class A–E. Each published shelf is drawn separately, in sectional colors (B/D blue, C/E magenta, Class E from 1,200 ft AGL blue). Zoom 6+. | FAA AIS airspace, takwerx pack |
| **Special Use** | Prohibited, Restricted, Warning and Alert areas, and MOAs, with hours (continuous or activated by NOTAM). Zoom 5+. | FAA AIS airspace, takwerx pack |
| **UAS ceilings** | The FAA UAS Facility Map grid, colored from 0 ft (red) to 400 ft (green). A pinned line states the ceiling at the map centre. Zoom 9+. | FAA UASFM, takwerx pack |
| **UAS No-Fly** | National Security UAS Flight Restrictions: bases, labs, dams and nuclear sites, surface to 400 ft AGL. The details include the FAA point of contact. | FAA NSUFR, takwerx pack |
| **Obstacles** | Digital Obstacle File towers, wires, turbines and stacks, labelled with height AGL and top MSL. You can filter by height and type. Zoom 9+. | FAA DOF, takwerx pack |
| **METARs** | Flight-category dots: VFR green, MVFR blue, IFR red, LIFR magenta, as published (never derived). Zoom 6+. | aviationweather.gov |

Tapping anything on the map opens its details. They appear in the sidebar's **Details** tab, or in a floating pane if the sidebar is closed.

**UAS planner** (Planner tab). Every height is in ft AGL from the takeoff point, the way the drone's altimeter reads it:
- Set a takeoff point by tapping the map or using the map centre.
- Pick the operating range: ¼, ½, 1 or 1½ mi, or a custom distance. The ring on the map follows the choice immediately.
- **Find my altitude**: the highest ground in range relative to takeoff, plus the height you hold over the terrain (default 400 ft), rounded up to the next 10 ft.
- **I have an altitude limit**: enter your max altitude in ft AGL. It shows the highest ground you can work over and how much of the range is too high (red on the map, blue workable).
- Terrain in range is shown relative to takeoff (for example −40 ft to +320 ft).
- Obstacles in range are listed nearest first, with their height, top relative to takeoff, lighting, distance and direction. Any that reach your altitude (with your clearance added) are flagged.
- Shows the UAS Facility Map ceiling at takeoff, and any TFR, UAS No-Fly area or airspace touching the range. It warns when your altitude is over 400 ft AGL (Part 107) or over the facility map ceiling.

Settings (layers, obstacle filters, planner numbers) are stored per browser.

## How to use

1. Open the CloudTAK main menu and choose **Air Aware**.
2. In **Layers**, switch on what you need. Each layer's status line says what it is showing and what it is *not* showing (for example, zoom gates or unreachable sources). A quiet map is not an empty sky.
3. Tap a feature to read its details.
4. The planner reads ground elevation from CloudTAK's terrain, with 3D terrain on or off. It tries the terrain (raster-dem) overlay on the map first, then the server's **Default Terrain** (Admin → Config → Map, for example as set by the Terrain Data Downloader plugin), then MapLibre's 3D terrain. The readout names which one it used. Where none of these has data, it says so and computes nothing.

### Differences from the ATAK plugin

- No offline tile store. CloudTAK's API server caches the data in memory instead (manifests for hours, NOTAMs for 3 minutes, TFRs for 5 minutes, METARs for 5 minutes).
- The planner uses a range ring around the takeoff point and works in AGL from takeoff. Drawn-polygon plan areas, "make a geofence from a restriction", and the LAANC / DroneZone / Flight Service links are not included.
- Terrain comes from CloudTAK's terrain (DEM overlay or the server's Default Terrain), not ATAK's elevation data. The default height above terrain is 400 ft.
- 3D volumes start at the map's ground plane and are not corrected for terrain. Read the published numbers on the details page.

## TAK Portal Marketplace

### Configuration required

1. **API image rebuild**: the plugin ships a server route (`server/plugin-air-aware.ts` → `api/stateless/routes/`). TAK Portal installs it through the catalog `routes` field, and CloudTAK's API image must be rebuilt for it to load. The route is the only part of CloudTAK that contacts the outside sources, so **no CSP change and no Plugin Proxy whitelist is needed**.
2. **Outbound HTTPS from the CloudTAK API container** must be able to reach:
   - `https://mapdepot.takwerx.org` (airspace, obstacle, UAS Facility Map, NSUFR and NOTAM packs)
   - `https://tfr.faa.gov` (TFR list and details)
   - `https://aviationweather.gov` (METARs)

   No action is needed if the server already has normal internet egress.
3. After install: **Settings → Refresh App** in CloudTAK (a normal browser refresh is not enough).

For the planner's ground readouts, CloudTAK needs terrain data: either a **Default Terrain** set under Admin → Config → Map (for example by the Terrain Data Downloader plugin), or a terrain overlay that users add themselves. Without one, the planner says there is no terrain and computes nothing.

### Catalog entry
```json
{
  "id": "air-aware",
  "name": "Air Aware",
  "description": "TFRs, NOTAMs, airspace, UAS ceilings, UAS no-fly zones, obstacles, METARs and a UAS flight planner.",
  "repo": "https://github.com/ValleyTacticalSolutions/cloudtak-plugin-air-aware.git",
  "ref": "main",
  "added": "2026-11-20",
  "maintainer": "ValleyTacticalSolutions",
  "web": { "source": "plugin", "dest": "air-aware" },
  "routes": { "source": "server" },
  "exclude": ["test", "docs", "**/*.md"],
  "detect": ["api/web/plugins/air-aware/index.ts", "app/plugins/air-aware/index.ts"],
  "additionalActions": [
    {
      "title": "Allow outbound HTTPS from the CloudTAK API",
      "text": "Air Aware's server route fetches public FAA and takwerx data from the API container.",
      "instructions": [
        "Make sure the CloudTAK API container can reach mapdepot.takwerx.org, tfr.faa.gov and aviationweather.gov over HTTPS.",
        "No CSP or Plugin Proxy changes are needed: the browser only talks to CloudTAK's own /api/plugin/air-aware routes.",
        "After install, have users run Settings -> Refresh App in CloudTAK."
      ],
      "snippet": "curl -sI https://mapdepot.takwerx.org/airaware/nsufr/nsufr.json https://tfr.faa.gov/tfrapi/exportTfrList https://aviationweather.gov/api/data/metar?ids=KDEN"
    }
  ]
}
```
<!-- Requires CloudTAK v13.124.0 or newer (catalog has no version field; this note is for reviewers). -->

To list it: submit the repo URL through TAK Portal's CloudTAK Marketplace plugin request form, or open an issue/PR on ValleyTacticalSolutions/TAK-Portal adding the entry to `catalog/cloudtak-plugins.json`.

## Manual install (without TAK Portal)

```bash
CT=/path/to/CloudTAK
mkdir -p "$CT/app/plugins/air-aware"
cp -a plugin/. "$CT/app/plugins/air-aware/"
cp server/plugin-air-aware.ts "$CT/api/stateless/routes/"
```
Then rebuild the CloudTAK API image, and run **Settings → Refresh App** in CloudTAK.

## Server routes

All routes require a signed-in CloudTAK user. None of them accepts a URL from the client: every upstream address is built from validated path segments.

| Route | Upstream |
|---|---|
| `GET /api/plugin/air-aware/pack/:pack/manifest` | `mapdepot.takwerx.org/airaware/<pack>/<pack>.json` |
| `GET /api/plugin/air-aware/pack/:pack/tile/:key` | `…/<pack>/tiles/<lat>_<lon>.json.gz` (unpacked server-side) |
| `GET /api/plugin/air-aware/pack/:pack/file/:file` | `…/airspace/wide.json.gz`, `…/nsufr/nsufr.json.gz` |
| `GET /api/plugin/air-aware/tfr` | `tfr.faa.gov/tfrapi/exportTfrList` |
| `GET /api/plugin/air-aware/tfr/:id` | `tfr.faa.gov/download/detail_<id>.xml` |
| `GET /api/plugin/air-aware/metar?south&west&north&east` | `aviationweather.gov/api/data/metar` |

## Core imports

- `../../src/components/CloudTAK/util/MenuTemplate.vue` (sidebar page frame)
- `../../../src/std.ts` (`std`, authenticated calls to CloudTAK's API)
- Server: `../../common/auth.js`, `../config.js`

## Development

The plugin is compiled inside CloudTAK. To check it against the latest CloudTAK `main` (ESLint, `vue-tsc`, Vite build, API oxlint and `tsc`):

```bash
bash verify-cloudtak.sh . air-aware
```

## License

AGPL-3.0-or-later, the same license as the AirAware ATAK plugin it is ported from. The data packs are published by takwerx, and the underlying data is from the FAA and aviationweather.gov.
