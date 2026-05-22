## ADDED Requirements

### Requirement: Watchlist-based AIS collection
The system SHALL use AISStream only for watchlist vessels and anomaly-triggered geographic filters instead of tracking every vessel globally.

#### Scenario: Watchlist vessel tracked
- **WHEN** a vessel is active on the watchlist
- **THEN** AIS collection stores realtime positions for that vessel and updates last-seen metadata

#### Scenario: Non-watchlist vessel ignored
- **WHEN** AISStream emits a vessel position that does not match a watchlist entry or active risk-area rule
- **THEN** the system does not persist that position

### Requirement: Watchlist eligibility
The system SHALL support watchlist membership from manual pins, risky ports, disrupted regions, major trade routes, vessel anomalies, and proximity to congested ports.

#### Scenario: Risk-area rule adds vessel
- **WHEN** a vessel is detected near a high-risk port or disrupted chokepoint and matches configured route or vessel-type criteria
- **THEN** the system adds or refreshes a watchlist record with reason, source rule, TTL, and priority

### Requirement: Vessel anomaly detection
The system SHALL detect speed anomalies, route deviation, ETA drift, and abnormal proximity to congested ports for watched vessels.

#### Scenario: Speed anomaly found
- **WHEN** a watched vessel speed drops below the configured threshold near a congested port
- **THEN** the system creates an anomaly candidate with observed speed, expected speed, entity reference, and supporting risk context

### Requirement: Selective vessel enrichment
The system SHALL enrich only watchlist vessels, vessels near disrupted ports, or vessels with abnormal behavior using optional VesselFinder, CargoFetch, or MarineTraffic sources.

#### Scenario: Enrichment cache hit
- **WHEN** enrichment data for a watched vessel exists and remains within TTL
- **THEN** the system serves cached vessel owner, operator, IMO metadata, route history, port calls, schedules, or vessel type without making an external request

#### Scenario: Enrichment provider disabled
- **WHEN** no enrichment provider credentials or scraping permission are configured
- **THEN** the system skips enrichment and records unavailable enrichment status without failing vessel monitoring

