import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, diffImages, encodePng, inkRatio } from "./png";
import type { Rgba } from "./png";

function solid(width: number, height: number, rgba: readonly number[]): Rgba {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(rgba, i * 4);
  return { width, height, data };
}

describe("PNG codec", () => {
  it("round-trips an image through encode and decode", () => {
    const image = solid(9, 7, [12, 200, 45, 255]);
    image.data.set([1, 2, 3, 255], (3 * 9 + 4) * 4);
    const back = decodePng(encodePng(image));
    expect(back.width).toBe(9);
    expect(back.height).toBe(7);
    expect(Array.from(back.data)).toEqual(Array.from(image.data));
  });

  it("refuses a non-PNG by name rather than decoding garbage", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/not a PNG/);
  });
});

/**
 * Scanline reconstruction for the filter types a REAL screenshot uses.
 *
 * `encodePng` writes filter 0 on every scanline, so the round-trip test above
 * exercises exactly one of the five reconstruction branches. Chromium's
 * screenshots use Sub, Up, Average and Paeth throughout, and a bug in any of
 * them would fail no test while fabricating or hiding pixel differences in a
 * real report. So these assemble the FILTERED bytes by hand, deflate them, and
 * assert the decoded pixels — which are known by construction, worked out from
 * the PNG spec's reconstruction formulas rather than by running the decoder.
 */
describe("PNG scanline filters", () => {
  const CRC = ((): Uint32Array => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1)
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(buf: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1)
      c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type: string, data: Uint8Array): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([
      Buffer.from(type, "latin1"),
      Buffer.from(data),
    ]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  }

  /** A PNG whose IDAT is exactly the filtered scanlines given, verbatim. */
  function pngOf(
    width: number,
    height: number,
    colorType: 0 | 6,
    filteredRows: readonly (readonly number[])[],
  ): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = colorType;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk(
        "IDAT",
        deflateSync(Buffer.from(filteredRows.flatMap((r) => [...r]))),
      ),
      chunk("IEND", new Uint8Array(0)),
    ]);
  }

  function greyRow(values: readonly number[]): number[] {
    return values.flatMap((g) => [g, g, g, 255]);
  }

  it("reconstructs Sub, Up, Average and Paeth scanlines", () => {
    // Grayscale (1 byte per pixel) so the arithmetic is checkable by eye. Each
    // row is [filter type, ...filtered bytes]; the expected values below follow
    // from the spec's formulas, worked out here rather than by the decoder.
    // `a` is the byte to the left, `b` the byte above, `c` the byte above-left.
    //
    //   row 0  None     value = raw
    //   row 1  Sub      value = raw + a
    //   row 2  Up       value = raw + b
    //   row 3  Average  value = raw + ((a + b) >> 1)   — wraps at x=2,3,4, and
    //                    x=4 sums to an ODD 81 so the FLOOR is load-bearing
    //   row 4  Paeth    value = raw + paeth(a, b, c)
    //
    // Row 4 deliberately exercises ALL THREE Paeth outcomes, because a
    // predictor that picks the wrong one of the three still produces plausible
    // pixels: x=0 and x=2,3 return `b`, x=1 returns `c` (a=10, b=200, c=100:
    // p=110, so pc=10 is the smallest), and x=4 returns `a` (a=35, b=30, c=30:
    // p=35, so pa=0). Passing `c` in wrong is invisible to any row where the
    // `c` branch never wins.
    const png = pngOf(5, 5, 0, [
      [0, 10, 20, 30, 40, 50],
      [1, 5, 3, 2, 1, 1],
      [2, 45, 42, 40, 39, 39],
      [3, 75, 125, 191, 231, 246],
      [4, 166, 30, 10, 5, 10],
    ]);
    const image = decodePng(png);
    expect(image.width).toBe(5);
    expect(image.height).toBe(5);
    expect(Array.from(image.data)).toEqual([
      ...greyRow([10, 20, 30, 40, 50]),
      ...greyRow([5, 8, 10, 11, 12]),
      ...greyRow([50, 50, 50, 50, 51]),
      ...greyRow([100, 200, 60, 30, 30]),
      ...greyRow([10, 130, 70, 35, 45]),
    ]);
  });

  it("offsets the Sub and Up predictors by the pixel width, not by one byte", () => {
    // Colour type 6: 4 bytes per pixel, so `a` is the byte four positions back.
    // Reading it one byte back would smear the channels into each other, which
    // is exactly the class of bug that would fabricate pixel differences.
    //   row 0  None: (10,20,30,255) (40,50,60,255)
    //   row 1  Sub:  first pixel a=0; second pixel a = first pixel's channels
    //   row 2  Up:   b = row 1
    const png = pngOf(2, 3, 6, [
      [0, 10, 20, 30, 255, 40, 50, 60, 255],
      [1, 1, 2, 3, 0, 5, 5, 5, 0],
      [2, 1, 1, 1, 1, 1, 1, 1, 1],
    ]);
    const image = decodePng(png);
    expect(Array.from(image.data)).toEqual([
      10, 20, 30, 255, 40, 50, 60, 255, 1, 2, 3, 0, 6, 7, 8, 0, 2, 3, 4, 1, 7,
      8, 9, 1,
    ]);
  });

  it("refuses a stream too short for the declared image, rather than decoding black", () => {
    // Past the end of the inflated IDAT the reconstruction reads `undefined`,
    // `undefined + a` is NaN, and `value & 0xff` writes 0 — so a short stream
    // used to decode to silent opaque black. The pixel tier relies on this
    // module throwing by name to tell a real change from a decode failure.
    const short = pngOf(4, 3, 0, [
      [0, 10, 20, 30, 40],
      [0, 10, 20, 30, 40],
    ]);
    expect(() => decodePng(short)).toThrow(/truncated/);
    expect(() => decodePng(short)).toThrow(/expected 15/);
  });

  it("accepts a stream of exactly the declared length", () => {
    const exact = pngOf(2, 2, 0, [
      [0, 1, 2],
      [0, 3, 4],
    ]);
    expect(decodePng(exact).height).toBe(2);
  });

  it("refuses an unknown filter type by name", () => {
    expect(() => decodePng(pngOf(2, 1, 0, [[9, 1, 2]]))).toThrow(
      /unknown filter type 9/,
    );
  });
});

