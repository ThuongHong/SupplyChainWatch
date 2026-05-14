# Data Dictionary

## `vessel_positions`

Hourly AIS snapshot records. Timestamps are UTC. `geom` is generated in PostGIS from `lon` and `lat`.

## `freight_indices`

Time-series table for FRED, FBX, WCI, weather route indicators, and other scalar indices.

## `bunker_prices`

Daily marine fuel prices by port code and fuel type.

## `port_congestion`

Hourly computed counts around seeded port polygons/radii.

## `chokepoint_status`

Hourly computed vessel counts, median speed, and simple risk score for key maritime chokepoints.

## `trade_flows`

Monthly UN Comtrade data by reporter, partner, commodity, and flow direction.

## `collection_log`

Audit table for every collector run, including start/end time, source, status, row count, and error message.
