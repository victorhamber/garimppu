"use client";

import { useState } from "react";
import { apiFile } from "@/lib/api";

/** Saves the creative's video or image; the API streams it so Meta's cross-origin URL still downloads as a file. */
export function DownloadMedia({ creativeId, video }: { creativeId: number; video: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");
  const label = video ? "Baixar vídeo" : "Baixar imagem";

  async function download() {
    setState("busy");
    try {
      const { blob, filename } = await apiFile(`/api/creatives/${creativeId}/download`, "*/*");
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), {
        href: url, download: filename ?? `criativo-${creativeId}.${video ? "mp4" : "jpg"}`,
      });
      link.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" className="btn h-8 gap-1.5 text-xs pointer-coarse:h-11" onClick={download} disabled={state === "busy"}>
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {state === "busy" ? "Baixando..." : label}
      </button>
      <p role="status" className="text-xs text-danger empty:hidden">{state === "error" ? error : ""}</p>
    </div>
  );
}
