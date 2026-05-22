from __future__ import annotations

from sqlalchemy import text

from app.collectors.portwatch import demo_portwatch_rows
from app.db.session import SessionLocal

PORTS = [
    ("CNSHA", "Shanghai", "China", "East Asia", 31.2304, 121.4737, 30, 47030000),
    ("SGSIN", "Singapore", "Singapore", "Southeast Asia", 1.2644, 103.8200, 25, 37290000),
    ("CNNGB", "Ningbo-Zhoushan", "China", "East Asia", 29.8683, 121.5440, 25, 33350000),
    ("CNSZX", "Shenzhen", "China", "East Asia", 22.5431, 114.0579, 25, 30040000),
    ("KRPUS", "Busan", "South Korea", "East Asia", 35.1796, 129.0756, 25, 22710000),
    ("USLAX", "Los Angeles", "United States", "North America", 33.7405, -118.2775, 25, 9500000),
    ("USLGB", "Long Beach", "United States", "North America", 33.7542, -118.2165, 25, 9130000),
    ("NLRTM", "Rotterdam", "Netherlands", "Europe", 51.9244, 4.4777, 25, 14450000),
    ("AEJEA", "Jebel Ali", "United Arab Emirates", "Middle East", 25.0118, 55.0613, 25, 14000000),
    ("DEHAM", "Hamburg", "Germany", "Europe", 53.5511, 9.9937, 20, 8300000),
]

CHOKEPOINTS = [
    ("Suez Canal", "POLYGON((32.25 29.85,32.7 29.85,32.7 31.35,32.25 31.35,32.25 29.85))"),
    ("Panama Canal", "POLYGON((-80.0 8.8,-79.4 8.8,-79.4 9.4,-80.0 9.4,-80.0 8.8))"),
    ("Strait of Hormuz", "POLYGON((55.5 25.3,57.3 25.3,57.3 27.0,55.5 27.0,55.5 25.3))"),
    ("Strait of Malacca", "POLYGON((99.0 1.0,104.0 1.0,104.0 6.5,99.0 6.5,99.0 1.0))"),
    ("Bab-el-Mandeb", "POLYGON((42.5 12.2,44.0 12.2,44.0 13.5,42.5 13.5,42.5 12.2))"),
    ("Red Sea", "POLYGON((32.0 12.0,44.0 12.0,44.0 30.0,32.0 30.0,32.0 12.0))"),
    ("Black Sea", "POLYGON((27.0 40.0,42.0 40.0,42.0 47.5,27.0 47.5,27.0 40.0))"),
]


def main() -> None:
    """Seed major ports and chokepoints."""
    with SessionLocal() as db:
        for locode, name, country, region, lat, lon, radius_km, teu in PORTS:
            db.execute(
                text("""
                    INSERT INTO ports
                        (locode, name, country, region, geom, radius_km, twenty_ft_eq_units_year)
                    VALUES
                        (:locode, :name, :country, :region,
                         ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::GEOGRAPHY,
                         :radius_km, :teu)
                    ON CONFLICT (locode) DO UPDATE SET
                        name = EXCLUDED.name,
                        country = EXCLUDED.country,
                        region = EXCLUDED.region,
                        geom = EXCLUDED.geom,
                        radius_km = EXCLUDED.radius_km,
                        twenty_ft_eq_units_year = EXCLUDED.twenty_ft_eq_units_year
                    """),
                {
                    "locode": locode,
                    "name": name,
                    "country": country,
                    "region": region,
                    "lat": lat,
                    "lon": lon,
                    "radius_km": radius_km,
                    "teu": teu,
                },
            )
        for name, wkt in CHOKEPOINTS:
            db.execute(
                text("""
                    INSERT INTO chokepoints (name, geom)
                    SELECT :name, ST_GeogFromText(:wkt)
                    WHERE NOT EXISTS (SELECT 1 FROM chokepoints WHERE name = :name)
                    """),
                {"name": name, "wkt": wkt},
            )
        for row in demo_portwatch_rows():
            db.execute(
                text("""
                    INSERT INTO portwatch_metrics (
                        observed_at, entity_type, entity_id, entity_name,
                        metric_name, metric_value, unit, source, source_entity_id, metadata
                    )
                    SELECT :observed_at, :entity_type, :entity_id, :entity_name,
                           :metric_name, :metric_value, :unit, :source, :source_entity_id,
                           CAST(:metadata AS JSONB)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM portwatch_metrics
                        WHERE entity_id = :entity_id
                          AND metric_name = :metric_name
                          AND source = :source
                    )
                    """),
                {
                    **row,
                    "metadata": "{}",
                },
            )
        db.commit()


if __name__ == "__main__":
    main()
