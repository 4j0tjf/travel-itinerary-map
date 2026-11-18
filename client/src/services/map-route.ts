import { hasCoordinates, type Day, type LocatedPlace } from "../types";

// A missing stop must leave a gap instead of suggesting a direct connection.
export function routeSegments(places: Day["places"]): [LocatedPlace, LocatedPlace][] {
  const segments: [LocatedPlace, LocatedPlace][] = [];
  for (let index = 1; index < places.length; index++) {
    const previous = places[index - 1];
    const current = places[index];
    if (hasCoordinates(previous) && hasCoordinates(current)) {
      segments.push([previous, current]);
    }
  }
  return segments;
}
