## ADDED Requirements

### Requirement: PortWatch hardening preserves downstream risk flow
The system SHALL continue triggering or running derived maritime risk computation from successfully persisted, validated, and de-duplicated PortWatch metric records.

#### Scenario: Targeted collection succeeds
- **WHEN** targeted PortWatch collection persists one or more validated metric rows
- **THEN** the existing risk computation path can derive port and chokepoint risk scores from those rows

#### Scenario: Collection rerun overlaps previous window
- **WHEN** PortWatch collection reruns for a historical window that overlaps previously persisted rows
- **THEN** downstream risk computation receives current persisted metric values without duplicate database failures

### Requirement: PortWatch validation evidence
The implementation SHALL verify targeted PortWatch ingestion through tests and local data-flow validation.

#### Scenario: Unit tests run
- **WHEN** backend unit tests for PortWatch ingestion execute
- **THEN** they cover targeted filtering, fallback retrieval, duplicate aggregation, alias normalization, and idempotent persistence behavior

#### Scenario: Local collector validation run
- **WHEN** the collector is executed against local services with network access and configured data sources
- **THEN** the run reports persisted row counts, risk recomputation outcome, and dashboard visibility of derived metrics
