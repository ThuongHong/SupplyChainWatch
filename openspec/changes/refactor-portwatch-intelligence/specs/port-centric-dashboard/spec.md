## ADDED Requirements

### Requirement: PortWatch default dashboard
The frontend SHALL open to a PortWatch intelligence dashboard focused on global port risk, congestion heatmaps, traffic trend anomalies, chokepoint stress, and disruption propagation.

#### Scenario: Dashboard loads
- **WHEN** a user opens the application
- **THEN** the first screen presents port and chokepoint risk summaries before any vessel-position map view

### Requirement: Global port risk visualization
The dashboard SHALL visualize monitored port and chokepoint risk using map layers, ranked lists, trend cards, and severity states.

#### Scenario: High-risk port selected
- **WHEN** a user selects a high-risk port
- **THEN** the dashboard shows current risk score, component drivers, congestion trend, related weather, related economic indicators, and active vessel watchlist context

### Requirement: Congestion heatmaps and anomaly trends
The dashboard SHALL provide congestion heatmaps and traffic trend anomaly charts for monitored ports and regions.

#### Scenario: Congestion heatmap toggled
- **WHEN** a user enables the congestion heatmap layer
- **THEN** the map renders severity-coded congestion for monitored ports with no dependency on rendering every vessel globally

### Requirement: Chokepoint stress analysis
The dashboard SHALL show stress and trend views for Suez Canal, Panama Canal, Strait of Malacca, Red Sea, and Black Sea.

#### Scenario: Chokepoint detail opened
- **WHEN** a user opens a chokepoint detail view
- **THEN** the UI displays stress score, traffic anomaly trend, weather context, disruption summary, and downstream impact indicators

### Requirement: Vessel map as drilldown
The frontend SHALL keep vessel visualization as a contextual drilldown for watchlist vessels and selected risky entities.

#### Scenario: Watchlist drilldown
- **WHEN** a user opens vessel context from a risky port or chokepoint
- **THEN** the map displays only relevant watchlist vessels, route traces, ETA drift, and anomaly markers

### Requirement: Demo-friendly data states
The frontend SHALL handle missing keys, stale external data, and fallback seeded data with clear data-state indicators.

#### Scenario: External source stale
- **WHEN** PortWatch or supporting source data is stale
- **THEN** the UI shows freshness status while continuing to render latest available metrics and insights
