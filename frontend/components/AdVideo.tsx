"use client";

import { useEffect, useRef } from "react";

/** Next keeps the page you left mounted but hidden; its effects are cleaned up, so pausing there silences it. */
export function AdVideo(props: React.VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    return () => video?.pause();
  }, []);
  return <video ref={ref} {...props} />;
}
