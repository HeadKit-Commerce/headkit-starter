import { describe, expect, it, vi } from "vitest";
import {
  applyInlineAutoplayAttrs,
  syncInlineVideoPlayback,
  type InlineVideoPlayback,
} from "@/components/headkit-ui/autoplay-video-playback";

function mockVideo(
  overrides: Partial<InlineVideoPlayback> = {},
): InlineVideoPlayback {
  return {
    muted: false,
    defaultMuted: false,
    playsInline: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides,
  };
}

describe("applyInlineAutoplayAttrs", () => {
  it("forces muted inline playback attrs Safari expects", () => {
    const video = mockVideo();
    applyInlineAutoplayAttrs(video);
    expect(video.muted).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video.playsInline).toBe(true);
  });
});

describe("syncInlineVideoPlayback", () => {
  it("plays when the slide is active", () => {
    const video = mockVideo();
    syncInlineVideoPlayback(video, true);
    expect(vi.mocked(video.play)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(video.pause)).not.toHaveBeenCalled();
  });

  it("pauses when the slide is inactive", () => {
    const video = mockVideo();
    syncInlineVideoPlayback(video, false);
    expect(vi.mocked(video.pause)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(video.play)).not.toHaveBeenCalled();
  });

  it("ignores play() rejections (Safari deferred autoplay)", async () => {
    const video = mockVideo({
      play: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
    });
    expect(() => syncInlineVideoPlayback(video, true)).not.toThrow();
    await Promise.resolve();
  });
});
