## ADDED Requirements

### Requirement: Real data is default
The system SHALL render live API data when available and SHALL render explicit empty states when live rows are absent. The system MUST NOT render local mock/demo rows in normal mode.

#### Scenario: Empty port risk response
- **WHEN** the dashboard requests global port risk and the API returns an empty array
- **THEN** the dashboard displays an empty state that names missing PortWatch risk scores instead of rendering mock port rows

#### Scenario: Partial live response
- **WHEN** the dashboard receives live port risk rows but receives no freight index rows
- **THEN** the dashboard renders the live port risk rows and renders an empty or unavailable state for freight index content

### Requirement: Demo mode is explicit
The system SHALL use demo fallback data only when explicit demo-mode configuration is enabled. Demo-mode data MUST be visibly labeled as demo fallback.

#### Scenario: Demo mode disabled
- **WHEN** demo mode is disabled and an API response contains no rows
- **THEN** the UI renders an empty state and does not use mock data

#### Scenario: Demo mode enabled
- **WHEN** demo mode is enabled and an API response contains no rows
- **THEN** the UI may render configured demo fallback data with a demo provenance label

### Requirement: Source state is visible
The system SHALL expose and display source states that distinguish live, empty, stale, disabled, demo, loading, and error conditions.

#### Scenario: Collector source failed
- **WHEN** a source has a recent failed collection log entry
- **THEN** user-facing status shows that source as error or unavailable with enough detail to diagnose the failing source

#### Scenario: Source has stale rows
- **WHEN** latest rows for a source are older than the configured freshness window
- **THEN** user-facing status shows stale state instead of treating the rows as current live data

### Requirement: No silent metric substitution
The system SHALL NOT substitute hard-coded metric values for missing live statistics in normal mode. Missing statistics MUST be displayed as empty, unavailable, or not collected.

#### Scenario: Overview endpoint missing
- **WHEN** the overview API returns no usable summary
- **THEN** the dashboard displays unavailable summary state instead of hard-coded vessel, anomaly, BDI, or FBX values
