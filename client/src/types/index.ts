export interface User {
  id: string;
  username: string;
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
  mode: "DRIVE" | "WALK" | "OTHER";
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
}
export function mapsUrl(place: Place) {
  const query = hasCoordinates(place)
    ? `${place.lat},${place.lng}`
    : `${place.name} ${place.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
