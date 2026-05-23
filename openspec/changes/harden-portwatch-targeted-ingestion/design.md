## Context

PortWatch is the primary traffic and chokepoint signal for GlobalSupplyWatch. Current FeatureServer ingestion has two practical weaknesses: broad recent sampling can miss the monitored entities, and multiple source identifiers can normalize to the same dashboard entity and collide on the `portwatch_metrics` primary key.

The project must stay local-only and course-friendly, keep data validation through Pydantic, log collector runs, and preserve existing tests that rely on object ID based FeatureServer access.

## Goals / Non-Goals

**Goals:**

- Fetch the intended monitored ports and chokepoints directly over the configured historical window.
- Preserve fallback behavior for legacy tests and source degradation.
- Normalize source names and aliases robustly enough for dash and whitespace variants.
- Combine duplicate source entities into one metric row per entity, date, metric, and source.
- Make PortWatch persistence idempotent so scheduled reruns are safe.
- Verify through unit tests, collector execution, risk recomputation, and dashboard display.

**Non-Goals:**

- No new database schema or Alembic migration.
- No new external data source.
- No frontend API contract change.
- No replacement of existing risk scoring formulas.
- No full PortWatch field taxonomy redesign.

## Decisions

1. Query static monitored `portid` identifiers first.

   Rationale: The dashboard is built around a small known set of ports and chokepoints. Direct `portid` filters give deterministic coverage and reduce FeatureServer payload size. Alternative considered: keep sampling recent object IDs. Rejected as primary path because source ordering can omit monitored entities.

2. Keep object ID and first-page fallback.

   Rationale: Existing tests and degraded FeatureServer behavior already exercise this path. Keeping fallback limits implementation risk. Alternative considered: remove object ID logic. Rejected because it would make the collector brittle and force unrelated test rewrites.

3. Aggregate after normalization, before validation/persistence.

   Rationale: Duplicate source ports such as Pudong and Yangshan need to combine under Shanghai before hitting the database uniqueness constraint. Alternative considered: store each source port as a separate entity. Rejected because dashboard semantics require one monitored entity.

4. Normalize alias matching by lowercasing, dash replacement, and whitespace collapse.

   Rationale: PortWatch/PortStraitWatch labels are not guaranteed to match fixture aliases exactly. A small deterministic normalizer handles common variants without fuzzy matching risk. Alternative considered: fuzzy string matching. Rejected because it may create surprising entity assignments.

5. Use merge semantics for `PortWatchMetric` persistence.

   Rationale: Collection jobs can rerun for overlapping 90-day windows. Idempotent upsert behavior avoids duplicate-key failures and lets newer source values replace older rows. Alternative considered: delete then insert. Rejected because it is more disruptive and less precise.

## Risks / Trade-offs

- Hardcoded source IDs drift upstream -> keep IDs isolated in collector logic and covered by tests so updates stay localized.
- Summing all duplicate metrics may be wrong for index-like fields -> preserve source metadata and add follow-up review if PortWatch field semantics require averaging for specific metrics.
- FeatureServer SQL syntax changes -> fallback path remains available; collector failure still logs through `collection_log`.
- `merge` may hide repeated source changes -> acceptable for idempotence because latest observation for the same primary key is authoritative.

## Migration Plan

1. Update PortWatch collector filtering and fallback behavior.
2. Update normalization and duplicate aggregation.
3. Update persistence to merge PortWatch metric rows.
4. Add focused unit tests for targeted filters, alias variants, aggregation, and idempotence.
5. Run backend unit tests.
6. Run PortWatch collection against local services, recompute risk scores, and verify dashboard display.

Rollback: disable targeted `portid` filtering with the existing fallback flag or revert collector changes; existing object ID fallback still supports previous behavior.

## Open Questions

- Should index-style duplicate metrics be summed, averaged, or source-weighted long term?
- Should monitored PortWatch source IDs move from code constants into fixture data or settings after the course demo stabilizes?
