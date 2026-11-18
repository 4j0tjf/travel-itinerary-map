// SVG 위치 미리보기에서 핀과 이름표가 서로 가리지 않도록 배치한다.
// 좌표는 모두 화면 픽셀 기준이다(핀·이름표는 확대해도 화면 크기가 같다).

export const LABEL_HEIGHT = 34;
export const MERGE_DISTANCE = 38; // 활성 핀 반지름 20 + 일반 핀 17 + 여유 1
const LABEL_PADDING = 10;
const MAX_TEXT_WIDTH = 220;
const VIEW_EDGE = 6;
export const LABEL_FONT = '"DM Sans", "Noto Sans KR", sans-serif';
export const MOBILE_LABEL_FONT = '"Noto Sans KR", sans-serif';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------- 이름표 글자 ---------- */

// "구노잔 도쇼구 (久能山東照宮)" → "구노잔 도쇼구". 괄호만 있는 이름은 그대로 둔다.
export function mapLabel(name: string) {
  const short = name.replace(/\s*[(（][^()（）]*[)）]\s*$/, "").trim();
  return short || name.trim();
}

let context: CanvasRenderingContext2D | null | undefined;
function canvasContext() {
  if (context === undefined) {
    try {
      context = document.createElement("canvas").getContext("2d");
    } catch {
      context = null;
    }
  }
  return context;
}

const WIDE_CHAR = /[ᄀ-ᇿ⺀-鿿가-힣豈-﫿＀-｠￠-￦]/u;
function estimateWidth(text: string, weight: number) {
  let width = 0;
  for (const char of text) width += WIDE_CHAR.test(char) ? 14 : char === " " ? 3.8 : 7.6;
  return weight >= 600 ? width * 1.06 : width;
}

// 14px 글자의 실제 렌더링 폭. canvas를 못 쓰는 환경에서는 글자 종류별 어림값을 쓴다.
export function textWidth(text: string, weight = 400, font = LABEL_FONT) {
  const ctx = canvasContext();
  if (!ctx) return estimateWidth(text, weight);
  ctx.font = `${weight} 14px ${font}`;
  return ctx.measureText(text).width;
}

// 글자 수 대신 픽셀 폭으로 자르고, 이름표 폭도 실제 글자 폭에 맞춘다.
export function fitLabel(text: string, font = LABEL_FONT, maxWidth = MAX_TEXT_WIDTH) {
  let fitted = text;
  if (textWidth(fitted, 400, font) > maxWidth) {
    const chars = Array.from(text);
    while (chars.length > 1 && textWidth(chars.join("").trimEnd() + "…", 400, font) > maxWidth) chars.pop();
    fitted = chars.join("").trimEnd() + "…";
  }
  return { text: fitted, width: Math.ceil(textWidth(fitted, 400, font)) + LABEL_PADDING * 2 };
}

/* ---------- 겹치는 핀 합치기 ---------- */

export interface PinInput<T> {
  item: T;
  number: number;
  x: number;
  y: number;
}
export interface PinCluster<T> {
  items: T[];
  numbers: number[];
  x: number;
  y: number;
}

// 화면에서 서로 겹칠 만큼 가까운 핀을 하나로 묶는다. 확대해서 멀어지면 다시 나뉜다.
export function clusterPins<T>(pins: PinInput<T>[], distance = MERGE_DISTANCE): PinCluster<T>[] {
  const clusters: { anchor: PinInput<T>; members: PinInput<T>[] }[] = [];
  for (const pin of pins) {
    const near = clusters.find((c) => Math.hypot(c.anchor.x - pin.x, c.anchor.y - pin.y) < distance);
    if (near) near.members.push(pin);
    else clusters.push({ anchor: pin, members: [pin] });
  }
  return clusters.map(({ members }) => ({
    items: members.map((m) => m.item),
    numbers: members.map((m) => m.number),
    x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
    y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
  }));
}

export function clusterText(numbers: number[]) {
  return numbers.length <= 3
    ? numbers.join("·")
    : `${numbers.slice(0, 2).join("·")}+${numbers.length - 2}`;
}

export function clusterLabel(names: string[]) {
  const labels = [...new Set(names.map(mapLabel))];
  return labels.length === 1 ? labels[0] : `${labels[0]} 외 ${names.length - 1}곳`;
}

/* ---------- 이름표 자리 고르기 ---------- */

export type Slot =
  | "right"
  | "left"
  | "top"
  | "bottom"
  | "top-right"
  | "bottom-right"
  | "top-left"
  | "bottom-left";

