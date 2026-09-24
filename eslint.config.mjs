import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-console": "warn",
      // Relax for first-commit; fix incrementally
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/static-components": "warn",
      /**
       * Zod must be imported as a module namespace.
       *
       * `import { z } from "zod"` costs the client bundle roughly 200 KB that
       * `import * as z from "zod"` does not. Zod v4's root entry re-exports a
       * namespace BINDING (`node_modules/zod/index.js` is
       * `import * as z from "./v4/classic/external.js"; export { z, z as default }`),
       * and `external.js` itself carries `export * as locales from
       * "../locales/index.js"` alongside the JSON-Schema processors. Taking the
       * `z` binding therefore retains the whole `external.js` namespace OBJECT,
       * because a bundler cannot prove which members of a namespace VALUE are
       * read. Importing the module namespace directly restores per-member
       * reachability.
       *
       * ONE named import anywhere in the client graph pulls all of it back —
       * every zod consumer lands in the same shared chunk — which is why this
       * is a rule and not a comment. `error`, not `warn`: `bun run lint` passes
       * `--max-warnings 999`, so a warning would not gate.
       *
       * The two forms are interchangeable at the call site: `z.object`,
       * `z.string`, `z.infer<…>` and `z.ZodIssueCode` all resolve identically,
       * because `index.js` re-exports `external.js` with `export *`. What this
       * does NOT cover: a deep import such as `zod/v4/classic/external.js`,
       * `zod/mini`, or a re-export of `z` through another module.
       * `lib/zod-import-shape.test.ts` asserts the same property over the
       * source tree.
       */
      "no-restricted-syntax": [
        "error",
        {
          // `no-restricted-imports` cannot express this: given `importNames` it
          // rejects `import * as z` too, which is the form we want. A syntax
          // selector names the specifier kind, so the namespace import is
          // untouched.
          selector:
            "ImportDeclaration[source.value='zod'] > ImportSpecifier[imported.name='z']",
          message:
            'Use `import * as z from "zod"` instead of `import { z } from "zod"` — the named binding retains zod\'s full locale set and JSON-Schema surface in the client bundle. See the comment above this rule.',
        },
        {
          selector:
            "ImportDeclaration[source.value='zod'] > ImportDefaultSpecifier",
          message:
            'Use `import * as z from "zod"` instead of the default import — the default is the same namespace binding and keeps the same dead weight. See the comment above this rule.',
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
