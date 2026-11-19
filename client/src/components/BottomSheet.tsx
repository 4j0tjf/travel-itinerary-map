import { useRef, useState } from "react";
import type { PointerEvent } from "react";

export type SheetState = "peek" | "half" | "full";
const ORDER: SheetState[] = ["peek", "half", "full"];
const LABEL: Record<SheetState, string> = { peek: "일정 목록 펼치기", half: "일정 목록 크게 보기", full: "지도 크게 보기" };

// 휴대폰에서 지도 아래 일정 패널의 손잡이. 위로 밀면 펼치고 아래로 밀면 접는다. 누르면 접기·펼치기.
// 끄는 동안에는 살짝만 따라 움직이고, 놓으면 다음 높이로 맞춘다(지도 크기를 매 프레임 바꾸지 않는다).
export function SheetGrip({ state, onState }: { state: SheetState; onState: (state: SheetState) => void }) {
  const start = useRef<{ y: number; time: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const finish = (e: PointerEvent<HTMLButtonElement>) => {
    const begin = start.current;
    start.current = null;
    setOffset(0);
    if (!begin) return;
    const dy = e.clientY - begin.y;
    const speed = dy / Math.max(1, performance.now() - begin.time);
    const index = ORDER.indexOf(state);
    if (Math.abs(dy) < 8) {
      onState(state === "peek" ? "half" : "peek");
      return;
    }
    const direction = dy < -36 || speed < -0.45 ? 1 : dy > 36 || speed > 0.45 ? -1 : 0;
    const steps = Math.abs(dy) > 240 ? direction * 2 : direction;
    onState(ORDER[Math.min(ORDER.length - 1, Math.max(0, index + steps))]);
  };
  return (
    <button
      type="button"
      className="sheet-grip"
      aria-label={LABEL[state]}
      aria-expanded={state !== "peek"}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      onPointerDown={(e) => {
        start.current = { y: e.clientY, time: performance.now() };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current) setOffset(Math.max(-28, Math.min(28, (e.clientY - start.current.y) * 0.3)));
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        start.current = null;
        setOffset(0);
      }}
      onClick={(e) => {
        // 키보드(Enter·Space)로 누른 경우. 포인터로 누른 경우는 pointerup에서 처리했다.
        if (e.detail === 0) onState(state === "peek" ? "half" : "peek");
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}
