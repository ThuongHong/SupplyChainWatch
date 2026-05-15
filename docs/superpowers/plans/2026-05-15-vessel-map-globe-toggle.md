# Vessel Map Globe Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2D/3D toggle to the vessel map using MapLibre projection switching, with flat mode as the default and a more vibrant globe mode.

**Architecture:** `VesselMap` owns the map mode and renders a compact segmented toggle in the existing top status bar. `VesselRealMap` receives that mode and updates the existing MapLibre instance projection, pitch, fog, and visual treatment without duplicating vessel, port, heatmap, popup, or bbox logic.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, MapLibre GL 5.

---

## File Structure

- Modify `frontend/src/pages/VesselMap.test.ts`: add source-level regression tests for the map mode state, toggle labels, and projection behavior.
- Modify `frontend/src/pages/VesselMap.tsx`: add `MapMode`, projection/fog helpers, mode state, UI toggle, and `mapMode` prop wiring.

## Task 1: Add Failing Map Mode Tests

**Files:**
- Modify: `frontend/src/pages/VesselMap.test.ts`
- Test: `frontend/src/pages/VesselMap.test.ts`

- [ ] **Step 1: Write failing tests**

Replace `frontend/src/pages/VesselMap.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'VesselMap.tsx'), 'utf8')

describe('VesselMap layer controls', () => {
  it('removes the shipping lanes feature from map setup and controls', () => {
    expect(source).not.toMatch(/shipping-lanes|Shipping Lanes|lanesToGeoJson|LANES/)
    expect(source).not.toMatch(/lanes:\s*boolean/)
  })

  it('makes the vessel density heatmap obvious when enabled', () => {
    expect(source).toMatch(/heatmap:\s*true/)
    expect(source).toMatch(/'heatmap-opacity':\s*0\.86/)
    expect(source).toMatch(/1,\s*18,\s*6,\s*46/)
    expect(source).toMatch(/0\.9,\s*'rgba\(251,146,60,0\.96\)'/)
  })
})

describe('VesselMap globe mode toggle', () => {
  it('keeps the original 2D map as the default mode', () => {
    expect(source).toMatch(/type MapMode = 'flat' \| 'globe'/)
    expect(source).toMatch(/useState<MapMode>\('flat'\)/)
  })

  it('passes map mode into the MapLibre map component', () => {
    expect(source).toMatch(/mapMode:\s*MapMode/)
    expect(source).toMatch(/<VesselRealMap[^>]*mapMode=\{mapMode\}/s)
  })

  it('switches MapLibre between mercator and globe projections', () => {
    expect(source).toMatch(/setProjection\(\{\s*type:\s*'mercator'\s*\}\)/)
    expect(source).toMatch(/setProjection\(\{\s*type:\s*'globe'\s*\}\)/)
    expect(source).toMatch(/setFog\(/)
  })

  it('renders a compact 2D and 3D segmented control', () => {
    expect(source).toMatch(/aria-label="Map display mode"/)
    expect(source).toMatch(/aria-pressed=\{mapMode === 'flat'\}/)
    expect(source).toMatch(/aria-pressed=\{mapMode === 'globe'\}/)
    expect(source).toMatch(/>2D</)
    expect(source).toMatch(/>3D</)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd frontend && npm test -- VesselMap
```

Expected: FAIL. The new tests should fail because `MapMode`, `mapMode`, `setProjection`, `setFog`, and `Map display mode` do not exist yet.

- [ ] **Step 3: Commit failing tests**

Do not commit while tests are red. Continue to Task 2.

## Task 2: Add Map Mode State And Toggle UI

**Files:**
- Modify: `frontend/src/pages/VesselMap.tsx`
- Test: `frontend/src/pages/VesselMap.test.ts`

- [ ] **Step 1: Add the map mode type and prop**

In `frontend/src/pages/VesselMap.tsx`, add this near the existing type definitions before `interface RealMapProps`:

```ts
type MapMode = 'flat' | 'globe'
```

Update `RealMapProps`:

```ts
interface RealMapProps {
  vessels: Vessel[]
  selectedId: number | null
  onSelect: (id: number | null) => void
  onViewport: (bbox: string) => void
  layers: { vessels: boolean; heatmap: boolean; ports: boolean }
  mapMode: MapMode
}
```

- [ ] **Step 2: Add state and pass prop**

In `VesselMap`, add this beside the other `useState` calls:

