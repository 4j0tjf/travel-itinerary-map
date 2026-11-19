import { useEffect, useState } from "react";

// 배포 빌드에서만 서비스 워커를 등록한다(개발 서버에서는 캐시가 방해된다).
export function registerOfflineSupport() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {});
  });
}

// 로그아웃하거나 세션이 끝나면 이 기기에 저장한 여행 일정을 지운다.
export function clearOfflineTripData() {
  if (typeof caches !== "undefined") void caches.delete("trip-data").catch(() => {});
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
