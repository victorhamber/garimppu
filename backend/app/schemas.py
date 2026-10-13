from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SearchCreate(BaseModel):
    term: str = Field(default="", max_length=255)
    page: str | None = Field(default=None, max_length=500)  # Ad Library link, profile link or numeric page ID
    country: str = Field(default="BR", min_length=2, max_length=8)
    language: str | None = Field(default=None, max_length=8)
    media_type: Literal["all", "image", "video"] = "all"
    niche: str | None = None
    source: Literal["scraper", "api", "hybrid", "youtube", "tiktok"] = "hybrid"
    tiktok_industry: int | None = None  # TikTok top-level industry id; None = all
    max_ads: int = Field(default=300, ge=10, le=3000)
    refresh_hours: int | None = Field(default=None, ge=24, le=720)
    run_now: bool = True


class SearchUpdate(BaseModel):
    niche: str | None = None
    max_ads: int | None = Field(default=None, ge=10, le=3000)
    refresh_hours: int | None = Field(default=None, ge=24, le=720)
    is_active: bool | None = None


class RunOut(ORM):
    id: int
    status: str
    started_at: datetime | None
    finished_at: datetime | None
    ads_found: int
    creatives_found: int
    error: str | None
    log: str | None
    created_at: datetime


class SearchOut(BaseModel):
    id: int
    term: str
    page_id: str | None
    country: str
    language: str | None
    media_type: str
    niche: str | None
    source: str
    max_ads: int
    refresh_hours: int | None
    is_active: bool
    last_run_at: datetime | None
    created_at: datetime
    latest_run: RunOut | None = None
    creatives_count: int = 0
    # When the shared source started being collected, possibly before this search existed.
    monitored_since: datetime
    # Set on creation when an existing, recently collected source was reused instead of collecting again.
    reused: bool = False


class PageOut(ORM):
    page_id: str
    name: str | None
    profile_picture_url: str | None
    page_like_count: int | None
    active_ads_count: int
    big_brand: bool = False


class ScoreOut(ORM):
    score: float
    duplicates: int
    days_active: int
    platforms_count: int
    growth_7d: float
    page_active_ads: int
    is_active: bool


class AdOut(ORM):
    ad_archive_id: str
    page_id: str | None
    body: str | None
    title: str | None
    caption: str | None
    cta_text: str | None
    link_url: str | None
    display_format: str | None
    start_date: date | None
    end_date: date | None
    is_active: bool
    platforms: list[str]
    collation_count: int | None
    source: str
    library_url: str
    last_seen_at: datetime


class OfferRef(BaseModel):
    key: str
    label: str
    kind: str
    platform: str | None


class CreativeCard(BaseModel):
    id: int
    media_type: str
    image: str | None
    video: str | None
    niche: str | None
    score: ScoreOut | None
    page: PageOut | None
    body: str | None
    title: str | None
    cta_text: str | None
    link_url: str | None
    library_url: str | None
    start_date: date | None
    platforms: list[str]
    ads_count: int
    first_seen_at: datetime
    collection_ids: list[int] = []
    offer: OfferRef | None = None
    has_history: bool = False


class SnapshotOut(ORM):
    taken_on: date
    active_ads: int


class CreativeDetail(CreativeCard):
    ads: list[AdOut]
    snapshots: list[SnapshotOut]


class ScoreHeat(BaseModel):
    hot: float | None = None
    warm: float | None = None


class CreativeHeat(ScoreHeat):
    duplicates: int | None = None
    days_active: int | None = None


class CreativePage(BaseModel):
    total: int
    items: list[CreativeCard]
    heat: CreativeHeat = CreativeHeat()
    has_history: bool = False
    hidden_brands: int = 0


class OfferPreview(BaseModel):
    creative_id: int
    media_type: str
    image: str | None
    text: str | None


class OfferAdvertiser(BaseModel):
    page_id: str
    name: str | None
    ads: int


class OfferOut(BaseModel):
    key: str
    label: str
    kind: str
    platform: str | None
    url: str | None
    score: float
    advertisers: int
    ads: int
    creatives: int
    days_active: int
    first_seen_at: datetime
    top_advertisers: list[OfferAdvertiser]
    previews: list[OfferPreview]
    collection_ids: list[int] = []
    videos: int = 0


