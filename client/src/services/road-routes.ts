import { useEffect, useState } from "react";
import type { Itinerary } from "../types";
import { request } from "./api";
import { KEY_CHANGED_MESSAGE, loadMaps, mapsKeyNeedsReload } from "./google-maps";
import { useMapsKey } from "./maps-key";

export type RoadPoint = { lat: number; lng: number };
export type RouteMode = "DRIVE" | "WALK" | "TRANSIT";
export type RoadPath = { key: string; date: string; mode: RouteMode; path: RoadPoint[] };
// 지도 선 색과 안내 문구가 같은 값을 쓴다.
export const ROUTE_STYLES: Record<RouteMode, { color: string; label: string; colorName: string }> = {
  DRIVE: { color: "#2468c5", label: "자동차", colorName: "파랑" },
  WALK: { color: "#8b5c27", label: "도보", colorName: "갈색" },
  TRANSIT: { color: "#7b45b0", label: "대중교통", colorName: "보라" },
};
const TRAVEL_MODES: Record<RouteMode, string> = { DRIVE: "DRIVING", WALK: "WALKING", TRANSIT: "TRANSIT" };
export type RouteJob = Omit<RoadPath, "path"> & { stops: RoadPoint[] };
type Geometry = { path: RoadPoint[]; expiresAt: number };
type RouteResult = { paths: RoadPath[]; failed: number; warnings: string[]; saveFailed: boolean; quota?: boolean };
// Routes API는 사용량을 넘으면 RESOURCE_EXHAUSTED(429) 같은 오류를 돌려준다.
export const isQuotaError = (error: unknown) => {
  const detail = error && typeof error === "object" ? `${(error as { code?: unknown }).code ?? ""} ${(error as { message?: unknown }).message ?? ""}` : String(error);
  return /quota|RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|rate.?limit|\b429\b/i.test(detail);
};
type RouteLibrary = { Route: { computeRoutes(request: Record<string, unknown>): Promise<{ routes?: { path?: RoadPoint[]; warnings?: string[] }[] }> } };
const pending = new Map<string, Promise<RouteResult>>();

export function loadRoadRoutes(trip: Itinerary, apiKey: string): Promise<RouteResult> {
  const version = `${apiKey}:${trip.id}:${trip.source?.importedAt || trip.updatedAt}`;
  const existing = pending.get(version);
  if (existing) return existing;
  const operation = (async () => {
    const endpoint = `/trips/${encodeURIComponent(trip.id)}/routes`;
    const { jobs, cached } = await request<{ jobs: RouteJob[]; cached: Record<string, Geometry> }>(endpoint);
    const result: RouteResult = { paths: [], failed: 0, warnings: [], saveFailed: false };
    const unique = new Map<string, Promise<RoadPoint[]>>();
    let library: Promise<RouteLibrary> | undefined;
    const geometry = (job: RouteJob) => {
      if (cached[job.key]?.expiresAt > Date.now()) return Promise.resolve(cached[job.key].path);
      if (!unique.has(job.key)) unique.set(job.key, (async () => {
        library ??= loadMaps(apiKey).then(() => google.maps.importLibrary("routes") as unknown as Promise<RouteLibrary>);
        const { Route } = await library;
        const options = {
          origin: job.stops[0], destination: job.stops.at(-1),
          intermediates: job.stops.slice(1, -1).map(location => ({ location })),
          // 대중교통은 출발 시각을 주지 않으면 지금 시각 기준 노선으로 조회된다.
          travelMode: TRAVEL_MODES[job.mode],
          ...(job.mode === "DRIVE" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}),
          optimizeWaypointOrder: false, fields: ["path", "warnings"],
        };
        let timer: ReturnType<typeof setTimeout> | undefined;
        const response = await Promise.race([
          Route.computeRoutes(options),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("경로 조회 시간 초과")), 25000); }),
        ]).finally(() => clearTimeout(timer));
        const route = response.routes?.[0];
        if (!route?.path || route.path.length < 2) throw new Error("조회 가능한 경로가 없습니다.");
        const path = route.path.map(({ lat, lng }) => ({ lat, lng }));
        result.warnings.push(...(route.warnings || []));
        try { await request(endpoint, { method: "POST", body: JSON.stringify({ key: job.key, path }) }); }
        catch { result.saveFailed = true; }
        return path;
      })());
      return unique.get(job.key)!;
    };
    // Two workers limit browser requests while preparing every date once.
    let index = 0;
    await Promise.all([0, 1].map(async () => {
      while (index < jobs.length) {
        const job = jobs[index++];
        try { result.paths.push({ key: job.key, date: job.date, mode: job.mode, path: await geometry(job) }); }
        catch (error) {
          result.failed++;
          if (isQuotaError(error)) result.quota = true;
        }
      }
    }));
    return result;
  })();
  pending.set(version, operation);
  void operation.finally(() => pending.delete(version)).catch(() => {});
  return operation;
}

export function useRoadRoutes(trip: Itinerary) {
  const { key: apiKey, source } = useMapsKey();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<RouteResult & { loading: boolean; error: string }>({ paths: [], failed: 0, warnings: [], saveFailed: false, loading: Boolean(apiKey), error: "" });
  useEffect(() => {
    let active = true;
    if (apiKey && mapsKeyNeedsReload(apiKey)) {
      setState({ paths: [], failed: 0, warnings: [], saveFailed: false, loading: false, error: KEY_CHANGED_MESSAGE });
      return;
    }
    setState({ paths: [], failed: 0, warnings: [], saveFailed: false, loading: Boolean(apiKey), error: apiKey ? "" : "지도 키가 없어 경로를 조회할 수 없습니다." });
    if (apiKey) loadRoadRoutes(trip, apiKey).then(result => {
      const owner = source === "account" ? "내" : "공용";
      const error = !result.failed ? ""
        : result.quota
          ? `${owner} 지도 키의 길찾기 사용량을 모두 써서 경로 ${result.failed}건을 불러오지 못했습니다. ${source === "account" ? "사용량은 다음 날 다시 채워집니다." : "지도 설정에서 내 키를 등록하면 바로 불러올 수 있습니다."}`
          : `경로 ${result.failed}건을 조회하지 못했습니다. Routes API 권한·할당량 또는 해당 구간을 확인해 주세요.`;
      if (active) setState({ ...result, loading: false, error });
    }).catch(() => {
      if (active) setState({ paths: [], failed: 0, warnings: [], saveFailed: false, loading: false, error: "경로를 불러오지 못했습니다. 연결과 로그인 상태를 확인해 주세요." });
    });
    return () => { active = false; };
  }, [trip.id, trip.source?.importedAt, trip.updatedAt, retry, apiKey]);
  return { ...state, retry: () => setRetry(value => value + 1) };
}
