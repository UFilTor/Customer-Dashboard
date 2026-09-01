import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    pool: "vmForks",
    setupFiles: [],
    globals: true,
    passWithNoTests: true,
    // Same reason as the .claude/** entry in eslint.config.mjs: Claude Code
    // keeps git-worktree copies of this repo under .claude/worktrees, and
    // their test files would otherwise run as part of this project's suite.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
