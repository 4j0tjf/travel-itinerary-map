import { afterEach, expect, it, vi } from "vitest";
import type { Itinerary } from "../types";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
const trip = { id: "trip", updatedAt: "2026-11-18" } as Itinerary;
const path = [{ lat: 35, lng: 138 }, { lat: 35.01, lng: 138.04 }, { lat: 35.1, lng: 138.1 }];
const job = (key: string, mode = "DRIVE") => ({ key, mode, date: "2026-12-01", stops: [path[0], path[1], path[2]] });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

it("reuses server geometry and deduplicates simultaneous and repeated route jobs", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  const computeRoutes = vi.fn().mockResolvedValue({ routes: [{ path, warnings: [] }] });
  vi.stubGlobal("google", { maps: { importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }) } });
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST" ? json({ entry: {} }) : json({
    jobs: [job("cached"), job("new"), { ...job("new"), date: "2026-12-02" }],
    cached: { cached: { path, expiresAt: Date.now() + 60000 } },
  }));
  vi.stubGlobal("fetch", fetcher);
  const { loadRoadRoutes } = await import("../services/road-routes");
  const [first, second] = await Promise.all([loadRoadRoutes(trip, "test-key"), loadRoadRoutes(trip, "test-key")]);
  expect(first).toBe(second);
  expect(first.paths).toHaveLength(3);
  expect(computeRoutes).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(computeRoutes.mock.calls[0][0]).toMatchObject({ intermediates: [{ location: path[1] }], optimizeWaypointOrder: false, travelMode: "DRIVING", routingPreference: "TRAFFIC_UNAWARE", fields: ["path", "warnings"] });
});

it("keeps successful paths when another mode fails and reports failed cache writes", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  const computeRoutes = vi.fn(async (options: { travelMode: string }) => {
    if (options.travelMode === "WALKING") throw new Error("No route");
    return { routes: [{ path, warnings: ["Test warning"] }] };
  });
  vi.stubGlobal("google", { maps: { importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }) } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") throw new Error("Offline");
    return json({ jobs: [job("drive"), job("walk", "WALK")], cached: {} });
  }));
  const { loadRoadRoutes } = await import("../services/road-routes");
  const result = await loadRoadRoutes(trip, "test-key");
  expect(result.paths).toHaveLength(1);
  expect(result.failed).toBe(1);
  expect(result.saveFailed).toBe(true);
  expect(result.warnings).toEqual(["Test warning"]);
  expect(computeRoutes.mock.calls.find(([options]) => options.travelMode === "WALKING")?.[0]).not.toHaveProperty("routingPreference");
});

it("flags route failures caused by an exhausted quota", async () => {
  const computeRoutes = vi.fn().mockRejectedValue(Object.assign(new Error("Quota exceeded for quota metric"), { code: "RESOURCE_EXHAUSTED" }));
  vi.stubGlobal("google", { maps: { importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }) } });
  vi.stubGlobal("fetch", vi.fn(async () => json({ jobs: [job("drive")], cached: {} })));
  const { isQuotaError, loadRoadRoutes } = await import("../services/road-routes");
  const result = await loadRoadRoutes(trip, "test-key");
  expect(result.failed).toBe(1);
  expect(result.quota).toBe(true);
  expect(isQuotaError(new Error("No route"))).toBe(false);
  expect(isQuotaError({ code: 429 })).toBe(true);
});

it("looks up public transit legs without intermediates or a routing preference", async () => {
  const computeRoutes = vi.fn().mockResolvedValue({ routes: [{ path, warnings: [] }] });
  vi.stubGlobal("google", { maps: { importLibrary: vi.fn().mockResolvedValue({ Route: { computeRoutes } }) } });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => options?.method === "POST" ? json({ entry: {} }) : json({
    jobs: [{ key: "transit", mode: "TRANSIT", date: "2026-12-01", stops: [path[0], path[2]] }], cached: {},
  })));
  const { loadRoadRoutes } = await import("../services/road-routes");
  const result = await loadRoadRoutes(trip, "test-key");
  expect(result.paths.map((p) => p.mode)).toEqual(["TRANSIT"]);
  const options = computeRoutes.mock.calls[0][0];
  expect(options).toMatchObject({ travelMode: "TRANSIT", intermediates: [] });
  expect(options).not.toHaveProperty("routingPreference");
});
