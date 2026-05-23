## Why

Current PortWatch ingestion can pull broad recent samples, which risks missing monitored entities and creating duplicate rows when multiple source ports map to one dashboard entity. The collector needs deterministic targeted ingestion so dashboard risk scores reflect the intended maritime ports and chokepoints over a stable historical window.

## What Changes

- Query monitored PortWatch and PortStraitWatch `portid` identifiers directly for Singapore, Shanghai, Rotterdam, Los Angeles, Suez Canal, Panama Canal, Red Sea/Bab el-Mandeb, Black Sea/Bosporus/Kerch, and Strait of Malacca.
- Keep a backward-compatible FeatureServer fallback path so existing object ID based tests and degraded source behavior still work.
- Normalize entity matching across dash and whitespace variants so names such as `Bab el-Mandeb Strait` resolve to the intended Red Sea chokepoint entity.
- Aggregate duplicate normalized metrics by entity, observation date, metric name, and source so source-port splits such as Pudong and Yangshan combine under Shanghai without primary-key conflicts.
- Persist `PortWatchMetric` records idempotently so reruns update existing observations instead of failing on duplicates.
- Validate the pipeline through backend unit tests, collector execution, derived risk computation, and frontend dashboard display checks.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `portwatch-intelligence`: PortWatch ingestion becomes targeted, duplicate-safe, robust to source naming variants, and idempotent across reruns.
- `collector-orchestration`: Successful PortWatch collection continues to feed derived risk jobs from validated, de-duplicated metrics without breaking existing fallback behavior.

## Impact

- Backend collector: `backend/app/collectors/portwatch.py` filtering, fallback, normalization, and aggregation behavior.
- Backend persistence: `backend/app/tasks/jobs.py` `PortWatchMetric` insert/update semantics.
- Backend tests: PortWatch collector coverage for targeted filters, fallback path, aggregation, alias matching, and idempotent behavior.
- Data flow: PortWatch metric rows feed existing maritime risk scoring and dashboard APIs.
- Frontend validation: dashboard should show the newly loaded targeted metrics and derived risk scores without additional UI contract changes.
