import { useEffect, useState } from "react";

export const mobileLayoutQuery = "(max-width: 760px), (max-width: 960px) and (max-height: 500px) and (pointer: coarse)";

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(mobileLayoutQuery).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(mobileLayoutQuery);
    if (!query) return;
    const change = () => setMobile(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return mobile;
}
