## ADDED Requirements

### Requirement: Prediction-ready risk feature set
The system SHALL maintain a stable feature set for short-horizon port and chokepoint risk forecasting.

#### Scenario: Forecast feature set requested
- **WHEN** forecast generation runs for a monitored entity
- **THEN** the system reads daily feature snapshots with timestamped values, missing flags, baseline statistics, recent deltas, source freshness, and target risk labels where available

#### Scenario: Feature schema changes
- **WHEN** feature generation logic changes
- **THEN** the system records feature schema version or metadata so forecast outputs can be traced to their inputs

### Requirement: Data sufficiency gating for forecasts
The system SHALL generate forecasts only when minimum historical depth and quality thresholds are met.

#### Scenario: Enough history exists
- **WHEN** an entity has the configured minimum number of historical feature days and acceptable gap rate
- **THEN** the system creates a short-horizon risk forecast with predictions, confidence, train window, model name, and validation metrics

#### Scenario: History is too thin
- **WHEN** an entity does not meet minimum historical depth or quality thresholds
- **THEN** the system does not create a normal forecast and instead exposes an insufficient-history status with missing requirements

### Requirement: Baseline forecast implementation
The system SHALL provide an explainable baseline forecast before advanced machine learning models are required.

#### Scenario: Baseline forecast generated
- **WHEN** sufficient feature history exists and no advanced model is configured
- **THEN** the system generates forecast values using a deterministic baseline method and stores model metadata explaining that method

#### Scenario: Forecast confidence is low
- **WHEN** validation error, gap rate, or source freshness indicates weak forecast quality
- **THEN** the forecast output marks lower confidence and includes the reason in metrics or metadata

### Requirement: Forecast API and UI context
The system SHALL expose forecast outputs with enough context for user-facing interpretation.

#### Scenario: Forecast requested for entity
- **WHEN** a client requests port or chokepoint risk forecast context
- **THEN** the response includes predicted risk path, horizon, confidence, train window, data sufficiency status, key drivers, and latest historical context

#### Scenario: Forecast unavailable
- **WHEN** no valid forecast exists for an entity
- **THEN** the response explains whether the cause is insufficient history, stale sources, disabled task, or computation failure
