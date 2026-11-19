import { useEffect, useRef, useState } from "react";
import { FilePenLine, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

// 여행 중에는 거의 쓰지 않는 관리 기능을 한곳에 모은다. 삭제를 실수로 누르지 않게 화면에서 뺀다.
export default function TripMenu({
  onEdit,
  onRename,
  onDelete,
}: {
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="trip-menu" ref={root}>
      <button
        type="button"
        className="icon-button"
        aria-label="여행 관리"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className="trip-menu-list" role="menu" aria-label="여행 관리">
          <button type="button" role="menuitem" onClick={run(onEdit)}>
            <FilePenLine size={16} />
            일정 수정
          </button>
          <button type="button" role="menuitem" onClick={run(onRename)}>
            <Pencil size={16} />
            이름 변경
          </button>
          <button type="button" role="menuitem" className="danger-text" onClick={run(onDelete)}>
            <Trash2 size={16} />
            일정 삭제
          </button>
        </div>
      )}
    </div>
  );
}
