## ADDED Requirements

### Requirement: Targeted PortWatch entity filtering
The PortWatch collector SHALL query configured monitored PortWatch and PortStraitWatch `portid` identifiers for the configured historical window before using fallback retrieval.

#### Scenario: Targeted filter query
- **WHEN** the PortWatch collector runs with targeted filtering enabled
- **THEN** the FeatureServer query uses a `portid IN (...)` filter containing monitored port or chokepoint identifiers and a date lower bound based on the configured history window

#### Scenario: Filter returns no features
- **WHEN** the targeted FeatureServer query returns no usable feature rows
- **THEN** the collector falls back to the existing object ID or first-page retrieval path

### Requirement: Robust PortWatch entity matching
The PortWatch collector SHALL normalize source identifiers and names before alias matching so case, dash, and whitespace variants map to the intended monitored entity.

#### Scenario: Dash variant matched
- **WHEN** a PortStraitWatch feature uses a name such as `Bab el-Mandeb Strait`
- **THEN** the normalized record resolves to the configured Red Sea or Bab el-Mandeb monitored chokepoint entity

#### Scenario: Source identifier matched
- **WHEN** a feature has a known `portid` but a missing or variant display name
- **THEN** the collector uses the source identifier as a candidate for monitored entity matching

### Requirement: Duplicate normalized metric aggregation
The PortWatch collector SHALL aggregate duplicate normalized metrics that share observation timestamp, entity type, entity ID, metric name, and source before returning validated records.

#### Scenario: Multiple source ports map to one entity
- **WHEN** two source PortWatch ports normalize to the same monitored entity, observation date, and metric name
- **THEN** the collector returns one metric record with the combined metric value and metadata preserving contributing source entity identifiers

#### Scenario: Distinct metric keys remain separate
- **WHEN** features normalize to the same entity and date but have different metric names or sources
- **THEN** the collector returns separate metric records for each distinct metric key

### Requirement: Idempotent PortWatch metric persistence
The system SHALL persist PortWatch metric records idempotently for overlapping collector runs.

#### Scenario: Existing metric row collected again
- **WHEN** a PortWatch metric record has the same primary identity as an existing database row
- **THEN** persistence updates or replaces the existing row instead of raising a duplicate-key error

#### Scenario: New metric row collected
- **WHEN** a PortWatch metric record has no matching existing database row
- **THEN** persistence inserts the new row normally