```ts
const [mapMode, setMapMode] = useState<MapMode>('flat')
```

Change the `VesselRealMap` render to:

```tsx
<VesselRealMap vessels={filtered} selectedId={selectedId} onSelect={setSelectedId} onViewport={updateViewport} layers={layers} mapMode={mapMode} />
```

- [ ] **Step 3: Render the segmented toggle**

Inside the existing top status bar, after the shown count span, add:

```tsx
<div aria-label="Map display mode" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 7, background: 'rgba(2,6,23,0.42)', border: '1px solid var(--border-subtle)' }}>
  {(['flat', 'globe'] as MapMode[]).map(mode => (
    <button
      key={mode}
      type="button"
      aria-pressed={mapMode === mode}
      onClick={() => setMapMode(mode)}
      title={mode === 'flat' ? '2D map' : '3D globe'}
      style={{
        border: 0,
        borderRadius: 5,
        padding: '3px 8px',
        minWidth: 30,
        cursor: 'pointer',
        background: mapMode === mode ? 'var(--accent)' : 'transparent',
        color: mapMode === mode ? 'white' : 'var(--text-secondary)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {mode === 'flat' ? '2D' : '3D'}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Run tests**

Run:

```bash
cd frontend && npm test -- VesselMap
```

Expected: Tests still FAIL because projection switching is not implemented yet. Existing tests should keep passing.

## Task 3: Implement MapLibre Projection And Globe Visuals

**Files:**
- Modify: `frontend/src/pages/VesselMap.tsx`
- Test: `frontend/src/pages/VesselMap.test.ts`

- [ ] **Step 1: Add projection helper**

Add this after `mapBoundsToBbox`:

```ts
function applyMapMode(map: maplibregl.Map, mapMode: MapMode): void {
  try {
    if (mapMode === 'globe') {
      map.setProjection({ type: 'globe' })
      map.setFog({
        color: 'rgb(14, 26, 50)',
        'high-color': 'rgb(56, 189, 248)',
        'horizon-blend': 0.12,
        'space-color': 'rgb(2, 6, 23)',
        'star-intensity': 0.35,
      })
      map.easeTo({ pitch: 35, duration: 500 })
      return
    }
    map.setProjection({ type: 'mercator' })
    map.setFog(null)
    map.easeTo({ pitch: 0, bearing: 0, duration: 500 })
  } catch (error) {
    console.warn('Map display mode update failed', error)
  }
}
```

- [ ] **Step 2: Wire helper into map component**

Change the component signature:

```ts
const VesselRealMap: React.FC<RealMapProps> = ({ vessels, selectedId, onSelect, onViewport, layers, mapMode }) => {
```

Inside `map.on('load', () => {`, add this before `setReady(true)`:

```ts
applyMapMode(map, mapMode)
```

Add this effect after the moveend effect:

```ts
useEffect(() => {
  if (!ready) return
  const map = mapRef.current
  if (!map) return
  applyMapMode(map, mapMode)
}, [ready, mapMode])
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
cd frontend && npm test -- VesselMap
```

Expected: PASS for all `VesselMap` tests.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add frontend/src/pages/VesselMap.tsx frontend/src/pages/VesselMap.test.ts
git commit -m "feat: add vessel map globe toggle"
```

Expected: commit succeeds.

## Task 4: Verify Build

**Files:**
- Verify: `frontend/src/pages/VesselMap.tsx`
- Verify: `frontend/src/pages/VesselMap.test.ts`

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd frontend && npm test -- VesselMap
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd frontend && npm run build
```

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 3: If build fails on MapLibre fog typing**

If TypeScript rejects `map.setFog(null)`, replace it with:

```ts
map.setFog({
  color: 'rgba(0, 0, 0, 0)',
  'high-color': 'rgba(0, 0, 0, 0)',
  'horizon-blend': 0,
  'space-color': 'rgb(2, 6, 23)',
  'star-intensity': 0,
})
```

Then rerun:

```bash
cd frontend && npm run build
```

Expected: build exits 0.

## Self-Review

- Spec coverage: flat default, 2D/3D toggle, MapLibre projection switching, globe visual polish, existing data flow preserved, guarded runtime failure, and tests are covered.
- Placeholder scan: no TBD/TODO/implement-later placeholders remain.
- Type consistency: `MapMode`, `mapMode`, `applyMapMode`, `VesselRealMap`, and test names match across tasks.
