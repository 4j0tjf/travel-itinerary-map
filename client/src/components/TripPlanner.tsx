import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Leaf,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  FilePenLine,
  Route,
  Settings2,
  Trash2,
  Check,
} from "lucide-react";
import type { Itinerary } from "../types";
import { hasCoordinates, mapsUrl } from "../types";
import TravelMap from "./TravelMap";
import Dialog from "./Dialog";
import { useRoadRoutes } from "../services/road-routes";
const weekday = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("ko-KR", { weekday: "long" });
const shortDate = (date: string) =>
  new Date(date + "T12:00:00").toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
export default function TripPlanner({
  trip,
  onRename,
  onDelete,
  onEdit,
}: {
  trip: Itinerary;
  onRename: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(
    trip.days[0]?.places[0]?.id || "",
  );
  const [focusVersion, setFocusVersion] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [routeVisible, setRouteVisible] = useState(true);
  const [modal, setModal] = useState<"settings" | "overview" | null>(null);
  const cards = useRef<Record<string, HTMLDivElement | null>>({});
  const day = trip.days[dayIndex];
  const routes = useRoadRoutes(trip);
  const dayRoutes = useMemo(() => routes.paths.filter(path => path.date === day?.date), [routes.paths, day?.date]);
  const selectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setFocusVersion((version) => version + 1);
    setCollapsed(false);
    cards.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const changeDay = (index: number) => {
    setDayIndex(index);
    setSelectedId(trip.days[index].places[0]?.id || "");
    setCollapsed(false);
  };
  if (!day)
    return (
      <div className="state-page">
        <MapPin />
        <p>이 여행에 등록된 일정이 없습니다.</p>
      </div>
    );
  return (
    <>
      <section className="trip-heading">
        <div>
          <div className="breadcrumbs">
            전체 일정
            <ChevronRight size={12} />
            <span>{trip.region || trip.title}</span>
          </div>
          <div className="trip-title-row">
            <h1>{trip.title}</h1>
          </div>
          <div className="trip-metadata">
            <span>
              <CalendarDays size={14} />
              {trip.days[0].date.replaceAll("-", ".")} —{" "}
              {trip.days.at(-1)?.date.replaceAll("-", ".")}
            </span>
            <span className="meta-dot">·</span>
            <span>{trip.days.length}일간의 여행</span>
            <span className="meta-dot">·</span>
            <span>
              <MapPin size={14} />
              {trip.days.reduce((s, d) => s + d.places.length, 0)}개의 장소
            </span>
          </div>
        </div>
        <div className="trip-heading-right">
          <button className="text-action" onClick={onEdit}>
            <FilePenLine size={14} />
            <span>일정 수정</span>
          </button>
          <button className="text-action" onClick={onRename}>
            <Pencil size={14} />
            <span>이름 변경</span>
          </button>
          <button className="text-action danger-text" onClick={onDelete}>
            <Trash2 size={14} />
            <span>일정 삭제</span>
          </button>
          <button
            className="icon-button heading-settings"
            aria-label="지도 설정"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </section>
      <main className={`planner-layout ${collapsed ? "panel-collapsed" : ""}`}>
        <section className="map-section" aria-label="여행 지도">
          <div className="date-toolbar">
            <div className="date-tabs" role="tablist" aria-label="여행 날짜">
              {trip.days.map((d, i) => (
                <button
                  key={d.date}
                  id={`day-tab-${i}`}
                  role="tab"
                  aria-selected={dayIndex === i}
                  aria-controls="day-panel"
                  className={`date-tab ${dayIndex === i ? "selected" : ""}`}
                  onClick={() => changeDay(i)}
                >
                  <span className="day-tab-label">
                    DAY {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {shortDate(d.date)}
                    <small>{weekday(d.date).slice(0, 1)}</small>
                  </span>
                  {dayIndex === i && <span className="tab-dot" />}
                </button>
              ))}
            </div>
            <button
              className="date-calendar icon-button"
              aria-label="날짜별 전체 일정 보기"
              onClick={() => setModal("overview")}
            >
              <CalendarDays size={18} />
            </button>
          </div>
          <TravelMap
            day={day}
            region={trip.region || trip.title}
            selectedId={selectedId}
            focusVersion={focusVersion}
            onSelect={selectPlace}
            onSettings={() => setModal("settings")}
            routeVisible={routeVisible}
            roadPaths={dayRoutes}
          />
          <div className="road-route-status" role="status">
            <span>{routes.loading ? "전체 날짜의 길찾기 경로를 준비하고 있어요…" : routes.error ||
              (dayRoutes.length ? "자동차는 파랑, 도보는 갈색 경로입니다. 실시간 교통은 반영하지 않습니다." : "이 날짜에는 표시 가능한 자동차·도보 경로가 없습니다.")}</span>
            {routes.saveFailed && <span>경로를 저장하지 못했습니다. 다음 접속 시 다시 조회될 수 있습니다.</span>}
            {!routes.loading && (routes.error || routes.saveFailed) && <button className="text-action" onClick={routes.retry}>경로 다시 조회</button>}
            {day.places.some(p => p.mode === "WALK") && <span>도보 경로에 보도나 보행자 통로가 없을 수 있습니다. 현장 표지와 안전한 통행로를 확인하세요.</span>}
            {routes.warnings.length > 0 && <div aria-label="길찾기 안내">{[...new Set(routes.warnings)].map(warning => <p key={warning}>{warning}</p>)}</div>}
          </div>
          <div className="journey-note">
            <span className="journey-note-icon">
              <Route size={17} />
            </span>
            <div>
              <strong>목적지보다, 그 사이의 순간들.</strong>
              <span>번호를 따라 오늘의 여행을 둘러보세요.</span>
            </div>
            <span className="journey-note-count">
              {day.places.length} PLACES
              <ArrowRight size={16} />
            </span>
          </div>
        </section>
        <aside
          id="day-panel"
          className="itinerary-panel"
          role="tabpanel"
          aria-labelledby={`day-tab-${dayIndex}`}
        >
          <button
            className="mobile-panel-toggle"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
          >
            <span className="drag-handle" />
            <span>오늘의 일정 · {day.places.length}곳</span>
            <ChevronDown size={17} className={collapsed ? "rotated" : ""} />
          </button>
          <div className="panel-contents">
            <div className="panel-hero">
              <div className="hero-art" aria-hidden="true">
                <Mountain size={160} strokeWidth={0.65} />
              </div>
              {day.places.find((p) => p.image)?.image && (
                <img
                  src={day.places.find((p) => p.image)?.image}
                  alt={`${trip.title} 여행 풍경`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <div className="hero-shade" />
              <span className="hero-location">
                <MapPin size={12} />
                {trip.region || trip.title}
              </span>
              <div className="hero-text">
                <span>YOUR OWN JOURNEY</span>
                <strong>풍경이 여행이 되는 곳</strong>
              </div>
              <span className="hero-day">
                {String(dayIndex + 1).padStart(2, "0")}
                <span>/ {String(trip.days.length).padStart(2, "0")}</span>
              </span>
            </div>
            <div className="day-heading">
              <div className="day-eyebrow">
                <span>DAY {String(dayIndex + 1).padStart(2, "0")}</span>
                <span>
                  {shortDate(day.date)} {weekday(day.date)}
                </span>
              </div>
              <h2>{day.title}</h2>
              <p>{day.description}</p>
              <div className="day-stats">
                <span>
                  <MapPin size={14} />
                  {day.places.length}곳 방문
                </span>
                <span>
                  <CalendarDays size={14} />
                  {day.places[0]?.time || "—"}
                  {day.places.at(-1)?.endTime
                    ? " – " + day.places.at(-1)?.endTime
                    : ""}
                </span>
                <button
                  onClick={() => setRouteVisible((v) => !v)}
                  aria-pressed={routeVisible}
                >
                  <Route size={14} />
                  {routeVisible ? "경로 켜짐" : "경로 꺼짐"}
                </button>
              </div>
            </div>
            {trip.warnings?.length > 0 && (
              <details className="import-warnings">
                <summary>
                  <Info size={13} />
                  가져오기 안내 {trip.warnings.length}건
                </summary>
                <ul>
                  {trip.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="schedule-list">
              <div className="schedule-label">
                <span>오늘의 발자취</span>
                <span>방문 순서대로</span>
              </div>
              {day.places.map((p, i) => (
                <div
                  className={`schedule-item ${selectedId === p.id ? "selected" : ""}`}
                  key={p.id}
                  ref={(el) => {
                    cards.current[p.id] = el;
                  }}
                >
                  <div className="timeline">
                    <span className="timeline-number">{i + 1}</span>
                    {i < day.places.length - 1 && (
                      <span className="timeline-line" />
                    )}
                  </div>
                  <div className="place-column">
                    <button
                      className="place-card"
                      onClick={() => selectPlace(p.id)}
                      aria-expanded={selectedId === p.id}
                    >
                      <div className="place-card-top">
                        <span className="place-time">
                          {p.time}
                          {p.endTime && <span> – {p.endTime}</span>}
                        </span>
                        <span className={`category category-${i % 3}`}>
                          {p.category}
                        </span>
                      </div>
                      <div className="place-card-body">
                        <div>
                          <h3>{p.name}</h3>
                          {p.nameJa && (
                            <p className="japanese-name">{p.nameJa}</p>
                          )}
                          {!hasCoordinates(p) && (
                            <span className="missing-coordinate">
                              좌표 미등록 · 주소로 열기 가능
                            </span>
                          )}
                          {selectedId !== p.id && (
                            <p className="short-memo">{p.memo}</p>
                          )}
                        </div>
                        {p.image && (
                          <div className="photo-wrap">
                            <Mountain className="photo-fallback" />
                            <img
                              src={p.image}
                              alt={p.name}
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                    {selectedId === p.id && (
                      <div className="place-details">
                        {p.address && (
                          <p className="place-address">
                            <MapPin size={12} />
                            {p.address}
                          </p>
                        )}
                        {p.memo && <p className="place-memo">{p.memo}</p>}
                        <a href={mapsUrl(p)} target="_blank" rel="noreferrer">
                          Google Maps에서 보기
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                    {i < day.places.length - 1 && (
                      <div className="travel-leg">
                        <Navigation size={11} />
                        <span>
                          {p.mode === "WALK"
                            ? "도보 이동"
                            : p.mode === "DRIVE"
                              ? "자동차 이동"
                              : "기타 이동수단"}
                        </span>
                        <span className="leg-dot">·</span>
                        <span>{routes.loading ? "경로 조회 중" : p.mode === "OTHER" ? "경로 미지원" : "지도 경로 참고"}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel-footer">
              <Leaf size={14} />
              <span>당신의 속도로, 당신만의 여행.</span>
              <span>여정</span>
            </div>
          </div>
        </aside>
      </main>
      {modal && (
        <Dialog
          title={modal === "settings" ? "여행 지도 안내" : "날짜별 전체 일정"}
          onClose={() => setModal(null)}
          wide={modal === "overview"}
        >
          {modal === "settings" ? (
            <>
              <p>Google Maps 연결에는 브라우저용 API 키가 필요합니다.</p>
              <div className="info-note">
                <Info size={17} />
                <p>
                  자동차·도보 이동은 Google 길찾기 경로로 표시합니다. 같은 이동수단의
                  연속 구간은 묶어 조회하며 방문 순서를 유지합니다. 좌표가 없는 구간과
                  기타 이동수단은 임의로 연결하지 않습니다. 키가 없으면 상대 위치만 표시합니다.
                </p>
              </div>
              <ol className="setup-steps">
                <li>
                  서버 프로젝트의 <code>.env</code>에 키를 설정하세요.
                  <code className="code-block">
                    VITE_GOOGLE_MAPS_API_KEY=브라우저용_키
                  </code>
                </li>
                <li>
                  Maps JavaScript API와 Routes API를 활성화하고, 웹사이트 제한에{" "}
                  <code>https://19991115.xyz/*</code>를 추가하세요.
                </li>
                <li>
                  <code>npm run build</code> 후 현재 앱 실행 프로세스를
                  재시작하세요.
                </li>
              </ol>
              <button className="primary-button" onClick={() => setModal(null)}>
                확인했어요
                <Check size={16} />
              </button>
            </>
          ) : (
            <div className="overview-days">
              {trip.days.map((d, i) => (
                <button
                  key={d.date}
                  className="overview-day"
                  onClick={() => {
                    changeDay(i);
                    setModal(null);
                  }}
                >
                  <span className="overview-day-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <span>
                      {shortDate(d.date)} · {weekday(d.date)}
                    </span>
                    <strong>{d.title}</strong>
                    <p>{d.places.map((p) => p.name).join(" → ")}</p>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
