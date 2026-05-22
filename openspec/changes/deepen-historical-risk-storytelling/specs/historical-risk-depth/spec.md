## ADDED Requirements

### Requirement: Historical PortWatch backfill depth
The system SHALL support configurable historical backfill for monitored PortWatch and PortStraitWatch entities.

#### Scenario: Backfill monitored entities
- **WHEN** an operator runs historical PortWatch backfill for a configured date window
- **THEN** the system persists validated observations for monitored ports and chokepoints across that window without requiring UI mock data

#### Scenario: Source has less history than requested
- **WHEN** PortWatch or PortStraitWatch returns fewer dates than the requested window
- **THEN** the system records the available date range and missing coverage without treating the collection as a total failure

### Requirement: Idempotent historical ingestion
The system SHALL make historical collector and backfill runs idempotent for overlapping date windows.

#### Scenario: Backfill rerun overlaps existing rows
- **WHEN** a historical backfill run fetches rows already stored in source tables
- **THEN** the system updates or skips duplicate observations using stable natural keys and does not create duplicate records

#### Scenario: Aggregated source records collide
- **WHEN** multiple source rows map to the same monitored entity, metric, and observed timestamp
- **THEN** the system aggregates or merges them deterministically before persistence

### Requirement: Data coverage metadata
The system SHALL expose historical coverage metadata for each monitored entity and source used by risk analysis.

#### Scenario: Operator requests coverage
- **WHEN** coverage metadata is requested for a monitored entity
- **THEN** the response includes source name, first observed timestamp, latest observed timestamp, observed row count, expected date count, missing date count, freshness status, and last collection status where available

#### Scenario: Frontend has insufficient history
- **WHEN** coverage metadata shows less than the minimum required history for story or forecast generation
- **THEN** the frontend displays an insufficient-history state with source and gap details instead of demo or fabricated output

### Requirement: Daily entity feature snapshots
The system SHALL derive daily feature snapshots for monitored ports and chokepoints from historical source and risk rows.

#### Scenario: Feature snapshot generated
- **WHEN** historical raw observations and risk scores exist for an entity/day
- **THEN** the system stores feature values including latest metric value, rolling baseline, rolling standard deviation, delta, percent change, z-score, missing flags, source freshness, and driver metadata

#### Scenario: Snapshot input missing
- **WHEN** one or more source inputs are unavailable for an entity/day
- **THEN** the snapshot records missing feature flags and preserves available features for downstream analysis
