import { describe, expect, it } from "vitest";
import { isVideoPost, videoEmbed } from "./post-video";

describe("isVideoPost", () => {
  it("matches the video slug or name", () => {
    expect(
      isVideoPost({ categories: [{ slug: "video", name: "Films" }] }),
    ).toBe(true);
    expect(
      isVideoPost({ categories: [{ slug: "films", name: "Video" }] }),
    ).toBe(true);
    expect(isVideoPost({ categories: [{ slug: "news", name: "News" }] })).toBe(
      false,
    );
  });
});

describe("videoEmbed", () => {
  it("builds a YouTube embed from watch, short, and embed URLs", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=abcdefghijk")).toEqual({
      kind: "iframe",
      src: "https://www.youtube.com/embed/abcdefghijk",
    });
    expect(videoEmbed("https://youtu.be/abcdefghijk")).toEqual({
      kind: "iframe",
      src: "https://www.youtube.com/embed/abcdefghijk",
    });
    expect(videoEmbed("https://www.youtube.com/embed/abcdefghijk")).toEqual({
      kind: "iframe",
      src: "https://www.youtube.com/embed/abcdefghijk",
    });
  });

  it("builds a Vimeo player URL", () => {
    expect(videoEmbed("https://vimeo.com/123456789")).toEqual({
      kind: "iframe",
      src: "https://player.vimeo.com/video/123456789",
    });
  });

  it("keeps a direct video file", () => {
    expect(videoEmbed("https://cdn.example.com/clip.mp4")).toEqual({
      kind: "file",
      src: "https://cdn.example.com/clip.mp4",
    });
  });

  it("rejects scripts, unknown hosts, and empty URLs", () => {
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
    expect(videoEmbed("https://evil.example/watch?v=abcdefghijk")).toBeNull();
    expect(videoEmbed("")).toBeNull();
    expect(videoEmbed(null)).toBeNull();
  });
});
