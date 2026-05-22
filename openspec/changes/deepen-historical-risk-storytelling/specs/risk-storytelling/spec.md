## ADDED Requirements

### Requirement: Historical risk event detection
The system SHALL detect structured risk events from historical feature changes, anomalies, and derived risk scores.

#### Scenario: Port risk worsens versus baseline
- **WHEN** a monitored port's risk score or driver metric exceeds configured rolling baseline thresholds
- **THEN** the system records a risk event with entity, event type, severity, observed value, expected value, z-score or percent change, contributing drivers, source timestamps, and confidence

#### Scenario: Risk returns toward baseline
- **WHEN** a previously elevated entity falls below configured recovery thresholds
- **THEN** the system records a recovery or easing event linked to the affected entity and driver metrics

### Requirement: Event timeline API
The system SHALL provide API access to historical risk events for monitored ports, chokepoints, routes, and regions.

#### Scenario: Timeline requested for entity
- **WHEN** a client requests an entity risk timeline for a date range
- **THEN** the response returns chronological structured events with severity, confidence, driver metrics, narrative summary, source rows, and data sufficiency metadata

#### Scenario: Timeline has no events
- **WHEN** enough history exists but no configured thresholds were crossed
- **THEN** the response indicates no detected events and includes coverage metadata proving the period was analyzed

### Requirement: Narrative risk stories
The system SHALL generate deterministic risk narratives from structured events and historical context.

#### Scenario: Story generated from event
- **WHEN** a structured risk event is created
- **THEN** the system generates a concise narrative explaining what changed, why the entity matters, which drivers moved, how current risk compares with baseline, and what operator attention is recommended

#### Scenario: LLM enrichment unavailable
- **WHEN** optional LLM enrichment is disabled or fails
- **THEN** the deterministic narrative remains available with source metrics and confidence metadata

### Requirement: Storytelling frontend states
The frontend SHALL render historical risk stories, event timelines, and gaps using real backend data only.

#### Scenario: Story rows exist
- **WHEN** the backend returns risk story events for an entity or dashboard view
- **THEN** the frontend displays the event timeline, severity, drivers, narrative, and source freshness without using mock rows

#### Scenario: Story rows unavailable
- **WHEN** the backend returns no stories because of insufficient history or missing source rows
- **THEN** the frontend displays an empty or insufficient-history state with coverage details instead of demo stories
