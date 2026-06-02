import { Hono } from "hono";

export const app = new Hono();

app.get("/healthz", (c) => c.json({ status: "ok" }));

// Route stubs filled by later plans:
// POST /jobs/ingest      (Plan 3)
// POST /jobs/sync        (Plan 4)
// POST /jobs/plan-push   (Plan 4)
// POST /drain            (Plans 3-4 safety-net sweeper)

// Only start a listener outside the test runtime.
if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
  const { serve } = await import("@hono/node-server");
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8080) });
}
