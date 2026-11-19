import type { Day, Itinerary, Place } from "../types";

// 여행 중에는 기기 시계를 현지 시각으로 본다(휴대폰은 도착하면 시간대가 바뀐다).
export const localDate = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const minutesOfDay = (now: Date) => now.getHours() * 60 + now.getMinutes();
export const minutesOf = (time: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

// 오늘이 여행 날짜 중 하나면 그 날의 순서, 아니면 -1.
export const todayIndex = (trip: Itinerary, now: Date) => trip.days.findIndex((d) => d.date === localDate(now));

export type StopTiming =
  | { state: "current"; index: number; minutesLeft: number | null }
  | { state: "next"; index: number; minutesUntil: number }
  | { state: "done"; index: number };

// 오늘 일정에서 지금 머무는 장소, 없으면 다음 장소, 다 끝났으면 마지막 장소.
export function stopTiming(day: Day, now: Date): StopTiming | null {
  if (!day.places.length) return null;
  const nowMinutes = minutesOfDay(now);
  for (let i = 0; i < day.places.length; i++) {
    const start = minutesOf(day.places[i].time);
    if (start === null) continue;
    const nextStart = day.places.slice(i + 1).map((p) => minutesOf(p.time)).find((m) => m !== null) ?? null;
    const end = minutesOf(day.places[i].endTime) ?? nextStart;
    if (start > nowMinutes) return { state: "next", index: i, minutesUntil: start - nowMinutes };
    if (end === null || nowMinutes < end)
      return { state: "current", index: i, minutesLeft: end === null ? null : end - nowMinutes };
  }
  return { state: "done", index: day.places.length - 1 };
}

export const formatDuration = (minutes: number) => {
  if (minutes < 1) return "곧";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`;
};

const RAD = Math.PI / 180;
// 두 지점 사이 직선거리(m).
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
export const formatDistance = (meters: number) =>
  meters < 1000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`;

// Google 지도 앱/웹의 길찾기 링크. API 키나 사용량을 쓰지 않는다. 출발지는 기기의 현재 위치.
const TRAVEL_MODE: Record<Place["mode"], string | undefined> = {
  DRIVE: "driving",
  WALK: "walking",
  TRANSIT: "transit",
  OTHER: undefined,
};
export function directionsUrl(place: Place, arrivalMode?: Place["mode"]) {
  const destination =
    typeof place.lat === "number" && typeof place.lng === "number"
      ? `${place.lat},${place.lng}`
      : [place.name, place.address].filter(Boolean).join(" ");
  const params = new URLSearchParams({ api: "1", destination });
  const mode = arrivalMode && TRAVEL_MODE[arrivalMode];
  if (mode) params.set("travelmode", mode);
  return `https://www.google.com/maps/dir/?${params}`;
}
