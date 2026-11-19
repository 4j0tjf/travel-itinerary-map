import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Day, Place } from "../types";
import type { RoadPath } from "../services/road-routes";

const place = (id: string, lat: number | null, lng: number | null): Place => ({
  id, lat, lng, name: id, nameJa: "", time: "09:00", endTime: "10:00",
  category: "", address: "", memo: "", image: "", mode: "DRIVE",
});
const day: Day = {
  date: "2026-12-07", title: "", description: "",
  places: [place("a", 35, 138), place("b", 35.1, 138.1), place("c", 35.2, 138.2)],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("draws Google Maps order lines, toggles them, and retires old lines on day change and unmount", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const lines: { options: google.maps.PolylineOptions; setMap: ReturnType<typeof vi.fn> }[] = [];
  const fakeMap = { fitBounds: vi.fn(), setZoom: vi.fn(), setMapTypeId: vi.fn(), setOptions: vi.fn() };
  vi.stubGlobal("google", { maps: {
    Map: class { constructor() { return fakeMap; } },
    InfoWindow: class { close() {} },
    LatLngBounds: class { extend() {} isEmpty() { return false; } },
    Marker: class { addListener() {} setMap() {} },
    SymbolPath: { CIRCLE: 0 },
    Polyline: class {
      setMap = vi.fn();
      constructor(public options: google.maps.PolylineOptions) { lines.push(this); }
    },
  }});
  const { default: TravelMap } = await import("../components/TravelMap");
  const roadPaths: RoadPath[] = [{ key: "first", date: day.date, mode: "DRIVE", path: [{ lat: 35, lng: 138 }, { lat: 35.04, lng: 138.08 }, { lat: 35.1, lng: 138.1 }] }, { key: "second", date: day.date, mode: "WALK", path: [{ lat: 35.1, lng: 138.1 }, { lat: 35.2, lng: 138.2 }] }];
  const props = { roadPaths, day, region: "시즈오카", selectedId: "", focusVersion: 0, onSelect: vi.fn(), onSettings: vi.fn(), routeVisible: true };
  const view = render(<TravelMap {...props} />);
  await waitFor(() => expect(lines).toHaveLength(2));
  expect(lines[0].options.path).toEqual(roadPaths[0].path);
  expect(lines[0].options.map).toBe(fakeMap);
  expect(lines[0].options.strokeOpacity).toBeGreaterThan(0);
  view.rerender(<TravelMap {...props} routeVisible={false} />);
  expect(lines.every((line) => line.setMap.mock.calls.some(([map]) => map === null))).toBe(true);
  view.rerender(<TravelMap {...props} />);
  await waitFor(() => expect(lines).toHaveLength(4));
  const changed = { ...day, date: "2026-12-08", places: [day.places[2], day.places[0]] };
  view.rerender(<TravelMap {...props} day={changed} roadPaths={[{ ...roadPaths[0], date: changed.date, path: [{ lat: 35.2, lng: 138.2 }, { lat: 35, lng: 138 }] }]} />);
  await waitFor(() => expect(lines).toHaveLength(5));
  expect(lines[2].setMap).toHaveBeenCalledWith(null);
  expect(lines[3].setMap).toHaveBeenCalledWith(null);
  expect(lines[4].options.path).toEqual([{ lat: 35.2, lng: 138.2 }, { lat: 35, lng: 138 }]);
  view.unmount();
  expect(lines[4].setMap).toHaveBeenCalledWith(null);
});

function stubGoogleMaps() {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const created: HTMLElement[] = [];
  const markers: { setMap: ReturnType<typeof vi.fn> }[] = [];
  const fakeMap = { fitBounds: vi.fn(), setZoom: vi.fn(), setMapTypeId: vi.fn(), setOptions: vi.fn() };
  vi.stubGlobal("google", { maps: {
    Map: class { constructor(element: HTMLElement) { created.push(element); return fakeMap; } },
    InfoWindow: class { close() {} },
    LatLngBounds: class { extend() {} isEmpty() { return false; } },
    Marker: class { setMap = vi.fn(); addListener() {} constructor() { markers.push(this); } },
    SymbolPath: { CIRCLE: 0 },
    Polyline: class { setMap() {} },
  }});
  return { created, markers, fakeMap };
}

