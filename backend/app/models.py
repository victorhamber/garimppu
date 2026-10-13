from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """A customer license (or an admin). Access needs is_active and, when set, a future expires_at."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str | None] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    searches: Mapped[list["Search"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    @property
    def expired(self) -> bool:
        if self.expires_at is None:
            return False
        expires = self.expires_at if self.expires_at.tzinfo else self.expires_at.replace(tzinfo=timezone.utc)
        return expires <= utcnow()

    @property
    def has_access(self) -> bool:
        return self.is_admin or (self.is_active and not self.expired)


class AuthSession(Base):
    """Login sessions; only a hash of the cookie token is stored, and deleting the row logs the user out."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class PasswordReset(Base):
    """Single-use "forgot my password" links; only a hash of the token is stored."""

    __tablename__ = "password_resets"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class AppSetting(Base):
    """Settings edited in /admin (webhook, e-mail). A missing key falls back to the environment."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)


class LicenseEvent(Base):
    """Audit trail of what granted or revoked a license: purchase webhooks and admin actions."""

    __tablename__ = "license_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    email: Mapped[str] = mapped_column(String(255))
    origin: Mapped[str] = mapped_column(String(32))  # admin | hotmart | kiwify | cakto | webhook
    action: Mapped[str] = mapped_column(String(32))  # created | granted | revoked | ignored | ...
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Source(Base):
    """One canonical Ad Library query, collected once and shared by every search that asks for it."""

    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(400), unique=True)
    term: Mapped[str] = mapped_column(String(255))
    # When set, collects every ad of this Facebook page instead of searching `term`.
    page_id: Mapped[str | None] = mapped_column(String(64))
    country: Mapped[str] = mapped_column(String(8), default="BR")
    language: Mapped[str | None] = mapped_column(String(8))
    media_type: Mapped[str] = mapped_column(String(16), default="all")  # all | image | video
    collector: Mapped[str] = mapped_column(String(16), default="hybrid")  # scraper | api | hybrid | youtube
    # Derived from the active searches: largest max_ads, most frequent refresh (see pipeline.sources).
    max_ads: Mapped[int] = mapped_column(Integer, default=300)
    refresh_hours: Mapped[int | None] = mapped_column(Integer)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    searches: Mapped[list["Search"]] = relationship(back_populates="source")
    runs: Mapped[list["Run"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="Run.id.desc()"
    )


class Search(Base):
    """A user's subscription to a source: their label and preferences, never the collected data."""

    __tablename__ = "searches"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Null only for searches created before accounts existed, until an admin claims them.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), index=True)
    term: Mapped[str] = mapped_column(String(255))
    # Personal filter applied when viewing this search's creatives; never written onto creatives.
    niche: Mapped[str | None] = mapped_column(String(64))
    max_ads: Mapped[int] = mapped_column(Integer, default=300)
    refresh_hours: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    source: Mapped[Source] = relationship(back_populates="searches")
    user: Mapped[User | None] = relationship(back_populates="searches")


class Run(Base):
    __tablename__ = "source_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued | running | done | error
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ads_found: Mapped[int] = mapped_column(Integer, default=0)
    creatives_found: Mapped[int] = mapped_column(Integer, default=0)
    log: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    source: Mapped[Source] = relationship(back_populates="runs")


class Page(Base):
    __tablename__ = "pages"

    page_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255))
    profile_picture_url: Mapped[str | None] = mapped_column(Text)
    page_like_count: Mapped[int | None] = mapped_column(Integer)
    categories: Mapped[list[str]] = mapped_column(JSON, default=list)
    big_brand: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    active_ads_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Ad(Base):
    __tablename__ = "ads"

    ad_archive_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    page_id: Mapped[str | None] = mapped_column(ForeignKey("pages.page_id"), index=True)
    body: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    cta_text: Mapped[str | None] = mapped_column(String(128))
    link_url: Mapped[str | None] = mapped_column(Text)
    offer_key: Mapped[str | None] = mapped_column(String(255), index=True)
    offer_kind: Mapped[str | None] = mapped_column(String(16))
    offer_platform: Mapped[str | None] = mapped_column(String(32))
    display_format: Mapped[str | None] = mapped_column(String(32))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    platforms: Mapped[list[str]] = mapped_column(JSON, default=list)
    collation_id: Mapped[str | None] = mapped_column(String(64), index=True)
    collation_count: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(16))  # api | scraper | both
    snapshot_url: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    page: Mapped[Page | None] = relationship()
    creatives: Mapped[list["Creative"]] = relationship(secondary="ad_creatives", back_populates="ads")


