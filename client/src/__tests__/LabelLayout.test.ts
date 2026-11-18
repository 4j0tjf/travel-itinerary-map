import { expect, it } from "vitest";
import {
  boxHitsPin,
  boxesOverlap,
  clusterLabel,
  clusterPins,
  clusterText,
  fitLabel,
  mapLabel,
  placeLabels,
  type Box,
  type LabelPin,
} from "../services/label-layout";

const view: Box = { x: 0, y: 0, w: 960, h: 340 };
const pin = (key: string, x: number, y: number, labelWidth: number, priority = false): LabelPin => ({
  key, x, y, labelWidth, priority, radius: priority ? 20 : 17, halfWidth: priority ? 20 : 17,
});

it("drops a trailing original-language name from map labels", () => {
  expect(mapLabel("구노잔 도쇼구 (久能山東照宮)")).toBe("구노잔 도쇼구");
  expect(mapLabel("슨푸성 공원（駿府城公園）")).toBe("슨푸성 공원");
  expect(mapLabel("카페 (2층) 테라스")).toBe("카페 (2층) 테라스");
  expect(mapLabel("(仮)")).toBe("(仮)");
});

it("cuts long labels by width and sizes the box to the text", () => {
  const short = fitLabel("슨푸성 공원");
  const long = fitLabel("시즈테츠 호텔 프레지오 시즈오카역 북쪽 신관 별관 입구");
  expect(short.text).toBe("슨푸성 공원");
  expect(long.text.endsWith("…")).toBe(true);
  expect(long.width).toBeLessThanOrEqual(240);
  expect(short.width).toBeLessThan(long.width);
});

it("merges pins that overlap on screen and splits them once zoom spreads them apart", () => {
  const input = [
    { item: "kunozan", number: 1, x: 857, y: 264 },
    { item: "hotel-drop", number: 3, x: 161, y: 193 },
    { item: "hotel-check-in", number: 6, x: 161, y: 203 },
  ];
  const merged = clusterPins(input);
  expect(merged.map((c) => c.numbers)).toEqual([[1], [3, 6]]);
  expect(merged[1]).toMatchObject({ items: ["hotel-drop", "hotel-check-in"], x: 161, y: 198 });
  const zoomed = clusterPins(input.map((p) => ({ ...p, y: p.y * 5 })));
  expect(zoomed.map((c) => c.numbers)).toEqual([[1], [3], [6]]);
  expect(clusterText([3, 6])).toBe("3·6");
  expect(clusterText([2, 3, 4, 5])).toBe("2·3+2");
});

it("names a merged pin once, or by its first place when the places differ", () => {
  expect(clusterLabel(["프레지오 호텔 (ホテル)", "프레지오 호텔 (ホテル)"])).toBe("프레지오 호텔");
  expect(clusterLabel(["시즈오카역", "프레지오 호텔", "프레지오 호텔"])).toBe("시즈오카역 외 2곳");
});

it("moves labels off neighbouring pins without stacking them (screenshot layout)", () => {
  const pins = [
    pin("1", 857, 264, 199, true),
    pin("2", 839, 90, 244),
    pin("3", 161, 193, 244),
    pin("4", 95, 101, 202),
    pin("5", 417, 216, 244),
    pin("6", 161, 203, 244),
  ];
  const placed = placeLabels(pins, view);
  expect(placed.size).toBe(6);
  for (const [key, box] of placed) {
    expect(pins.some((p) => p.key !== key && boxHitsPin(box, p))).toBe(false);
    expect([...placed].some(([other, o]) => other !== key && boxesOverlap(box, o))).toBe(false);
  }
  // 선택한 1번은 지금처럼 왼쪽에 남고, 5번 핀을 덮던 3번 이름표는 핀 위로 비켜난다.
  const first = placed.get("1")!;
  expect(first.x + first.w).toBeLessThan(857);
  expect(placed.get("3")!.y + placed.get("3")!.h).toBeLessThan(193);
});

it("leaves a label out when no slot fits, and only places the wanted ones", () => {
  expect(placeLabels([pin("a", 60, 30, 200)], { x: 0, y: 0, w: 120, h: 60 }).size).toBe(0);
  const pins = [pin("a", 200, 150, 120, true), pin("b", 600, 150, 120)];
  expect([...placeLabels(pins, view, { wanted: (p) => p.priority }).keys()]).toEqual(["a"]);
});