it("creates one Google map per page and moves it between screens without leftovers", async () => {
  const { created, markers, fakeMap } = stubGoogleMaps();
  const { default: TravelMap } = await import("../components/TravelMap");
  const props = { day, region: "시즈오카", selectedId: "", focusVersion: 0, onSelect: vi.fn(), onSettings: vi.fn(), routeVisible: false };
  const first = render(<TravelMap {...props} />);
  await waitFor(() => expect(markers).toHaveLength(3));
  const mapElement = created[0];
  expect(first.container.querySelector(".google-map")?.contains(mapElement)).toBe(true);
  first.unmount();
  expect(markers.every((marker) => marker.setMap.mock.calls.some(([map]) => map === null))).toBe(true);
  expect(fakeMap.setOptions).toHaveBeenCalledWith(expect.objectContaining({ zoom: 2, mapTypeId: "roadmap" }));
  expect(mapElement.isConnected).toBe(false);
  const nextDay = { ...day, date: "2026-12-08", places: day.places.slice(0, 2) };
  const second = render(<TravelMap {...props} day={nextDay} />);
  await waitFor(() => expect(markers).toHaveLength(5));
  expect(created).toHaveLength(1);
  expect(second.container.querySelector(".google-map")?.contains(mapElement)).toBe(true);
});

it("waits until the page is visible before creating the Google map", async () => {
  const { created } = stubGoogleMaps();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  try {
    const { default: TravelMap } = await import("../components/TravelMap");
    render(<TravelMap day={day} region="시즈오카" selectedId="" focusVersion={0} onSelect={vi.fn()} onSettings={vi.fn()} routeVisible={false} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(created).toHaveLength(0);
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(created).toHaveLength(1));
  } finally {
    visibility.mockRestore();
  }
});

it("merges overlapping preview pins, cycles through them, and draws pin numbers above labels", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const { default: TravelMap } = await import("../components/TravelMap");
  const named = (id: string, name: string, lat: number, lng: number) => ({ ...place(id, lat, lng), name });
  const preview: Day = {
    ...day,
    places: [
      named("p1", "구노잔 도쇼구 (久能山東照宮)", 34.96, 138.47),
      named("p2", "프레지오 호텔 (ホテルプレジオ)", 34.975, 138.385),
      named("p3", "슨푸성 공원", 34.98, 138.383),
      named("p4", "프레지오 호텔 (ホテルプレジオ)", 34.97505, 138.38505),
    ],
  };
  const onSelect = vi.fn();
  const props = { day: preview, region: "시즈오카", selectedId: "p1", focusVersion: 0, onSelect, onSettings: vi.fn(), routeVisible: true };
  const view = render(<TravelMap {...props} />);
  const hotel = "2·4. 프레지오 호텔 (ホテルプレジオ)";
  fireEvent.click(screen.getByRole("button", { name: hotel }));
  expect(onSelect).toHaveBeenLastCalledWith("p2");
  view.rerender(<TravelMap {...props} selectedId="p2" />);
  fireEvent.click(screen.getByRole("button", { name: hotel }));
  expect(onSelect).toHaveBeenLastCalledWith("p4");
  expect(screen.getByRole("button", { name: "3. 슨푸성 공원" })).toBeTruthy();
  expect(screen.getByText("구노잔 도쇼구")).toBeTruthy();
  expect(screen.getAllByText("프레지오 호텔")).toHaveLength(1);
  const labels = view.container.querySelector(".map-label-layer")!;
  const pins = view.container.querySelector(".map-pin-layer")!;
  expect(labels.compareDocumentPosition(pins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("loads Google Maps with the signed-in account's key and asks for a reload when the key changes", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const { default: TravelMap } = await import("../components/TravelMap");
  const { MapsKeyProvider, resolveMapsKey } = await import("../services/maps-key");
  const { KEY_CHANGED_MESSAGE } = await import("../services/google-maps");
  const keyState = (accountKey: string) => ({ ...resolveMapsKey(accountKey), accountKey, save: vi.fn(), remove: vi.fn() });
  const accountKey = "AIza" + "First".padEnd(35, "1");
  const props = { day, region: "시즈오카", selectedId: "", focusVersion: 0, onSelect: vi.fn(), onSettings: vi.fn(), routeVisible: false };
  const view = render(<MapsKeyProvider value={keyState(accountKey)}><TravelMap {...props} /></MapsKeyProvider>);
  const script = await waitFor(() => {
    const found = document.head.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
    expect(found).toBeTruthy();
    return found!;
  });
  expect(new URL(script.src).searchParams.get("key")).toBe(accountKey);

  // 같은 페이지에서 다른 계정 키로 바뀌면 지도 스크립트를 다시 불러올 수 없어 새로고침을 안내한다.
  view.rerender(<MapsKeyProvider value={keyState("AIza" + "Second".padEnd(35, "2"))}><TravelMap {...props} /></MapsKeyProvider>);
  await screen.findByText(KEY_CHANGED_MESSAGE);
  expect(screen.getByText("위치 미리보기")).toBeTruthy();
  script.remove();
});
