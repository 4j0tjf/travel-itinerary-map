import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import TripPlanner from "../components/TripPlanner";
import type { Day, Itinerary, Place } from "../types";

const place = (id: string, name: string, offset: number): Place => ({
  id, name, lat: 35 + offset, lng: 138 + offset, nameJa: "", time: "09:00", endTime: "10:00",
  category: "", address: "", memo: "", image: "", mode: "OTHER",
});
const dayOf = (date: string, prefix: string, idPrefix = prefix): Day => ({
  date, title: prefix, description: "",
  places: [1, 2, 3, 4].map((n) => place(`${idPrefix}-${n}`, `${prefix} 장소 ${n}`, n * 0.02)),
});
const makeTrip = (idPrefix = ""): Itinerary => ({
  id: "trip-1", title: "시즈오카", subtitle: "", country: "", region: "시즈오카",
  days: ["d1", "d2", "d3", "d4"].map((d, i) => dayOf(`2026-12-0${7 + i}`, d, idPrefix + d)),
  warnings: [], sourceSheet: "", createdAt: "", updatedAt: "",
});
const handlers = { onRename: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() };
const scrollIntoView = vi.fn();
const openDay = (n: number) => fireEvent.click(screen.getByRole("tab", { name: new RegExp(`DAY 0${n}`) }));
const current = () => document.querySelector(".schedule-item.selected .timeline-number")?.textContent;
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  Element.prototype.scrollIntoView = scrollIntoView;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("resumes each day at the place last viewed in this session", async () => {
  render(<TripPlanner trip={makeTrip()} {...handlers} />);
  openDay(2);
  expect(current()).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "3. d2 장소 3" }));
  expect(current()).toBe("3");
  openDay(3);
  expect(current()).toBe("1");
  openDay(2);
  expect(current()).toBe("3");
  await nextFrame();
  expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.querySelector(".schedule-item.selected"));
  openDay(4);
  expect(current()).toBe("1");
  openDay(3);
  expect(current()).toBe("1");
  openDay(2);
  expect(current()).toBe("3");
});

it("keeps the viewed place after the planner remounts, and falls back to the same number after a re-import", () => {
  const first = render(<TripPlanner trip={makeTrip()} {...handlers} />);
  openDay(2);
  fireEvent.click(screen.getByRole("button", { name: "3. d2 장소 3" }));
  first.unmount();

  const again = render(<TripPlanner trip={makeTrip()} {...handlers} />);
  expect(current()).toBe("1");
  openDay(2);
  expect(current()).toBe("3");
  again.unmount();

  // 시트를 다시 가져오면 장소 ID가 새로 만들어진다.
  render(<TripPlanner trip={makeTrip("reimported-")} {...handlers} />);
  openDay(2);
  expect(current()).toBe("3");
});
