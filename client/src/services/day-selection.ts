import type { Day } from "../types";

// 날짜마다 마지막으로 보던 장소를 브라우저 탭 세션 동안 기억한다.
// 새로고침·여행 탭 전환·다시 들어온 탭에서도 유지되고, 탭을 닫으면 사라진다.
type Remembered = { id: string; index: number };
type TripSelections = Record<string, Remembered>;

const fallback = new Map<string, TripSelections>();
const storageKey = (tripId: string) => `travel:day-selection:${tripId}`;

function read(tripId: string): TripSelections {
  try {
    const raw = sessionStorage.getItem(storageKey(tripId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as TripSelections;
    }
    return {};
  } catch {
    return fallback.get(tripId) ?? {};
  }
}

function write(tripId: string, selections: TripSelections) {
  fallback.set(tripId, selections);
  try {
    sessionStorage.setItem(storageKey(tripId), JSON.stringify(selections));
  } catch {
    // 저장소를 쓸 수 없으면(사생활 보호 모드 등) 이 페이지 안에서만 기억한다.
  }
}

export function rememberDaySelection(tripId: string, day: Day, placeId: string) {
  const index = day.places.findIndex((p) => p.id === placeId);
  if (index < 0) return;
  const selections = read(tripId);
  const current = selections[day.date];
  if (current?.id === placeId && current.index === index) return;
  write(tripId, { ...selections, [day.date]: { id: placeId, index } });
}

// 그 날짜에서 보던 장소가 있으면 그 장소, 없으면 첫 장소.
// 시트를 다시 가져와 장소 ID가 바뀌었으면 같은 번호를 쓴다.
export function restoreDaySelection(tripId: string, day: Day | undefined) {
  if (!day?.places.length) return "";
  const remembered = read(tripId)[day.date];
  if (!remembered) return day.places[0].id;
  const byId = day.places.find((p) => p.id === remembered.id);
  if (byId) return byId.id;
  return day.places[Number.isInteger(remembered.index) ? remembered.index : 0]?.id ?? day.places[0].id;
}
