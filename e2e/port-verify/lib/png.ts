/**
 * A dependency-free PNG reader, writer and pixel comparator.
 *
 * WHY NOT A LIBRARY. This harness is meant to be installed into two customer
 * storefront repos that already carry an inherited copy of the starter's e2e
 * suite. Every dependency it adds is a dependency each of those repos has to
 * take, keep on a lockfile and update. Playwright's screenshots are 8-bit
 * non-interlaced PNGs and `node:zlib` already does the only hard part, so the
 * codec is ~150 lines of well-understood format handling and the harness ships
 * with nothing new in anyone's `package.json`.
 *
 * Supports bit depth 8, non-interlaced, colour types 0/2/4/6 — everything a
 * browser screenshot produces. Anything else throws by name rather than
 * decoding to plausible garbage.
 */

import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A decoded image: straight RGBA, 4 bytes per pixel, top-left origin. */
export interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG buffer to RGBA. Throws with a named reason on anything else. */
export function decodePng(buf: Buffer): Rgba {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("port-verify/png: not a PNG (bad signature)");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("latin1", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(
      `port-verify/png: unsupported bit depth ${bitDepth} (expected 8)`,
    );
  }
  if (interlace !== 0) {
    throw new Error("port-verify/png: interlaced PNGs are not supported");
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType as 0 | 2 | 4 | 6];
  if (channels === undefined) {
    throw new Error(`port-verify/png: unsupported colour type ${colorType}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  // Every scanline is one filter byte plus `stride` data bytes. Checked rather
  // than trusted: past the end of `raw` the non-null assertions below yield
  // `undefined`, `undefined + a` is NaN, and `value & 0xff` writes 0 — so a
  // short stream would decode to silent opaque black instead of failing. The
  // pixel tier relies on this module's promise to throw by name rather than
  // produce plausible garbage, because that promise is what separates a real
  // change from a decode failure. Extra trailing bytes are left alone; only a
  // stream too short to describe the image IHDR declares is a lie.
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error(
      `port-verify/png: IDAT inflated to ${raw.length} bytes, expected ${expected} ` +
        `for ${width}x${height} at ${channels} channel(s) — the image is truncated`,
    );
  }
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const base = y * (stride + 1);
    const filter = raw[base]!;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[base + 1 + x]!;
      const a = x >= channels ? line[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + ((a + b) >> 1);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`port-verify/png: unknown filter type ${filter}`);
      }
      line[x] = value & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      if (channels === 1) {
        const g = line[src]!;
        out[dst] = g;
        out[dst + 1] = g;
        out[dst + 2] = g;
        out[dst + 3] = 255;
      } else if (channels === 2) {
        const g = line[src]!;
        out[dst] = g;
        out[dst + 1] = g;
        out[dst + 2] = g;
        out[dst + 3] = line[src + 1]!;
      } else if (channels === 3) {
        out[dst] = line[src]!;
        out[dst + 1] = line[src + 1]!;
        out[dst + 2] = line[src + 2]!;
        out[dst + 3] = 255;
      } else {
        out[dst] = line[src]!;
        out[dst + 1] = line[src + 1]!;
        out[dst + 2] = line[src + 2]!;
        out[dst + 3] = line[src + 3]!;
      }
    }
    prev.set(line);
  }
  return { width, height, data: out };
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head.subarray(0, 4), body, tail]);
}

/** Encode RGBA as a PNG (colour type 6, filter 0 on every scanline). */
export function encodePng(image: Rgba): Buffer {
  const { width, height, data } = image;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** Result of comparing two screenshots. */
export interface PixelDiff {
  readonly dimensionsEqual: boolean;
  readonly beforeWidth: number;
  readonly beforeHeight: number;
  readonly afterWidth: number;
  readonly afterHeight: number;
  /** Pixels whose max channel delta exceeded the threshold, over the overlap. */
  readonly changedPixels: number;
  /** Pixels compared — the overlapping region only. */
  readonly comparedPixels: number;
  /** `changedPixels / comparedPixels`, plus every pixel outside the overlap. */
  readonly changedRatio: number;
  readonly maxChannelDelta: number;
  /** A visual diff: the before image dimmed, changed pixels painted magenta. */
  readonly image: Rgba;
}

/**
 * Compare two images over their overlapping region.
 *
 * Differing dimensions are a first-class result rather than an error: a page
 * that grew taller is a real, reportable difference, and refusing to diff it
 * would hide everything else that changed on it.
 */
export function diffImages(
  before: Rgba,
  after: Rgba,
  threshold: number,
): PixelDiff {
  const w = Math.max(before.width, after.width);
  const h = Math.max(before.height, after.height);
  const ow = Math.min(before.width, after.width);
  const oh = Math.min(before.height, after.height);
  const out = new Uint8Array(w * h * 4);
  let changed = 0;
  let maxDelta = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dst = (y * w + x) * 4;
      const inOverlap = x < ow && y < oh;
      if (!inOverlap) {
        // Outside the shared region: paint amber so a size change reads as one.
        out[dst] = 255;
        out[dst + 1] = 176;
        out[dst + 2] = 0;
        out[dst + 3] = 255;
        continue;
      }
      const bi = (y * before.width + x) * 4;
      const ai = (y * after.width + x) * 4;
      let delta = 0;
      for (let c = 0; c < 4; c += 1) {
        delta = Math.max(
          delta,
          Math.abs(before.data[bi + c]! - after.data[ai + c]!),
        );
      }
      maxDelta = Math.max(maxDelta, delta);
      if (delta > threshold) {
        changed += 1;
        out[dst] = 255;
        out[dst + 1] = 0;
        out[dst + 2] = 128;
        out[dst + 3] = 255;
      } else {
        const grey = Math.round(
          (before.data[bi]! * 0.299 +
            before.data[bi + 1]! * 0.587 +
            before.data[bi + 2]! * 0.114) *
            0.25 +
            191,
        );
        out[dst] = grey;
        out[dst + 1] = grey;
        out[dst + 2] = grey;
        out[dst + 3] = 255;
      }
    }
  }

  const overlap = ow * oh;
  const outside = w * h - overlap;
  return {
    dimensionsEqual:
      before.width === after.width && before.height === after.height,
    beforeWidth: before.width,
    beforeHeight: before.height,
    afterWidth: after.width,
    afterHeight: after.height,
    changedPixels: changed,
    comparedPixels: overlap,
    changedRatio: w * h === 0 ? 0 : (changed + outside) / (w * h),
    maxChannelDelta: maxDelta,
    image: { width: w, height: h, data: out },
  };
}

/**
 * Fraction of pixels that differ from the image's dominant colour.
 *
 * This is the metric that makes an empty prerendered shell legible without
 * anyone opening the PNG: a page rendered with JavaScript disabled that ends up
 * blank has an ink ratio near zero, while the same page with JavaScript on does
 * not. The comparison names the two numbers side by side.
 */
export function inkRatio(image: Rgba): number {
  const { width, height, data } = image;
  const total = width * height;
  if (total === 0) return 0;
  const counts = new Map<number, number>();
  // Sample on a fixed lattice: exhaustive counting of a full-page screenshot is
  // pointless work, and a fixed stride keeps the number reproducible.
  const stride = Math.max(1, Math.floor(Math.sqrt(total / 200000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let bg = 0;
  let bgCount = -1;
  for (const [key, count] of counts) {
    if (count > bgCount) {
      bgCount = count;
      bg = key;
    }
  }
  const br = (bg >> 16) & 0xff;
  const bgc = (bg >> 8) & 0xff;
  const bb = bg & 0xff;
  let ink = 0;
  let sampled = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4;
      sampled += 1;
      const d = Math.max(
        Math.abs(data[i]! - br),
        Math.abs(data[i + 1]! - bgc),
        Math.abs(data[i + 2]! - bb),
      );
      if (d > 12) ink += 1;
    }
  }
  return sampled === 0 ? 0 : Number((ink / sampled).toFixed(4));
}
