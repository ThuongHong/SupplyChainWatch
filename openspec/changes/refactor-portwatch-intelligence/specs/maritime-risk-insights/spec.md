## ADDED Requirements

### Requirement: Multi-source risk context
The system SHALL combine PortWatch, selective AISStream, Open-Meteo Marine, FRED, Freightos FBX, Drewry WCI, bunker fuel, and optional trade flow data into operational maritime risk context.

#### Scenario: Risk context assembled
- **WHEN** an insight job runs for a monitored port or chokepoint
- **THEN** the system assembles available derived congestion risk, traffic, weather, freight, fuel, trade, vessel, and historical baseline signals for that entity

### Requirement: Weather impact correlation
The system SHALL correlate marine weather conditions with congestion, vessel slowdown, rerouting events, and route impact scoring.

#### Scenario: Weather-linked slowdown
- **WHEN** wave or wind severity is elevated on a monitored route and watched vessel speeds decline
- **THEN** the system records weather as a contributing risk factor with severity and confidence

### Requirement: Economic pressure context
The system SHALL use FRED, Freightos FBX, and Drewry WCI to explain fuel proxies, freight volatility, container price spikes, and macroeconomic shipping pressure.

#### Scenario: Freight spike context
- **WHEN** a freight index changes beyond the configured anomaly threshold
- **THEN** generated insights include the index movement as economic context for affected routes or regions

### Requirement: AI-generated operational insights
The system SHALL generate structured insights that include event type, confidence, reasons, affected entities, source metrics, and recommended operator attention level.

#### Scenario: Congestion-related delay insight
- **WHEN** a watched vessel shows low speed near a high-risk port with elevated congestion metrics
- **THEN** the system generates an insight with event `potential_congestion_related_delay`, confidence score, and reasons including derived congestion risk, nearby queue or traffic density, and reduced throughput where available

#### Scenario: LLM unavailable
- **WHEN** the LLM client is disabled or returns an error
- **THEN** the system generates deterministic template insight text from the computed risk context

### Requirement: Disruption propagation
The system SHALL identify likely downstream impact between disrupted chokepoints, ports, routes, and related trade lanes.

#### Scenario: Chokepoint stress propagates
- **WHEN** chokepoint stress remains high for the configured duration
- **THEN** the system creates or updates propagation records for affected downstream ports or regions with explanation and confidence
