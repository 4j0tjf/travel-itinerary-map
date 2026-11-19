import { useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent } from "react";

// 휴대폰 일정 패널 높이: 한 줄(mini) → 지금 일정 카드(peek) → 절반(half) → 전체(full).
export type SheetState = "mini" | "peek" | "half" | "full";
const ORDER: SheetState[] = ["mini", "peek", "half", "full"];
const MIN_HEIGHT = 56;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type Drag = { startY: number; startHeight: number; lastY: number; lastTime: number; speed: number; moved: boolean };

// 손잡이·카드 어디를 끌어도 패널이 손가락을 따라 움직이고, 놓으면 끈 방향과 거리만큼 다음 높이로 맞춘다.
// 목록이 맨 위일 때 아래로 당기면 패널을 접는다. 끄는 동안에는 React를 다시 그리지 않고 높이만 바꾼다.
export function useSheetDrag(state: SheetState, onState: (state: SheetState) => void) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const current = useRef({ state, onState });
  current.current = { state, onState };

  const begin = (y: number) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const now = performance.now();
    drag.current = { startY: y, startHeight: sheet.getBoundingClientRect().height, lastY: y, lastTime: now, speed: 0, moved: false };
  };
  const move = (y: number) => {
    const d = drag.current;
    const sheet = sheetRef.current;
    if (!d || !sheet) return false;
    const dy = y - d.startY;
    if (!d.moved && Math.abs(dy) < 8) return false;
    if (!d.moved) {
      d.moved = true;
      sheet.parentElement?.setAttribute("data-dragging", "");
    }
    const now = performance.now();
    d.speed = (y - d.lastY) / Math.max(1, now - d.lastTime);
    d.lastY = y;
    d.lastTime = now;
    const layout = sheet.parentElement;
    const toolbar = layout?.querySelector<HTMLElement>(".planner-toolbar");
    const max = Math.max(MIN_HEIGHT, (layout?.clientHeight ?? 0) - (toolbar?.offsetHeight ?? 0));
    sheet.style.flex = `0 0 ${clamp(d.startHeight - dy, MIN_HEIGHT, max)}px`;
    return true;
  };
  const finish = (y: number | null, fromHead: boolean) => {
    const d = drag.current;
    drag.current = null;
    const sheet = sheetRef.current;
    if (!d?.moved || !sheet) return;
    sheet.style.flex = "";
    sheet.parentElement?.removeAttribute("data-dragging");
    // 카드를 끈 뒤 손을 뗀 자리의 버튼·링크가 눌리지 않게 한다.
    if (fromHead) {
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
    }
    if (y === null) return;
    const dy = y - d.startY;
    const distance = Math.abs(dy);
    const fast = Math.abs(d.speed) > 0.5;
    const steps = distance < 60 ? (fast ? 1 : 0) : distance < 260 ? 1 : distance < 480 ? 2 : 3;
    const { state: from, onState: set } = current.current;
    set(ORDER[clamp(ORDER.indexOf(from) + (dy < 0 ? steps : -steps), 0, ORDER.length - 1)]);
  };

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
      tracking = list.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0]?.clientY ?? startY;
      if (!drag.current) {
        if (y < startY) tracking = false; // 위로 미는 것은 목록 스크롤
        if (y - startY <= 8 || list.scrollTop > 0) return;
        begin(startY);
      }
      if (move(y) && e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      tracking = false;
      if (drag.current) finish(e.changedTouches[0]?.clientY ?? null, false);
    };
    list.addEventListener("touchstart", onStart, { passive: true });
    list.addEventListener("touchmove", onMove, { passive: false });
    list.addEventListener("touchend", onEnd);
    list.addEventListener("touchcancel", onEnd);
    return () => {
      list.removeEventListener("touchstart", onStart);
      list.removeEventListener("touchmove", onMove);
      list.removeEventListener("touchend", onEnd);
      list.removeEventListener("touchcancel", onEnd);
    };
    // listRef는 휴대폰 화면일 때만 붙는다.
  });

  const headHandlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      begin(e.clientY);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (move(e.clientY) && !e.currentTarget.hasPointerCapture?.(e.pointerId))
        e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => finish(e.clientY, true),
    onPointerCancel: () => finish(null, true),
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      e.preventDefault();
      e.stopPropagation();
    },
    // 한 줄로 줄어든 카드(최소·절반·전체)를 누르면 지금 일정 카드로 돌아간다.
    onClick: () => {
      if (current.current.state !== "peek") current.current.onState("peek");
    },
  };
  return { sheetRef, listRef, headHandlers };
}

const GRIP: Record<SheetState, { label: string; next: SheetState }> = {
  mini: { label: "지금 일정 카드 펼치기", next: "peek" },
  peek: { label: "일정 목록 펼치기", next: "half" },
  half: { label: "일정 목록 접기", next: "peek" },
  full: { label: "일정 목록 줄이기", next: "half" },
};

// 손잡이를 누르면(손가락·마우스·키보드 모두) 한 단계 펼치거나 접는다.
export function SheetGrip({ state, onState }: { state: SheetState; onState: (state: SheetState) => void }) {
  return (
    <button
      type="button"
      className="sheet-grip"
      aria-label={GRIP[state].label}
      aria-expanded={state === "half" || state === "full"}
      onClick={(e) => {
        e.stopPropagation();
        onState(GRIP[state].next);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
