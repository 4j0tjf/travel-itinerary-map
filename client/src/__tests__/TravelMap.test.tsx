import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Day, Place } from "../types";
import { routeSegments } from "../services/map-route";

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

it("preserves visit order and leaves gaps at missing coordinates", () => {
  expect(routeSegments(day.places).map(([a, b]) => [a.id, b.id])).toEqual([["a", "b"], ["b", "c"]]);
  expect(routeSegments([day.places[0], place("missing", null, null), day.places[2]])).toEqual([]);
  expect(routeSegments([place("partial", 35, null), day.places[0]])).toEqual([]);
  expect(routeSegments([day.places[0]])).toEqual([]);
});

it("draws Google Maps order lines, toggles them, and retires old lines on day change and unmount", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const lines: { options: google.maps.PolylineOptions; setMap: ReturnType<typeof vi.fn> }[] = [];
  const fakeMap = { fitBounds: vi.fn(), setZoom: vi.fn(), setMapTypeId: vi.fn() };
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
  const props = { day, region: "시즈오카", selectedId: "", focusVersion: 0, onSelect: vi.fn(), onSettings: vi.fn(), routeVisible: true };
  const view = render(<TravelMap {...props} />);
  await waitFor(() => expect(lines).toHaveLength(2));
  expect(lines[0].options.path).toEqual([{ lat: 35, lng: 138 }, { lat: 35.1, lng: 138.1 }]);
  expect(lines[0].options.map).toBe(fakeMap);
  expect(lines[0].options.icons?.[0].icon?.strokeOpacity).toBeGreaterThan(0);
  view.rerender(<TravelMap {...props} routeVisible={false} />);
  expect(lines.every((line) => line.setMap.mock.calls.some(([map]) => map === null))).toBe(true);
  view.rerender(<TravelMap {...props} />);
  await waitFor(() => expect(lines).toHaveLength(4));
  const changed = { ...day, date: "2026-12-08", places: [day.places[2], day.places[0]] };
  view.rerender(<TravelMap {...props} day={changed} />);
  await waitFor(() => expect(lines).toHaveLength(5));
  expect(lines[2].setMap).toHaveBeenCalledWith(null);
  expect(lines[3].setMap).toHaveBeenCalledWith(null);
  expect(lines[4].options.path).toEqual([{ lat: 35.2, lng: 138.2 }, { lat: 35, lng: 138 }]);
  view.unmount();
  expect(lines[4].setMap).toHaveBeenCalledWith(null);
});
