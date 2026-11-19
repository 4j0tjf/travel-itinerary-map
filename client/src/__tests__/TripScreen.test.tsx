import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import TripPlanner from "../components/TripPlanner";
import type { Day, Itinerary, Place } from "../types";
import { directionsUrl, formatDistance, formatDuration, stopTiming } from "../services/trip-time";

const place = (id: string, name: string, time: string, endTime: string, mode: Place["mode"], offset: number): Place => ({
  id, name, time, endTime, mode, lat: 35.4 + offset, lng: 138.7 + offset, nameJa: "", category: "방문 장소",
  address: "Fujiyoshida", memo: `${name} 메모`, image: "",
});
const day = (date: string, prefix: string): Day => ({
  date, title: `${prefix} 여행`, description: "", places: [
    place(`${prefix}-1`, `${prefix} 아침`, "09:00", "10:00", "DRIVE", 0),
    place(`${prefix}-2`, `${prefix} 점심`, "12:00", "13:00", "TRANSIT", 0.02),
    place(`${prefix}-3`, `${prefix} 저녁`, "18:00", "", "WALK", 0.04),
  ],
});
const trip: Itinerary = {
  id: "trip-now", title: "후지산", subtitle: "", country: "", region: "야마나시",
  days: [day("2026-11-20", "d1"), day("2026-11-21", "d2")],
  warnings: [], sourceSheet: "", createdAt: "", updatedAt: "",
};
const handlers = { onRename: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() };

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("finds the current or next stop and formats times, distances and directions", () => {
  const d = day("2026-11-20", "x");
  expect(stopTiming(d, new Date("2026-11-20T08:30:00"))).toEqual({ state: "next", index: 0, minutesUntil: 30 });
  expect(stopTiming(d, new Date("2026-11-20T12:20:00"))).toEqual({ state: "current", index: 1, minutesLeft: 40 });
  expect(stopTiming(d, new Date("2026-11-20T14:00:00"))).toEqual({ state: "next", index: 2, minutesUntil: 240 });
  expect(stopTiming(d, new Date("2026-11-20T19:00:00"))).toEqual({ state: "current", index: 2, minutesLeft: null });
  expect(formatDuration(95)).toBe("1시간 35분");
  expect(formatDuration(0)).toBe("곧");
  expect(formatDistance(740)).toBe("740m");
  expect(formatDistance(2740)).toBe("2.7km");
  const url = new URL(directionsUrl(d.places[2], "TRANSIT"));
  expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
  expect(url.searchParams.get("destination")).toBe(`${d.places[2].lat},${d.places[2].lng}`);
  expect(url.searchParams.get("travelmode")).toBe("transit");
  expect(new URL(directionsUrl(d.places[0])).searchParams.has("travelmode")).toBe(false);
});

it("opens today's day at the stop happening now and offers directions and stepping", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T12:20:00"));
  render(<TripPlanner trip={trip} {...handlers} />);
  expect(screen.getByRole("tab", { name: /DAY 02/, selected: true })).toBeTruthy();
  const card = screen.getByRole("region", { name: "지금 보는 장소" });
  expect(within(card).getByText("지금 일정 · 13:00까지")).toBeTruthy();
  expect(within(card).getByText("d2 점심")).toBeTruthy();
  const directions = within(card).getByRole("link", { name: /길찾기/ });
  expect(directions.textContent).toContain("자동차"); // 1번 장소에서 자동차로 온다.
  expect(new URL(directions.getAttribute("href")!).searchParams.get("travelmode")).toBe("driving");

  fireEvent.click(within(card).getByRole("button", { name: "다음 장소" }));
  expect(within(card).getByText("5시간 40분 후 일정")).toBeTruthy();
  expect(within(card).getByRole("link", { name: /길찾기/ }).textContent).toContain("대중교통");
  expect(within(card).getByRole("button", { name: "다음 장소" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(within(card).getByRole("button", { name: "이전 장소" }));
  fireEvent.click(within(card).getByRole("button", { name: "이전 장소" }));
  expect(within(card).getByText("지난 일정")).toBeTruthy();

  fireEvent.click(screen.getByRole("tab", { name: /DAY 01/ }));
  fireEvent.click(within(screen.getByRole("region", { name: "지금 보는 장소" })).getByRole("button", { name: "지금 일정으로" }));
  expect(screen.getByRole("tab", { name: /DAY 02/, selected: true })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "지금 보는 장소" })).getByText("d2 점심")).toBeTruthy();
});

