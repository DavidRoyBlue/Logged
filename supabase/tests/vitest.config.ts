import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["**/*.test.ts"], hookTimeout: 30000, testTimeout: 30000, pool: "forks", poolOptions: { forks: { singleFork: true } } } });
