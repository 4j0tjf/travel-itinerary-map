import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";

export function useAdaptiveTabs(count: number, preferredWidth: number, minimumWidth = 88) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(element.clientWidth - parseFloat(style.paddingLeft || "0") - parseFloat(style.paddingRight || "0"));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const available = width || preferredWidth * Math.max(count, 1);
  const capacity = Math.max(1, Math.floor((available + 4) / (preferredWidth + 4)));
  const rows = count > capacity ? 2 : 1;
  const columns = Math.max(1, Math.ceil(count / rows));
  const tabWidth = Math.max(minimumWidth, Math.min(preferredWidth, (available - (columns - 1) * 4) / columns));
  return { ref, rows, style: {
    "--tab-columns": columns, "--tab-width": `${tabWidth}px`, "--tab-rows": rows,
  } as CSSProperties };
}
