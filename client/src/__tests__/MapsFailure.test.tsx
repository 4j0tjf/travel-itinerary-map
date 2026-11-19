import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Day, Place } from "../types";

const place = (id: string, lat: number, lng: number): Place => ({
  id, lat, lng, name: id, nameJa: "", time: "09:00", endTime: "10:00",
  category: "", address: "", memo: "", image: "", mode: "DRIVE",
});
const day: Day = { date: "2026-12-07", title: "", description: "", places: [place("a", 35, 138), place("b", 35.1, 138.1)] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  document.head.querySelectorAll('script[src*="maps.googleapis.com"]').forEach((script) => script.remove());
});

it("tells quota errors from other Maps key errors in console messages", async () => {
  const { mapsErrorKind } = await import("../services/google-maps");
  expect(mapsErrorKind("Google Maps JavaScript API error: OverQuotaMapError")).toBe("quota");
  expect(mapsErrorKind("Google Maps JavaScript API error: InvalidKeyMapError")).toBe("unavailable");
  expect(mapsErrorKind("Something else went wrong")).toBeUndefined();
});

it("notices an exhausted quota from the console and Google's error overlay, and keeps the quota reason", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { loadMaps, onMapsFailure, watchMapErrors } = await import("../services/google-maps");
  const seen: string[] = [];
  onMapsFailure((kind) => seen.push(kind));
  void loadMaps("AIza" + "x".repeat(35)).catch(() => {});
  console.error("Google Maps JavaScript API error: OverQuotaMapError");
  expect(seen).toEqual(["quota"]);

  const element = document.createElement("div");
  const stop = watchMapErrors(element);
  element.innerHTML = '<div class="gm-err-container"></div>';
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop();
  expect(seen).toEqual(["quota"]); // 오류 화면이 떠도 더 구체적인 '사용량 초과'를 유지한다.
});

it("reports Google's error overlay as an unavailable key", async () => {
  const { onMapsFailure, watchMapErrors } = await import("../services/google-maps");
  const seen: string[] = [];
  onMapsFailure((kind) => seen.push(kind));
  const element = document.createElement("div");
  const stop = watchMapErrors(element);
  element.innerHTML = '<div class="gm-err-container"><div class="gm-err-message">x</div></div>';
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop();
  expect(seen).toEqual(["unavailable"]);
});

it("switches to the preview and asks to register an own key when the shared key runs out", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "shared-key");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const fakeMap = { fitBounds: vi.fn(), setZoom: vi.fn(), setMapTypeId: vi.fn(), setOptions: vi.fn() };
  vi.stubGlobal("google", { maps: {
    Map: class { constructor() { return fakeMap; } },
    InfoWindow: class { close() {} },
    LatLngBounds: class { extend() {} isEmpty() { return false; } },
    Marker: class { setMap() {} addListener() {} },
    SymbolPath: { CIRCLE: 0 },
    Polyline: class { setMap() {} },
  }});
  const { default: TravelMap } = await import("../components/TravelMap");
  const { reportMapsFailure } = await import("../services/google-maps");
  const onSettings = vi.fn();
  render(<TravelMap day={day} region="시즈오카" selectedId="" focusVersion={0} onSelect={vi.fn()} onSettings={onSettings} routeVisible={false} />);
  expect(screen.queryByRole("alert")).toBeNull();

  act(() => reportMapsFailure("quota"));
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain("공용 지도 키의 오늘 사용량을 모두 썼어요");
  expect(screen.getByRole("img", { name: /상대 위치 미리보기/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "내 키 등록하기" }));
  expect(onSettings).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "키 만드는 방법" }).getAttribute("href")).toBe("#guide-maps-key");
  fireEvent.click(screen.getByRole("button", { name: "키 안내 닫기" }));
  expect(screen.queryByRole("alert")).toBeNull();
});
