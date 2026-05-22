## ADDED Requirements

### Requirement: AISStream uses verified TLS
The system SHALL connect to AISStream with normal certificate verification enabled and SHALL provide runtime trust-store dependencies required for that verification.

#### Scenario: Valid certificate chain
- **WHEN** AISStream presents a valid certificate chain and the API key is configured
- **THEN** the collector connects without disabling TLS verification

#### Scenario: Certificate verification fails
- **WHEN** certificate verification fails
- **THEN** the collector logs a source-specific failure and does not silently retry with certificate verification disabled

### Requirement: Required keys are explicit
The system SHALL document and expose which live sources require API keys and which sources can run without keys.

#### Scenario: Operator checks source requirements
- **WHEN** an operator reads setup docs or source readiness output
- **THEN** AISStream and FRED are marked as key-required, Open-Meteo and PortWatch are marked as no-key, and optional LLM/enrichment keys are marked optional

### Requirement: Freight indices can be populated without UI mocks
The system SHALL provide a real-data path to populate `freight_indices` for FRED, Open-Meteo, FBX, and WCI through live collectors or documented backfill.

#### Scenario: FRED key configured
- **WHEN** `FRED_API_KEY` is configured and the FRED collector runs
- **THEN** the collector persists validated rows for configured freight and macro index names used by analysis and frontend views

#### Scenario: Open-Meteo collector runs
- **WHEN** the Open-Meteo collector runs without an API key
- **THEN** the collector persists validated weather indicator rows in `freight_indices`

#### Scenario: Public FBX or WCI source unavailable
- **WHEN** FBX or WCI public scraping cannot produce a validated row
- **THEN** the system provides a documented/manual backfill path that stores source and provenance metadata

### Requirement: Real-data verification is documented
The system SHALL provide commands or documented checks that verify row counts and freshness for primary user-facing tables.

#### Scenario: Operator verifies readiness
- **WHEN** an operator runs the documented verification checks
- **THEN** they can see counts and latest timestamps for `portwatch_metrics`, `port_risk_scores`, `chokepoint_risk_scores`, `vessel_positions`, `freight_indices`, `anomalies`, and `insights`
