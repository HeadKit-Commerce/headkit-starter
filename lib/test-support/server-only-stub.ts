/**
 * No-op stand-in for the `server-only` package, aliased in `vitest.config.ts`.
 *
 * `server-only` is real at runtime only through Next's webpack config, which
 * aliases the bare `import "server-only"` to a throwing or no-op module
 * depending on bundling layer (see `webpack-config.js`, "Alias server-only and
 * client-only to proper exports based on bundling layers"). The npm package
 * itself is NOT installed as a dependency of `apps/starter` (only
 * `packages/sdk` declares it), and its real `index.js` throws unconditionally
 * when required directly — it relies entirely on bundler aliasing to become a
 * no-op in server contexts. Vitest has no such layer-aware aliasing, so any
 * module vitest loads directly (not mocked) that contains `import
 * "server-only"` needs this stub instead, matching Next's server-layer
 * behaviour (a no-op), not its client-layer behaviour (a throw).
 */
export {};
