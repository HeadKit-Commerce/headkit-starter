"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { syncInlineVideoPlayback } from "@/components/headkit-ui/autoplay-video-playback";

export interface AutoplayVideoProps {
  src: string;
  poster?: string;
  className?: string;
  /** When false, playback pauses (fade carousels keep every slide mounted). */
  isActive?: boolean;
  preload?: "auto" | "metadata" | "none";
}

/** Muted inline hero video with Safari-safe programmatic autoplay. */
export function AutoplayVideo({
  src,
  poster,
  className,
  isActive = true,
  preload = "metadata",
}: AutoplayVideoProps): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    syncInlineVideoPlayback(video, isActive);

    if (!isActive) return;

    const retry = (): void => {
      syncInlineVideoPlayback(video, true);
    };

    video.addEventListener("loadeddata", retry);
    video.addEventListener("canplay", retry);

    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        retry();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      video.removeEventListener("loadeddata", retry);
      video.removeEventListener("canplay", retry);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isActive, src]);

  return (
    <video
      ref={ref}
      className={cn(className)}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload={preload}
      disablePictureInPicture
    />
  );
}
