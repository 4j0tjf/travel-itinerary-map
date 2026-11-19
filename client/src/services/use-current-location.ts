import { useCallback, useEffect, useRef, useState } from "react";

export type LocationStatus = "off" | "locating" | "on" | "denied" | "unavailable";
export interface CurrentLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

// 기기 위치를 지도에 보여준다. 권한을 이미 허용했으면 바로 켜고, 아니면 사용자가 버튼을 누를 때 묻는다.
// 위치는 이 기기 안에서만 쓰고 서버로 보내지 않는다.
export function useCurrentLocation() {
  const [status, setStatus] = useState<LocationStatus>("off");
  const [position, setPosition] = useState<CurrentLocation | null>(null);
  const watch = useRef<number | null>(null);
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;

  const stop = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setStatus("off");
  }, []);
  const start = useCallback(() => {
    if (!supported) {
      setStatus("unavailable");
      return;
    }
    if (watch.current !== null) return;
    setStatus("locating");
    watch.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
        setStatus("on");
      },
      (error) => {
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }, [supported]);

  useEffect(() => {
    let active = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        if (active && permission.state === "granted") start();
      })
      .catch(() => {});
    return () => {
      active = false;
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    };
  }, [start]);

  return { status, position, start, stop, supported };
}
