"""Relative heat: cutoffs that light only the top of the current result set.

Absolute thresholds made almost every top result glow, so the amber stopped meaning anything.
"""

from collections.abc import Mapping, Sequence

HOT_SHARE = 0.05
WARM_SHARE = 0.20
# Metrics drive the score, so lighting them at the score's warm share lit every top card twice.
METRIC_SHARE = 0.10
MIN_DUPLICATES = 2
MIN_DAYS_ACTIVE = 7
# Week-over-week change in active ads; a few percent is collection noise, not growth.
MIN_GROWTH = 0.10


def rank_cutoff(values: Sequence[float], share: float) -> float | None:
    """Value at the boundary of the top `share` of `values`; None when the set is too small for that share."""
    k = int(len(values) * share)
    if k < 1:
        return None
    return sorted(values, reverse=True)[k - 1]


RANK_SHARES = (0.01, 0.05, 0.10, 0.20, 0.50)


def rank_cutoffs(values: Sequence[float]) -> list[tuple[float, float]]:
    """(share, cutoff) steps the badge reads as "top N%"; steps the set is too small for are left out."""
    return [(share, cutoff) for share in RANK_SHARES if (cutoff := rank_cutoff(values, share)) is not None]


def metric_cutoffs(
    columns: Mapping[str, Sequence[float | None]],
    minimums: Mapping[str, float] | None = None,
    lower_is_better: frozenset[str] = frozenset(),
) -> dict[str, float]:
    """Per-metric value that lights the top METRIC_SHARE of the result.

    A metric is left out when the set is too small, or when its cutoff is also the set's worst value
    (every row tied, e.g. all running 90 days): lighting everything would say nothing.
    Metrics in `lower_is_better` (a percentile like TikTok's CTR rank) cut from the bottom instead.
    """
    minimums = minimums or {}
    out: dict[str, float] = {}
    for name, raw in columns.items():
        values = [v for v in raw if v is not None]
        if not values:
            continue
        lower = name in lower_is_better
        signed = [-v for v in values] if lower else values
        cutoff = rank_cutoff(signed, METRIC_SHARE)
        if cutoff is None or cutoff <= min(signed):
            continue
        cutoff = -cutoff if lower else cutoff
        if name in minimums:
            cutoff = min(cutoff, minimums[name]) if lower else max(cutoff, minimums[name])
        out[name] = cutoff
    return out