it("hides the now card outside the trip and keeps day one first", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00"));
  render(<TripPlanner trip={trip} {...handlers} />);
  expect(screen.getByRole("tab", { name: /DAY 01/, selected: true })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "지금 보는 장소" })).toBeNull();
});

it("moves the phone itinerary sheet by tapping the grip, dragging the card and pulling the list", async () => {
  const afterDrag = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
  const { container } = render(<TripPlanner trip={trip} {...handlers} />);
  const layout = container.querySelector(".planner-layout")!;
  const head = container.querySelector<HTMLElement>(".sheet-head")!;
  const list = container.querySelector<HTMLElement>(".panel-contents")!;
  const dragHead = (from: number, to: number, target: Element = head) => {
    fireEvent.pointerDown(target, { clientY: from, pointerId: 1, button: 0 });
    fireEvent.pointerMove(target, { clientY: (from + to) / 2, pointerId: 1 });
    fireEvent.pointerMove(target, { clientY: to, pointerId: 1 });
    fireEvent.pointerUp(target, { clientY: to, pointerId: 1 });
  };
  expect(layout.getAttribute("data-sheet")).toBe("peek");
  fireEvent.click(screen.getByRole("button", { name: "일정 목록 펼치기" }));
  expect(layout.getAttribute("data-sheet")).toBe("half");

  dragHead(400, 300); // 카드를 잡고 위로
  await afterDrag();
  expect(layout.getAttribute("data-sheet")).toBe("full");
  expect(layout.hasAttribute("data-dragging")).toBe(false);

  // 목록이 맨 위일 때 아래로 당기면 접힌다.
  fireEvent.touchStart(list, { touches: [{ clientY: 100 }] });
  fireEvent.touchMove(list, { touches: [{ clientY: 160 }] });
  fireEvent.touchMove(list, { touches: [{ clientY: 230 }] });
  fireEvent.touchEnd(list, { changedTouches: [{ clientY: 230 }] });
  expect(layout.getAttribute("data-sheet")).toBe("half");

  fireEvent.click(screen.getByRole("button", { name: "일정 목록 접기" }));
  expect(layout.getAttribute("data-sheet")).toBe("peek");

  // 카드를 아래로 내리면 한 줄만 남고, 누르면 다시 카드가 열린다.
  const next = screen.getByRole("button", { name: "다음 장소" });
  const before = within(head).getByRole("region").textContent;
  dragHead(300, 420, next);
  fireEvent.click(next); // 끈 뒤 손을 뗀 자리의 버튼은 눌리지 않는다.
  expect(within(head).getByRole("region").textContent).toBe(before);
  expect(layout.getAttribute("data-sheet")).toBe("mini");
  await afterDrag();
  fireEvent.click(head.querySelector(".next-stop")!);
  expect(layout.getAttribute("data-sheet")).toBe("peek");

  fireEvent.click(screen.getByRole("button", { name: "일정 자세히" }));
  expect(layout.getAttribute("data-sheet")).toBe("half");
  fireEvent.click(head.querySelector(".next-stop")!); // 펼친 상태의 한 줄 카드를 누르면 카드로 돌아간다.
  expect(layout.getAttribute("data-sheet")).toBe("peek");
});

it("shows my location on the preview map and turns it off from the same button", () => {
  const listeners: { success?: PositionCallback } = {};
  const clearWatch = vi.fn();
  vi.stubGlobal("navigator", {
    ...navigator,
    geolocation: {
      watchPosition: vi.fn((success: PositionCallback) => { listeners.success = success; return 7; }),
      clearWatch,
    },
  });
  const { container } = render(<TripPlanner trip={trip} {...handlers} />);
  fireEvent.click(screen.getByRole("button", { name: "내 위치 보기" }));
  expect(screen.getByRole("button", { name: "내 위치 찾는 중" })).toBeTruthy();
  act(() => listeners.success!({ coords: { latitude: 35.41, longitude: 138.71, accuracy: 20 } } as GeolocationPosition));
  expect(container.querySelector(".my-location")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "내 위치 끄기" }));
  expect(clearWatch).toHaveBeenCalledWith(7);
  expect(screen.getByRole("button", { name: "내 위치 보기" })).toBeTruthy();
});
