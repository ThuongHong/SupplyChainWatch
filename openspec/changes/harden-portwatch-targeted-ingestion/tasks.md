## 1. Targeted Collection

- [x] 1.1 Add monitored PortWatch port and chokepoint `portid` filters for Singapore, Shanghai, Rotterdam, Los Angeles, Suez Canal, Panama Canal, Red Sea/Bab el-Mandeb, Black Sea/Bosporus/Kerch, and Strait of Malacca.
- [x] 1.2 Apply the configured historical window to targeted FeatureServer queries.
- [x] 1.3 Preserve the existing object ID and first-page fallback retrieval path when targeted queries return no usable features.

## 2. Normalization And Aggregation

- [x] 2.1 Normalize entity matching candidates by lowercasing, replacing dashes with spaces, and collapsing whitespace.
- [x] 2.2 Verify Bab el-Mandeb naming variants resolve to the configured Red Sea/Bab el-Mandeb monitored entity.
- [x] 2.3 Aggregate duplicate normalized metrics by observation timestamp, entity type, entity ID, metric name, and source.
- [x] 2.4 Preserve contributing source entity identifiers in metadata for aggregated rows.

## 3. Persistence

- [x] 3.1 Change `PortWatchMetric` persistence to idempotent merge/upsert behavior.
- [x] 3.2 Verify overlapping collection windows update existing metric rows without duplicate-key failures.

## 4. Tests And Validation

- [x] 4.1 Add or update backend unit tests for targeted filter queries and fallback behavior.
- [x] 4.2 Add or update backend unit tests for duplicate aggregation and source metadata.
- [x] 4.3 Add or update backend unit tests for dash/whitespace alias normalization.
- [x] 4.4 Add or update backend unit tests for idempotent `PortWatchMetric` persistence.
- [x] 4.5 Run backend unit tests and confirm all 51 tests pass.
- [x] 4.6 Execute a local PortWatch collector run and record persisted row count.
- [x] 4.7 Recompute derived risk scores from the loaded metrics.
- [x] 4.8 Verify the frontend dashboard displays the targeted PortWatch metrics and derived risk scores.
