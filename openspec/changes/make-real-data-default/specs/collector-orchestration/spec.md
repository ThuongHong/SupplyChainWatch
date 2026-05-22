## ADDED Requirements

### Requirement: PortWatch collection triggers derived risk
The system SHALL run or enqueue maritime risk derivation after successful PortWatch collection persists validated records.

#### Scenario: PortWatch collection succeeds
- **WHEN** `collect_portwatch` persists one or more `portwatch_metrics` records
- **THEN** the system runs or enqueues risk score computation for port and chokepoint risk rows

#### Scenario: PortWatch collection fails
- **WHEN** `collect_portwatch` fails before persisting validated records
- **THEN** the system records the collection failure and does not create new derived risk rows from failed source data

### Requirement: Derived risk triggers dependent outputs
The system SHALL refresh downstream propagation, watchlist rules, and deterministic insight candidates after successful maritime risk computation.

#### Scenario: Risk computation creates rows
- **WHEN** maritime risk computation creates port or chokepoint risk rows
- **THEN** the system refreshes disruption propagation and risk-derived watchlist rules

#### Scenario: Risk computation has no source rows
- **WHEN** maritime risk computation finds no PortWatch source metrics
- **THEN** the system returns zero created rows and leaves existing downstream data unchanged

### Requirement: Batch collection isolates failures
The system SHALL continue collecting independent sources when one source fails and SHALL return per-source status, row count, and error information.

#### Scenario: FRED key missing
- **WHEN** batch collection runs without `FRED_API_KEY`
- **THEN** FRED is reported as disabled or failed and PortWatch, Open-Meteo, FBX, WCI, bunker, and AIS attempts are not skipped because of FRED

#### Scenario: Scraper markup changed
- **WHEN** FBX or WCI scraping returns no parseable live value
- **THEN** that source reports zero rows or failure without aborting other source collection

### Requirement: Collection logs stay authoritative
The system SHALL log every collector run to `collection_log` with source, status, row count, timestamps, and error details when applicable.

#### Scenario: Partial batch completion
- **WHEN** a batch collection has mixed successful and failed sources
- **THEN** each attempted source has its own `collection_log` row reflecting its actual result
