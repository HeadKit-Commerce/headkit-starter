/** Video-like surface for hero carousel autoplay (Safari needs muted + play()). */
export interface InlineVideoPlayback {
  muted: boolean;
  defaultMuted: boolean;
  playsInline: boolean;
  play: () => Promise<void> | undefined;
  pause: () => void;
}

/** Apply attributes Safari requires before programmatic play(). */
export function applyInlineAutoplayAttrs(video: InlineVideoPlayback): void {
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
}

/** Play the active slide video; pause inactive slides in stacked fade carousels. */
export function syncInlineVideoPlayback(
  video: InlineVideoPlayback,
  isActive: boolean,
): void {
  applyInlineAutoplayAttrs(video);
  if (isActive) {
    try {
      const result = video.play();
      if (result !== undefined) {
        result.catch(() => {
          // Safari may reject until buffered; loadeddata handler retries.
        });
      }
    } catch {
      // play() throws on some browsers when autoplay is blocked.
    }
    return;
  }
  video.pause();
}
