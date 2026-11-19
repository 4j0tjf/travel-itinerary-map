import { ChevronLeft, ChevronRight, Clock3, List, Navigation } from "lucide-react";
import type { Day } from "../types";
import { hasCoordinates } from "../types";
import { ROUTE_STYLES } from "../services/road-routes";
import type { CurrentLocation } from "../services/use-current-location";
import {
  directionsUrl,
  distanceMeters,
  formatDistance,
  formatDuration,
  localDate,
  minutesOf,
  stopTiming,
} from "../services/trip-time";

// 여행 중 가장 먼저 보는 카드: 지금/다음 장소, 남은 시간, 거리, 한 번에 여는 길찾기.
export default function NextStopCard({
  day,
  dayIndex,
  selectedId,
  now,
  location,
  onSelect,
  onShowDetails,
  onJumpToNow,
}: {
  day: Day;
  dayIndex: number;
  selectedId: string;
  now: Date;
  location: CurrentLocation | null;
  onSelect: (id: string) => void;
  onShowDetails?: () => void;
  onJumpToNow?: () => void;
}) {
  const found = day.places.findIndex((p) => p.id === selectedId);
  const index = found < 0 ? 0 : found;
  const place = day.places[index];
  if (!place) return null;
  const isToday = day.date === localDate(now);
  const timing = isToday ? stopTiming(day, now) : null;
  const endTime = place.endTime || day.places[index + 1]?.time || "";
  const start = minutesOf(place.time);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const label =
    timing?.index === index
      ? timing.state === "current"
        ? `지금 일정${endTime ? ` · ${endTime}까지` : ""}`
        : timing.state === "next"
          ? `다음 일정 · ${formatDuration(timing.minutesUntil)} 후`
          : "오늘 마지막 일정"
      : isToday && start !== null
        ? start > nowMinutes
          ? `${formatDuration(start - nowMinutes)} 후 일정`
          : "지난 일정"
        : `${dayIndex + 1}일차 · ${index + 1} / ${day.places.length}`;
  const arrivalMode = index > 0 ? day.places[index - 1].mode : undefined;
  const modeLabel = arrivalMode && arrivalMode !== "OTHER" ? ROUTE_STYLES[arrivalMode].label : "";
  const distance = location && hasCoordinates(place) ? formatDistance(distanceMeters(location, place)) : "";
  const previous = day.places[index - 1];
  const next = day.places[index + 1];

  return (
    <section className="next-stop" aria-label="지금 보는 장소">
      <div className="next-stop-label">
        <Clock3 size={14} />
        <span>{label}</span>
        {onJumpToNow && (
          <button type="button" className="next-stop-now" onClick={onJumpToNow}>
            지금 일정으로
          </button>
        )}
      </div>
      <div className="next-stop-main">
        <span className="next-stop-number" aria-hidden="true">{index + 1}</span>
        <div className="next-stop-text">
          <span className="next-stop-time">
            {place.time}
            {endTime && ` – ${endTime}`}
            {distance && <span className="next-stop-distance"> · 여기서 {distance}</span>}
          </span>
          <strong>{place.name}</strong>
          {place.memo && <p>{place.memo}</p>}
        </div>
        <div className="next-stop-steps">
          <button type="button" aria-label="이전 장소" disabled={!previous} onClick={() => previous && onSelect(previous.id)}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" aria-label="다음 장소" disabled={!next} onClick={() => next && onSelect(next.id)}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="next-stop-actions">
        <a className="primary-button" href={directionsUrl(place, arrivalMode)} target="_blank" rel="noreferrer">
          <Navigation size={17} />
          길찾기{modeLabel && <span className="next-stop-mode"> · {modeLabel}</span>}
        </a>
        {onShowDetails && (
          <button type="button" className="secondary-button" onClick={onShowDetails}>
            <List size={17} />
            일정 자세히
          </button>
        )}
      </div>
    </section>
  );
}
