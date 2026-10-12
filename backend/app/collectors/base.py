from dataclasses import dataclass, field
from datetime import date


@dataclass
class RawAd:
    """Source-agnostic ad record produced by every collector."""

    ad_archive_id: str
    source: str
    page_id: str | None = None
    page_name: str | None = None
    page_profile_picture_url: str | None = None
    page_like_count: int | None = None
    page_categories: list[str] = field(default_factory=list)
    body: str | None = None
    title: str | None = None
    caption: str | None = None
    cta_text: str | None = None
    link_url: str | None = None
    display_format: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool = True
    platforms: list[str] = field(default_factory=list)
    collation_id: str | None = None
    collation_count: int | None = None
    image_urls: list[str] = field(default_factory=list)
    video_urls: list[str] = field(default_factory=list)
    video_preview_urls: list[str] = field(default_factory=list)
    snapshot_url: str | None = None


@dataclass
class SearchQuery:
    term: str
    country: str = "BR"
    language: str | None = None
    media_type: str = "all"
    max_ads: int = 300
    page_id: str | None = None
