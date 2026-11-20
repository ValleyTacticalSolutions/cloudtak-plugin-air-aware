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

**UAS planner** (Planner tab):
- Set a launch point by tapping the map or using the map centre. The plan covers a circle of configurable radius around it.
- **Need a ceiling**: highest ground in the area + your height above terrain, rounded up to the next 100 ft. It is shown as MSL and as height above the launch point.
- **Given a ceiling**: the highest ground you can work over, plus the share of the area that is too high. Too-high ground is painted red and workable ground blue.
- Obstacles in the area are listed nearest first, with height, top, lighting, distance and bearing. Any that reach the ceiling (with your separation added) are flagged.
- It shows the UAS Facility Map ceiling at the launch point, and any TFR, UAS No-Fly area or airspace touching the plan.
- Links to LAANC (an FAA-approved supplier), FAA DroneZone and Flight Service. A Copy button gives the plan's numbers as text for the Flight Service call. Nothing is filed or sent.

Settings (layers, obstacle filters, planner numbers) are stored per browser.

## How to use

1. Open the CloudTAK main menu and choose **Air Aware**.
2. In **Layers**, switch on what you need. Each layer's status line says what it is showing and what it is *not* showing (for example, zoom gates or unreachable sources). A quiet map is not an empty sky.
3. Tap a feature to read its details.
4. For the planner, turn on a **terrain overlay** in CloudTAK first. The planner reads ground elevation from the map's terrain and will not compute a ceiling without it. Keep the whole plan circle on screen.

**Advisory only.** Everything Air Aware draws is a picture of published data at the time it reached CloudTAK. It is not a clearance, and it does not replace charts, NOTAMs or a briefing.

### Differences from the ATAK plugin

- No offline tile store. CloudTAK's API server caches the data in memory instead (manifests for hours, NOTAMs for 3 minutes, TFRs for 5 minutes, METARs for 5 minutes).
- The planner uses a circle around the launch point. Drawn-polygon plan areas and "make a geofence from a restriction" are not ported yet.
- Terrain comes from CloudTAK's map terrain (DEM overlay), not ATAK's elevation data.
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

For the planner, users also need a terrain overlay enabled in CloudTAK. That is a per-user map setting, not server configuration.

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
