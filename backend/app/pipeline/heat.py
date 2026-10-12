"""Relative heat: cutoffs that light only the top of the current result set.

Absolute thresholds made almost every top result glow, so the amber stopped meaning anything.
"""

from collections.abc import Sequence

HOT_SHARE = 0.05
WARM_SHARE = 0.20
# Metrics drive the score, so lighting them at the score's warm share lit every top card twice.
METRIC_SHARE = 0.10
MIN_DUPLICATES = 2
MIN_DAYS_ACTIVE = 7


def rank_cutoff(values: Sequence[float], share: float) -> float | None:
    """Value at the boundary of the top `share` of `values`; None when the set is too small for that share."""
    k = int(len(values) * share)
    if k < 1:
        return None
    return sorted(values, reverse=True)[k - 1]


def floored(cutoff: float | None, minimum: int) -> int | None:
    return None if cutoff is None else max(int(cutoff), minimum)
