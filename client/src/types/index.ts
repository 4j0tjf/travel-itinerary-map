export interface User {
  id: string;
  username: string;
  // 이 계정이 등록한 Google Maps 브라우저 키. 비어 있으면 공용 키 또는 위치 미리보기를 쓴다.
  mapsApiKey?: string;
}
export interface Place {
  id: string;
  time: string;
  endTime: string;
  name: string;
  nameJa: string;
  category: string;
  address: string;
  lat: number | null;
  lng: number | null;
  memo: string;
  image: string;
  mode: "DRIVE" | "WALK" | "TRANSIT" | "OTHER";
}
export type LocatedPlace = Place & { lat: number; lng: number };
export function hasCoordinates(p: Place): p is LocatedPlace {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}
export interface Day {
  date: string;
  title: string;
  description: string;
  places: Place[];
}
export interface Itinerary {
  id: string;
  title: string;
  subtitle: string;
  country: string;
  region: string;
  days: Day[];
  warnings: string[];
  sourceSheet: string;
  createdAt: string;
  updatedAt: string;
  revision?: number;
  workbookAvailable?: boolean;
  source?: {
    kind: "excel" | "google-sheet";
    filename?: string;
    importedAt?: string;
    googleSheetUrl?: string;
    linkUpdatedAt?: string;
  };
}
export function mapsUrl(place: Place) {
  const query = hasCoordinates(place)
    ? `${place.lat},${place.lng}`
    : `${place.name} ${place.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
