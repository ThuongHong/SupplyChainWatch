## ADDED Requirements

### Requirement: PortWatch ingestion
The system SHALL ingest IMF PortWatch and PortStraitWatch data as the primary source for port traffic, trade flow changes, chokepoint throughput, maritime bottlenecks, and regional shipping slowdowns.

#### Scenario: Successful PortWatch collection
- **WHEN** the scheduled PortWatch collector runs with network access available
- **THEN** the system persists validated PortWatch observations with source timestamps, normalized entity identifiers, metric names, metric values, and collection log status

#### Scenario: PortWatch unavailable
- **WHEN** the PortWatch collector cannot fetch fresh data
- **THEN** the system records the failure in `collection_log` and keeps serving the latest cached or stored PortWatch observations

### Requirement: Target maritime entities
The system SHALL maintain first-class monitored entities for Suez Canal, Panama Canal, Strait of Malacca, Red Sea, Black Sea, Singapore, Shanghai, Rotterdam, and Los Angeles.

#### Scenario: Entity seed lookup
- **WHEN** port or chokepoint risk data is requested
- **THEN** the response includes known monitored entities with stable identifiers, names, type, region, and coordinates or geometry references

### Requirement: Port and chokepoint risk scoring
The system SHALL derive normalized risk scores for monitored ports, regions, and chokepoints from PortWatch metrics and stored historical baselines.

#### Scenario: Risk score generated
- **WHEN** new PortWatch observations are available for a monitored entity
- **THEN** the system computes a 0 to 100 risk score with component values for derived congestion risk, traffic anomaly, trade flow change, and bottleneck stress where data exists

#### Scenario: Missing component data
- **WHEN** one or more risk score components are unavailable
- **THEN** the system computes the score from available components and marks missing components in the score metadata

### Requirement: Data freshness and caching
The system SHALL cache PortWatch-derived API responses and expose data freshness metadata to clients.

#### Scenario: Cached response served
- **WHEN** a client requests port risk data within the configured cache window
- **THEN** the system returns cached data with `as_of`, `source`, and `freshness_status` fields