class SourceAd(Base):
    __tablename__ = "source_ads"

    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    ad_archive_id: Mapped[str] = mapped_column(
        ForeignKey("ads.ad_archive_id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Creative(Base):
    __tablename__ = "creatives"

    id: Mapped[int] = mapped_column(primary_key=True)
    hash: Mapped[str] = mapped_column(String(128), unique=True)
    media_type: Mapped[str] = mapped_column(String(16))  # image | video | text
    media_url: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    local_path: Mapped[str | None] = mapped_column(Text)
    local_video_path: Mapped[str | None] = mapped_column(Text)
    niche: Mapped[str | None] = mapped_column(String(64), index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ads: Mapped[list[Ad]] = relationship(secondary="ad_creatives", back_populates="creatives")
    score: Mapped["CreativeScore | None"] = relationship(
        back_populates="creative", uselist=False, cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="creative", cascade="all, delete-orphan", order_by="Snapshot.taken_on"
    )


class AdCreative(Base):
    __tablename__ = "ad_creatives"

    ad_archive_id: Mapped[str] = mapped_column(
        ForeignKey("ads.ad_archive_id", ondelete="CASCADE"), primary_key=True
    )
    creative_id: Mapped[int] = mapped_column(
        ForeignKey("creatives.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class Snapshot(Base):
    __tablename__ = "snapshots"
    __table_args__ = (UniqueConstraint("creative_id", "taken_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    creative_id: Mapped[int] = mapped_column(ForeignKey("creatives.id", ondelete="CASCADE"), index=True)
    taken_on: Mapped[date] = mapped_column(Date)
    active_ads: Mapped[int] = mapped_column(Integer)

    creative: Mapped[Creative] = relationship(back_populates="snapshots")


class CreativeScore(Base):
    __tablename__ = "creative_scores"

    creative_id: Mapped[int] = mapped_column(ForeignKey("creatives.id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[float] = mapped_column(Float, default=0, index=True)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    days_active: Mapped[int] = mapped_column(Integer, default=0)
    platforms_count: Mapped[int] = mapped_column(Integer, default=0)
    growth_7d: Mapped[float] = mapped_column(Float, default=0)
    page_active_ads: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    creative: Mapped[Creative] = relationship(back_populates="score")


class Video(Base):
    """An organic video found by a YouTube source; counters are the latest collected values."""

    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)  # "<platform>:<external id>"
    platform: Mapped[str] = mapped_column(String(16), index=True)  # youtube
    external_id: Mapped[str] = mapped_column(String(64))
    channel_id: Mapped[str | None] = mapped_column(String(64), index=True)
    channel_title: Mapped[str | None] = mapped_column(String(255))
    channel_subscribers: Mapped[int | None] = mapped_column(BigInteger)
    title: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    is_short: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    niche: Mapped[str | None] = mapped_column(String(32), index=True)
    language: Mapped[str | None] = mapped_column(String(16))  # declared by the uploader, often missing
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    likes: Mapped[int | None] = mapped_column(BigInteger)
    comments: Mapped[int | None] = mapped_column(BigInteger)
    # Most commercial link in the description (checkout > store > app), classified like ad destinations.
    link_url: Mapped[str | None] = mapped_column(Text)
    offer_key: Mapped[str | None] = mapped_column(String(255), index=True)
    offer_kind: Mapped[str | None] = mapped_column(String(16))
    offer_platform: Mapped[str | None] = mapped_column(String(32))
    # Qualification (see pipeline.video_score).
    score: Mapped[float] = mapped_column(Float, default=0, index=True)
    velocity: Mapped[float] = mapped_column(Float, default=0)  # views per day since publication
    outlier: Mapped[float | None] = mapped_column(Float)  # views / channel subscribers
    engagement: Mapped[float | None] = mapped_column(Float)  # (likes + 2*comments) / views
    acceleration: Mapped[float | None] = mapped_column(Float)  # recent views/day over lifetime views/day
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    snapshots: Mapped[list["VideoSnapshot"]] = relationship(
        back_populates="video", cascade="all, delete-orphan", order_by="VideoSnapshot.taken_on"
    )


class VideoSnapshot(Base):
    __tablename__ = "video_snapshots"
    __table_args__ = (UniqueConstraint("video_id", "taken_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    video_id: Mapped[str] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), index=True)
    taken_on: Mapped[date] = mapped_column(Date)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    views: Mapped[int] = mapped_column(BigInteger)

    video: Mapped[Video] = relationship(back_populates="snapshots")


class SourceVideo(Base):
    __tablename__ = "source_videos"

    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    video_id: Mapped[str] = mapped_column(ForeignKey("videos.id", ondelete="CASCADE"), primary_key=True, index=True)


class TikTokAd(Base):
    """A TikTok Creative Center "Top Ad"; metrics are TikTok's own, refreshed on each collection."""

    __tablename__ = "tiktok_ads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # Creative Center material id
    country: Mapped[str] = mapped_column(String(8))
    title: Mapped[str | None] = mapped_column(Text)
    brand: Mapped[str | None] = mapped_column(String(255))
    industry_id: Mapped[int | None] = mapped_column(BigInteger)  # sub-industry
    industry_parent: Mapped[int | None] = mapped_column(BigInteger, index=True)
    objective: Mapped[str | None] = mapped_column(String(64))
    ctr_rank: Mapped[float | None] = mapped_column(Float)  # CTR percentile in its industry: 0.05 = top 5%
    likes: Mapped[int] = mapped_column(BigInteger, default=0)
    comments: Mapped[int | None] = mapped_column(BigInteger)
    shares: Mapped[int | None] = mapped_column(BigInteger)
    budget: Mapped[int | None] = mapped_column(Integer)  # 0 low, 1 medium, 2 high
    duration_s: Mapped[float | None] = mapped_column(Float)
    cover_path: Mapped[str | None] = mapped_column(Text)  # under media_dir; TikTok's cover URLs expire in a day
    landing_page: Mapped[str | None] = mapped_column(Text)
    offer_key: Mapped[str | None] = mapped_column(String(255), index=True)
    offer_kind: Mapped[str | None] = mapped_column(String(16))
    offer_platform: Mapped[str | None] = mapped_column(String(32))
    score: Mapped[float] = mapped_column(Float, default=0, index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceTikTokAd(Base):
    __tablename__ = "source_tiktok_ads"

    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    ad_id: Mapped[str] = mapped_column(ForeignKey("tiktok_ads.id", ondelete="CASCADE"), primary_key=True, index=True)


class Site(Base):
    """A domain seen in a Cloudflare Radar ranking; offer_key matches Ad/TikTokAd offers on the same site."""

    __tablename__ = "sites"

    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    categories: Mapped[str | None] = mapped_column(Text)  # Cloudflare content subcategories, comma separated
    offer_key: Mapped[str | None] = mapped_column(String(255), index=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SourceSite(Base):
    """A site's position in one ranking (country + category + ranking type); previous_rank is the last collection's."""

    __tablename__ = "source_sites"

    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    domain: Mapped[str] = mapped_column(ForeignKey("sites.domain", ondelete="CASCADE"), primary_key=True, index=True)
    rank: Mapped[int] = mapped_column(Integer)
    previous_rank: Mapped[int | None] = mapped_column(Integer)
    pct_rank_change: Mapped[float | None] = mapped_column(Float)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    site: Mapped[Site] = relationship()


class TrendKeyword(Base):
    """A search term that showed up in Google Trends "trending now" for a country; history in TrendSnapshot."""

    __tablename__ = "trend_keywords"
    __table_args__ = (UniqueConstraint("geo", "term_key", name="uq_trend_keywords_geo_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    geo: Mapped[str] = mapped_column(String(8))
    term: Mapped[str] = mapped_column(String(255))
    term_key: Mapped[str] = mapped_column(String(255))  # casefolded, accents kept: Google treats them as distinct
    niche: Mapped[str | None] = mapped_column(String(32), index=True)
    traffic: Mapped[int | None] = mapped_column(BigInteger)  # latest approximate searches ("20000+" -> 20000)
    peak_traffic: Mapped[int | None] = mapped_column(BigInteger, index=True)
    sightings: Mapped[int] = mapped_column(Integer, default=0)  # hourly collections it appeared in
    news: Mapped[list | None] = mapped_column(JSON)  # [{"title", "url", "source"}] from the latest sighting
    picture_url: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class TrendSnapshot(Base):
    """Highest approximate traffic of a trending term on one day; one row per day it trended."""

    __tablename__ = "trend_snapshots"

    keyword_id: Mapped[int] = mapped_column(ForeignKey("trend_keywords.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    traffic: Mapped[int | None] = mapped_column(BigInteger)


class SourceTrend(Base):
    """Every term a trends source has seen; the feed only holds the last hours, so links accumulate."""

    __tablename__ = "source_trends"

    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), primary_key=True)
    keyword_id: Mapped[int] = mapped_column(ForeignKey("trend_keywords.id", ondelete="CASCADE"), primary_key=True,
                                            index=True)


class Collection(Base):
    __tablename__ = "collections"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_collections_user_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    items: Mapped[list["CollectionItem"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    offers: Mapped[list["CollectionOffer"]] = relationship(cascade="all, delete-orphan")
    refs: Mapped[list["CollectionRef"]] = relationship(cascade="all, delete-orphan")


class CollectionItem(Base):
    __tablename__ = "collection_items"

    collection_id: Mapped[int] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    creative_id: Mapped[int] = mapped_column(ForeignKey("creatives.id", ondelete="CASCADE"), primary_key=True)
    note: Mapped[str | None] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    collection: Mapped[Collection] = relationship(back_populates="items")
    creative: Mapped[Creative] = relationship()


class CollectionOffer(Base):
    """Offers have no table of their own (they are ads grouped by Ad.offer_key), so they are saved by key."""

    __tablename__ = "collection_offers"

    collection_id: Mapped[int] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    offer_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CollectionRef(Base):
    """Everything else a user can save, by kind and id: video, tiktok (ad id), site (domain), keyword (id)."""

    __tablename__ = "collection_refs"

    collection_id: Mapped[int] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    ref: Mapped[str] = mapped_column(String(255), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
