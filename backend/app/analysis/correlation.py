from __future__ import annotations

import math
from collections.abc import Mapping, Sequence


def pearson_correlation(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Compute Pearson correlation for two aligned series."""
    if len(xs) != len(ys) or len(xs) < 2:
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    denominator = denom_x * denom_y
    if denominator == 0:
        return None
    return numerator / denominator


def correlation_matrix(
    series: Mapping[str, Mapping[str, float]],
) -> list[dict[str, object]]:
    """Build a zero-lag correlation matrix from date-keyed index series."""
    names = sorted(series)
    cells: list[dict[str, object]] = []
    for left in names:
        for right in names:
            common_dates = sorted(set(series[left]) & set(series[right]))
            xs = [series[left][day] for day in common_dates]
            ys = [series[right][day] for day in common_dates]
            corr = pearson_correlation(xs, ys)
            cells.append(
                {
                    "index_a": left,
                    "index_b": right,
                    "correlation": corr,
                    "lag_days": 0,
                    "overlap": len(common_dates),
                }
            )
    return cells


def best_lagged_correlation(
    source: Mapping[str, float],
    target: Mapping[str, float],
    lags: Sequence[int],
) -> dict[str, object]:
    """Find the highest absolute lagged correlation for date-keyed daily series."""
    source_items = sorted(source.items())
    target_values = dict(target)
    best_corr: float | None = None
    best_lag = 0
    best_overlap = 0
    for lag in lags:
        shifted: list[tuple[float, float]] = []
        for index, (_, value) in enumerate(source_items):
            target_index = index + lag
            if target_index < 0 or target_index >= len(source_items):
                continue
            target_day = source_items[target_index][0]
            if target_day in target_values:
                shifted.append((value, target_values[target_day]))
        corr = pearson_correlation([item[0] for item in shifted], [item[1] for item in shifted])
        if corr is not None and (best_corr is None or abs(corr) > abs(best_corr)):
            best_corr = corr
            best_lag = lag
            best_overlap = len(shifted)
    return {"correlation": best_corr, "lag_days": best_lag, "overlap": best_overlap}
