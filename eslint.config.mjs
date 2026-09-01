import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code's workspace state, which is gitignored and holds full
    // git-worktree copies of this repo under .claude/worktrees. Linting those
    // means linting a second, stale checkout: thousands of findings that
    // belong to another branch, drowning the real ones and failing
    // `npm run lint` no matter what the tracked source says.
    ".claude/**",
  ]),
]);

export default eslintConfig;
