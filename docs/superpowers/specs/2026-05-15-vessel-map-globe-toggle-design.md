# Vessel Map Globe Toggle Design

## Context

`frontend/src/pages/VesselMap.tsx` currently renders the vessel map through one MapLibre instance. It already owns vessel GeoJSON sources, density heatmap, port markers, popups, viewport bbox updates, layer visibility, and initial fit behavior. The referenced `koala73/worldmonitor` app supports flat/globe map switching, but its full `globe.gl` path would add a new rendering engine and duplicate this project's layer logic.

## Goal

Add a toggle that switches the existing vessel map between the original 2D map and a more vibrant 3D globe view while preserving existing filters, vessel selection, layer controls, popups, and API viewport updates.

## Approach

Use MapLibre's built-in projection switching inside the existing `VesselRealMap` component.

- Add `MapMode = 'flat' | 'globe'`.
- Keep `flat` as the default mode so the original 2D map remains first behavior.
- Add a compact segmented control in the top status bar with `2D` and `3D` options.
- Pass `mapMode` from `VesselMap` into `VesselRealMap`.
- When `mapMode` changes, update the existing map instance:
  - `flat`: set Mercator projection, pitch to `0`, and keep current center/zoom.
  - `globe`: set globe projection, use a moderate pitch, and keep current center/zoom.
- Apply globe visual polish with fog/atmosphere settings and a brighter globe-friendly basemap style.

## Components

- `VesselMap`: owns `mapMode` state and renders the toggle in the status bar.
- `VesselRealMap`: receives `mapMode` and applies MapLibre projection/fog updates.
- Existing layer logic remains unchanged for vessels, heatmap, and ports.

## Data Flow

The vessel snapshot query continues to use the bbox emitted by the MapLibre instance. Projection changes do not change API shape. Filters and layer toggles still operate on the same `filtered` vessel array and `layers` object.

## Error Handling

If projection or fog APIs are unavailable in the runtime, the map should keep rendering in flat mode without breaking the page. The toggle remains UI-only state, but map updates should be guarded so failures do not crash the component.

## Testing

Use the existing Vitest source-level test pattern in `frontend/src/pages/VesselMap.test.ts`.

- Verify default mode is `flat`.
- Verify `VesselRealMap` accepts `mapMode`.
- Verify projection switching references both `mercator` and `globe`.
- Verify the visible toggle exposes `2D` and `3D` labels.

Run:

```bash
cd frontend && npm test -- VesselMap
cd frontend && npm run build
```

## Out Of Scope

- Adding `globe.gl`, Three.js, or deck.gl.
- Rewriting the map into separate flat and globe components.
- Adding terrain data or new external map tile providers.
- Changing backend vessel APIs.
