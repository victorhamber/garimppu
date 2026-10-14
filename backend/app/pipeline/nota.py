"""Nota de escala: every score in Garimppu is 0-100, a weighted sum of signals that each fill up at a cap.

A signal not measured yet (growth before the 2nd collection, likes a channel hides) is left out and the other
weights scale up, so it neither helps nor hurts. The extension (extension/filters.js) repeats the creative formula.
"""

import math
from collections.abc import Sequence

# Tiers the badge names; kept in sync with frontend/components/Metrics.tsx and extension/filters.js.
SCALED = 65
HOT = 50
WARM = 35


def linear(value: float, cap: float) -> float:
    return max(0.0, min(value / cap, 1.0))


def log_share(value: float, cap: float) -> float:
    """0 at 0, 1 at `cap`, on a log scale: the first few count more than the last few."""
    return min(math.log2(1 + max(value, 0)) / math.log2(1 + cap), 1.0)


def weighted(parts: Sequence[tuple[float, float | None]]) -> float:
    known = [(weight, share) for weight, share in parts if share is not None]
    total = sum(weight for weight, _ in known)
    return round(100 * sum(weight * share for weight, share in known) / total, 1) if total else 0.0
