import { mediaUrl, type Creative } from "@/lib/api";
import { AdVideo } from "./AdVideo";
import { CoverImage, VideoFallback } from "./CoverImage";

type Props = {
  creative: Pick<Creative, "media_type" | "image" | "video" | "body" | "title">;
  controls?: boolean;
  fit?: "cover" | "contain";
  /** Thumbnail size: the reserve cover drops its text. */
  compact?: boolean;
  className?: string;
};

export function CreativeMedia({ creative, controls = false, fit = "cover", compact = false, className = "" }: Props) {
  const image = mediaUrl(creative.image);
  const video = mediaUrl(creative.video);
  const fitClass = fit === "cover" ? "object-cover" : "object-contain";
  const summary = creative.title ?? creative.body?.slice(0, 120);
  const name = (kind: string) => (summary ? `${kind} do anúncio: ${summary}` : `${kind} do anúncio`);
  const text = creative.body ?? creative.title;

  if (controls && video) {
    return <AdVideo src={video} poster={image ?? undefined} controls preload="none" aria-label={name("Vídeo")}
      className={`h-full w-full bg-black object-contain ${className}`} />;
  }

  const textFallback = (
    <div className={`flex h-full w-full items-center bg-surface-2 text-muted ${compact ? "p-1.5 text-micro leading-tight" : "p-4 text-sm leading-relaxed"} ${className}`}>
      <p className={compact ? "line-clamp-4" : "line-clamp-[8]"}>{text ?? "Sem mídia"}</p>
    </div>
  );
  const fallback = creative.media_type === "video" ? <VideoFallback text={text} compact={compact} className={className} /> : textFallback;

  if (image) {
    return (
      <CoverImage
        src={image}
        alt={name(creative.media_type === "video" ? "Capa do vídeo" : "Imagem")}
        className={`h-full w-full ${fitClass} ${className}`}
        fallback={fallback}
      />
    );
  }
  return fallback;
}