class VideoOut(ORM):
    id: str
    platform: str
    external_id: str
    url: str
    title: str | None
    channel_id: str | None
    channel_title: str | None
    channel_subscribers: int | None
    thumbnail_url: str | None
    duration_s: int | None
    is_short: bool
    published_at: datetime
    niche: str | None
    language: str | None
    views: int
    likes: int | None
    comments: int | None
    link_url: str | None
    offer_key: str | None
    offer_label: str | None = None
    offer_kind: str | None
    offer_platform: str | None
    score: float
    velocity: float
    outlier: float | None
    engagement: float | None
    acceleration: float | None
    first_seen_at: datetime


class VideoPage(BaseModel):
    total: int
    items: list[VideoOut]
    heat: ScoreHeat = ScoreHeat()
    enabled: bool = True


class TikTokAdOut(BaseModel):
    id: str
    url: str
    country: str
    title: str | None
    brand: str | None
    industry: str | None
    industry_id: int | None
    objective: str | None
    ctr_rank: float | None
    likes: int
    comments: int | None
    shares: int | None
    budget: int | None
    duration_s: float | None
    cover: str | None
    landing_page: str | None
    offer_key: str | None
    offer_label: str | None
    score: float
    first_seen_at: datetime


class TikTokAdPage(BaseModel):
    total: int
    items: list[TikTokAdOut]
    heat: ScoreHeat = ScoreHeat()


class TikTokIndustry(BaseModel):
    id: int
    label: str


class OfferPage(BaseModel):
    total: int
    items: list[OfferOut]
    platforms: list[str]
    heat: ScoreHeat = ScoreHeat()
    hidden_brands: int = 0


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)


class CollectionOut(ORM):
    id: int
    name: str
    created_at: datetime
    items_count: int = 0
    offers_count: int = 0


class CollectionItemCreate(BaseModel):
    creative_id: int
    note: str | None = None


class CollectionOfferCreate(BaseModel):
    offer_key: str = Field(min_length=1, max_length=255)


EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class MeOut(ORM):
    id: int
    email: str
    name: str | None
    is_admin: bool
    expires_at: datetime | None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class LicenseEventOut(ORM):
    id: int
    email: str
    origin: str
    action: str
    detail: str | None
    created_at: datetime


class AdminUserOut(BaseModel):
    id: int
    email: str
    name: str | None
    is_admin: bool
    is_active: bool
    expires_at: datetime | None
    status: Literal["ativa", "bloqueada", "expirada", "admin"]
    created_at: datetime
    last_login_at: datetime | None
    searches_count: int
    last_event: LicenseEventOut | None


class AdminUserCreate(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN, max_length=255)
    name: str | None = Field(default=None, max_length=128)
    expires_at: datetime | None = None
    send_email: bool = True


class AdminUserUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    is_active: bool | None = None
    is_admin: bool | None = None
    expires_at: datetime | None = None


class AccessIssued(BaseModel):
    user: AdminUserOut
    emailed: bool
    # Only when the e-mail could not be sent: shown once to the admin to pass on.
    temporary_password: str | None = None


class AdminSettingsOut(BaseModel):
    email_configured: bool
    webhook_configured: bool


class WebhookSettingsOut(BaseModel):
    url: str | None
    product_ids: list[str]
    # None: a purchase gives access until a refund, chargeback or cancellation arrives.
    access_days: int | None


class WebhookSettingsIn(BaseModel):
    product_ids: list[str] = Field(default_factory=list, max_length=50)
    access_days: int | None = Field(default=None, ge=1, le=3650)


class EmailSettingsOut(BaseModel):
    configured: bool
    provider: Literal["resend", "smtp"] | None
    has_resend_api_key: bool
    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    has_smtp_password: bool
    smtp_tls: bool
    from_email: str | None
    from_name: str
    access_subject: str
    access_html: str
    reset_subject: str
    reset_html: str


class EmailSettingsIn(BaseModel):
    provider: Literal["resend", "smtp"] | None = None
    # Secrets: omitted or empty keeps the saved value.
    resend_api_key: str | None = Field(default=None, max_length=256)
    smtp_password: str | None = Field(default=None, max_length=256)
    smtp_host: str | None = Field(default=None, max_length=255)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str | None = Field(default=None, max_length=255)
    smtp_tls: bool = True
    from_email: str | None = Field(default=None, max_length=255)
    from_name: str | None = Field(default=None, max_length=128)
    access_subject: str | None = Field(default=None, max_length=255)
    access_html: str | None = Field(default=None, max_length=50_000)
    reset_subject: str | None = Field(default=None, max_length=255)
    reset_html: str | None = Field(default=None, max_length=50_000)


class EmailTestOut(BaseModel):
    ok: bool
    sent_to: str
    error: str | None = None


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=128)
    new_password: str = Field(min_length=8, max_length=256)