export interface LabelPin {
  key: string;
  x: number;
  y: number;
  radius: number;
  halfWidth: number; // 원형 핀은 radius와 같고, 묶음 핀은 더 넓다
  labelWidth: number;
  priority: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// 지금까지 쓰던 방향(화면 가로 58% 기준 오른쪽/왼쪽)을 1순위로 두고 나머지를 차례로 시험한다.
export function slotOrder(pin: LabelPin, view: Box, preferAbove = false): Slot[] {
  const side = pin.x - view.x > view.w * 0.58 ? "left" : "right";
  const base: Slot[] = [
    side,
    side === "left" ? "right" : "left",
    "top",
    "bottom",
    "top-right",
    "bottom-right",
    "top-left",
    "bottom-left",
  ];
  if (!preferAbove) return base;
  const above: Slot = side === "left" ? "top-left" : "top-right";
  return [above, ...base.filter((slot) => slot !== above)];
}

export function labelBox(pin: LabelPin, slot: Slot, view: Box): Box {
  const w = pin.labelWidth;
  const h = LABEL_HEIGHT;
  const side = pin.halfWidth + 9;
  const diagonal = Math.round(pin.radius * 0.75) + 3;
  const wide = Math.max(0, pin.halfWidth - pin.radius);
  const centered = (x: number) => clamp(x, view.x + VIEW_EDGE, view.x + view.w - VIEW_EDGE - w);
  switch (slot) {
    case "right":
      return { x: pin.x + side, y: pin.y - h / 2, w, h };
    case "left":
      return { x: pin.x - side - w, y: pin.y - h / 2, w, h };
    case "top":
      return { x: centered(pin.x - w / 2), y: pin.y - pin.radius - 8 - h, w, h };
    case "bottom":
      return { x: centered(pin.x - w / 2), y: pin.y + pin.radius + 8, w, h };
    case "top-right":
      return { x: pin.x + wide + diagonal, y: pin.y - diagonal - h, w, h };
    case "top-left":
      return { x: pin.x - wide - diagonal - w, y: pin.y - diagonal - h, w, h };
    case "bottom-right":
      return { x: pin.x + wide + diagonal, y: pin.y + diagonal, w, h };
    case "bottom-left":
      return { x: pin.x - wide - diagonal - w, y: pin.y + diagonal, w, h };
  }
}

export const boxesOverlap = (a: Box, b: Box, gap = 4) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function boxHitsPin(box: Box, pin: LabelPin, gap = 3) {
  if (pin.halfWidth > pin.radius) {
    const body = { x: pin.x - pin.halfWidth, y: pin.y - pin.radius, w: pin.halfWidth * 2, h: pin.radius * 2 };
    return boxesOverlap(box, body, gap);
  }
  const nearestX = clamp(pin.x, box.x, box.x + box.w);
  const nearestY = clamp(pin.y, box.y, box.y + box.h);
  return Math.hypot(nearestX - pin.x, nearestY - pin.y) < pin.radius + gap;
}

const insideView = (box: Box, view: Box) =>
  box.x >= view.x + VIEW_EDGE &&
  box.y >= view.y + VIEW_EDGE &&
  box.x + box.w <= view.x + view.w - VIEW_EDGE &&
  box.y + box.h <= view.y + view.h - VIEW_EDGE;

// 우선 핀(선택한 장소)부터, 나머지는 받은 순서대로 다른 핀·이름표와 겹치지 않는 첫 자리를 차지한다.
// 자리를 못 받은 핀은 결과에 없다(이름표를 숨기고 호버·포커스 때만 띄운다).
export function placeLabels<T extends LabelPin>(
  pins: T[],
  view: Box,
  options: { wanted?: (pin: T) => boolean; preferAbove?: boolean } = {},
) {
  const placed = new Map<string, Box>();
  const taken: Box[] = [];
  const queue = pins
    .filter((pin) => options.wanted?.(pin) ?? true)
    .sort((a, b) => Number(b.priority) - Number(a.priority));
  for (const pin of queue) {
    const box = slotOrder(pin, view, options.preferAbove)
      .map((slot) => labelBox(pin, slot, view))
      .find(
        (candidate) =>
          insideView(candidate, view) &&
          !pins.some((other) => other !== pin && boxHitsPin(candidate, other)) &&
          !taken.some((other) => boxesOverlap(candidate, other)),
      );
    if (box) {
      taken.push(box);
      placed.set(pin.key, box);
    }
  }
  return placed;
}