describe("pixel comparison", () => {
  it("reports zero changes for identical images", () => {
    const a = solid(20, 20, [255, 255, 255, 255]);
    const diff = diffImages(a, a, 2);
    expect(diff.changedPixels).toBe(0);
    expect(diff.dimensionsEqual).toBe(true);
  });

  it("ignores a delta at or below the threshold and catches one above it", () => {
    const a = solid(4, 4, [100, 100, 100, 255]);
    const b = solid(4, 4, [102, 100, 100, 255]);
    expect(diffImages(a, b, 2).changedPixels).toBe(0);
    expect(diffImages(a, b, 1).changedPixels).toBe(16);
    expect(diffImages(a, b, 1).maxChannelDelta).toBe(2);
  });

  it("treats a size change as a reportable difference, not an error", () => {
    // A page that grew taller is a real finding; refusing to diff it would hide
    // everything else that changed on it.
    const diff = diffImages(
      solid(4, 4, [0, 0, 0, 255]),
      solid(4, 8, [0, 0, 0, 255]),
      2,
    );
    expect(diff.dimensionsEqual).toBe(false);
    expect(diff.changedRatio).toBeGreaterThan(0);
    expect(diff.image.height).toBe(8);
  });
});

describe("ink ratio", () => {
  it("is zero for a blank page and positive once anything is drawn", () => {
    const blank = solid(100, 100, [255, 255, 255, 255]);
    expect(inkRatio(blank)).toBe(0);
    const drawn = solid(100, 100, [255, 255, 255, 255]);
    for (let i = 0; i < 100 * 30; i += 1) drawn.data.set([0, 0, 0, 255], i * 4);
    // This is the metric that names an empty prerendered shell without anyone
    // opening the PNG.
    expect(inkRatio(drawn)).toBeGreaterThan(0.2);
  });
});
