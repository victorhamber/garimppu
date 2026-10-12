"use client";

/* eslint-disable @next/next/no-img-element -- media is served by the backend or Meta's CDN */
import { useState } from "react";
import { API_URL } from "@/lib/api";

type Props = {
  src: string;
  alt: string;
  className?: string;
  /** Shown when the image fails or is a flat black frame (videos whose first frame is black). */
  fallback: React.ReactNode;
};

/** Brightest pixel of an 8×8 sample; a flat black frame stays near zero. */
function isBlankFrame(img: HTMLImageElement): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(img, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      max = Math.max(max, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    }
    return max < 16;
  } catch {
    return false;
  }
}

export function CoverImage({ src, alt, className = "", fallback }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Only our own media is CORS-enabled; sampling a Meta CDN image would taint the canvas.
  const sampled = src.startsWith(API_URL);

  if (failedSrc === src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      crossOrigin={sampled ? "anonymous" : undefined}
      className={className}
      onError={() => setFailedSrc(src)}
      onLoad={(e) => {
        if (sampled && isBlankFrame(e.currentTarget)) setFailedSrc(src);
      }}
    />
  );
}

/** Reserve cover for a video with no usable frame: play mark plus the ad's opening words. */
export function VideoFallback({ text, className = "", compact = false }: { text?: string | null; className?: string; compact?: boolean }) {
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-2 text-center ${compact ? "p-1" : "p-6 pb-10"} ${className}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-full border border-line bg-background/60 text-foreground ${compact ? "size-7" : "size-12"}`}>
        <svg viewBox="0 0 24 24" className={compact ? "size-3" : "size-5"} fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      </span>
      {!compact && text && <p className="line-clamp-4 text-sm leading-normal text-muted">{text}</p>}
    </div>
  );
}
