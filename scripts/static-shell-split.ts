#!/usr/bin/env bun
/**
 * static-shell-split — what a page shows with JavaScript OFF.
 *
 * Under Cache Components React streams every Suspense boundary that is still
 * pending when the shell flushes — and, less obviously, every COMPLETED
 * boundary larger than `progressiveChunkSize` (12 800 bytes) — as an
 * out-of-order segment: a `<div hidden id="S:n">` after the shell plus an
 * inline `$RC` script that moves it into its `<template id="B:n">` slot. With
 * JavaScript off the move never runs, so everything after the first hidden
 * segment is invisible, even in a prerendered file where the data is fully
 * cached and present in the bytes. The first `<div hidden id="S:` is therefore
 * the line between what a JS-off shopper (or a non-rendering crawler) sees and
 * what they do not.
 *
 * Usage (from `apps/starter`, after `next build`):
 *
 *   bun run scripts/static-shell-split.ts .next/server/app/news/<slug>.html
 *   bun run scripts/static-shell-split.ts .next/server/app/shop/<cat>/<slug>.html
 *   bun run scripts/static-shell-split.ts https://<store>/<path>      # a live page
 *
 * Prints: bytes, where the split falls, visible-text characters on each side,
 * every boundary in the shell with the size of its fallback, and every hidden
 * segment with the start of its text. A route whose content is in the shell
 * shows most of its text BEFORE the split and only small islands after it.
 *
 * Reads a file path or an http(s) URL. Exit code is 0 either way — this is a
 * measurement, not a gate; the assertion lives in the route's own tests.
 */

/* eslint-disable no-console -- a CLI: its report IS the console output. */
import { readFile } from "node:fs/promises";

const HIDDEN_SEGMENT = '<div hidden id="S:';

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ShellSplit {
  bytes: number;
  /** Byte offset of the first hidden segment, or -1 when there is none. */
  splitAt: number;
  shellVisibleChars: number;
  tailVisibleChars: number;
  boundaries: Array<{ id: string; fallbackBytes: number; text: string }>;
  segments: Array<{ id: string; text: string }>;
}

export function splitStaticShell(html: string): ShellSplit {
  const splitAt = html.indexOf(HIDDEN_SEGMENT);
  const shell = splitAt >= 0 ? html.slice(0, splitAt) : html;
  const tail = splitAt >= 0 ? html.slice(splitAt) : "";

  const boundaries: ShellSplit["boundaries"] = [];
  for (const match of shell.matchAll(/<template id="(B:\d+)"><\/template>/g)) {
    const start = match.index ?? 0;
    const end = shell.indexOf("<!--/$-->", start);
    const fallback = shell.slice(start, end > 0 ? end : start + 1500);
    boundaries.push({
      id: match[1]!,
      fallbackBytes: fallback.length,
      text: visibleText(fallback).slice(0, 100),
    });
  }

  const segments: ShellSplit["segments"] = [];
  for (const match of tail.matchAll(/<div hidden id="(S:\d+)">/g)) {
    const start = (match.index ?? 0) + match[0].length;
    segments.push({
      id: match[1]!,
      text: visibleText(tail.slice(start, start + 4000)).slice(0, 140),
    });
  }

  return {
    bytes: html.length,
    splitAt,
    shellVisibleChars: visibleText(shell).length,
    tailVisibleChars: visibleText(tail).length,
    boundaries,
    segments,
  };
}

async function load(source: string): Promise<string> {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source, {
      headers: { "user-agent": "headkit-static-shell-split/1.0" },
    });
    const body = await res.text();
    const cache = res.headers.get("x-vercel-cache");
    const prerender = res.headers.get("x-nextjs-prerender");
    console.log(
      `HTTP ${res.status}` +
        (cache ? `  x-vercel-cache ${cache}` : "") +
        (prerender ? `  x-nextjs-prerender ${prerender}` : ""),
    );
    return body;
  }
  return readFile(source, "utf8");
}

async function main(): Promise<void> {
  const source = process.argv[2];
  if (!source) {
    console.error(
      "usage: bun run scripts/static-shell-split.ts <built .html | url>",
    );
    process.exit(64);
  }
  const html = await load(source);
  const split = splitStaticShell(html);

  console.log(`source: ${source}`);
  console.log(
    `bytes ${split.bytes}; first hidden segment at ${
      split.splitAt >= 0 ? `byte ${split.splitAt}` : "(none)"
    }`,
  );
  console.log(
    `visible text: shell ${split.shellVisibleChars} chars, tail ${split.tailVisibleChars} chars`,
  );
  console.log(`boundaries in shell: ${split.boundaries.length}`);
  for (const b of split.boundaries) {
    console.log(
      `  ${b.id}: fallback ${b.fallbackBytes} bytes${b.text ? `  ${JSON.stringify(b.text)}` : ""}`,
    );
  }
  console.log(`hidden segments after the split: ${split.segments.length}`);
  for (const s of split.segments) {
    console.log(`  ${s.id}: ${JSON.stringify(s.text)}`);
  }
}

if (import.meta.main) {
  await main();
}
