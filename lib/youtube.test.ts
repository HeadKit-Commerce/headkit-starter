import { describe, expect, it } from "vitest";
import {
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
} from "./youtube";

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["  https://youtu.be/dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
  ])("parses %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["   "],
    ["not a url"],
    ["https://vimeo.com/123456789"],
    ["https://example.com/watch?v=dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=tooshort"],
    ["https://www.youtube.com/channel/UCabc"],
    ["https://youtu.be/"],
  ])("yields null for %s so the caller renders no tile", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});

describe("derived URLs", () => {
  it("uses the poster frame every video has and the privacy-enhanced embed host", () => {
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });
});
