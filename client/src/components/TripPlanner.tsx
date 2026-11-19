import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Map as MapIcon,
  ExternalLink,
  Info,
  Leaf,
  MapPin,
  Mountain,
  Navigation,
  Route,
  Settings2,
} from "lucide-react";
import type { Itinerary } from "../types";
import { hasCoordinates, mapsUrl } from "../types";
import TravelMap from "./TravelMap";
import Dialog from "./Dialog";
import MapKeySettings from "./MapKeySettings";
import NextStopCard from "./NextStopCard";
import TripMenu from "./TripMenu";
import { SheetGrip, useSheetDrag, type SheetState } from "./BottomSheet";
import { ROUTE_STYLES, useRoadRoutes } from "../services/road-routes";
import { useMobileLayout } from "../services/use-mobile-layout";
import { useAdaptiveTabs } from "../services/use-adaptive-tabs";
import { rememberDaySelection, restoreDaySelection } from "../services/day-selection";
import { directionsUrl, localDate, stopTiming, todayIndex } from "../services/trip-time";
import { useCurrentLocation } from "../services/use-current-location";
import { useMapsKey } from "../services/maps-key";
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
  // 여행 기간 중이면 오늘 날짜와 지금·다음 장소부터 연다.
  const nowStopId = (index: number, at: Date) => {
    const target = trip.days[index];
    if (!target || target.date !== localDate(at)) return undefined;
    const timing = stopTiming(target, at);
    return timing ? target.places[timing.index]?.id : undefined;
  };
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, todayIndex(trip, new Date())));
  const [selectedId, setSelectedId] = useState(() => {
    const index = Math.max(0, todayIndex(trip, new Date()));
    return restoreDaySelection(trip.id, trip.days[index], nowStopId(index, new Date()));
  });
  const [focusVersion, setFocusVersion] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [sheet, setSheet] = useState<SheetState>("peek");
  const sheetDrag = useSheetDrag(sheet, setSheet);
  const [routeNotesOpen, setRouteNotesOpen] = useState(false);
  const mobile = useMobileLayout();
  const { key: mapsKey } = useMapsKey();
  const location = useCurrentLocation();
  const dateTabs = useAdaptiveTabs(trip.days.length, 116, 82);
  const [routeVisible, setRouteVisible] = useState(true);
  const [modal, setModal] = useState<"settings" | "overview" | null>(null);
  const cards = useRef<Record<string, HTMLDivElement | null>>({});
  const planner = useRef<HTMLElement>(null);
  const day = trip.days[dayIndex];
  const routes = useRoadRoutes(trip);
  const dayRoutes = useMemo(() => routes.paths.filter(path => path.date === day?.date), [routes.paths, day?.date]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const selectPlace = useCallback((id: string) => {
    setSelectedId(id);
    setFocusVersion((version) => version + 1);
    if (!mobile) cards.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // 지도에서 장소를 고르면 카드가 보이게, 목록 전체 화면이면 지도가 보이게 한다.
    else setSheet((state) => (state === "full" ? "half" : state === "mini" ? "peek" : state));
  }, [mobile]);
  useEffect(() => {
    if (day) rememberDaySelection(trip.id, day, selectedId);
  }, [trip.id, day, selectedId]);
  const scrollList = (id: string, resumed: boolean) =>
    requestAnimationFrame(() => {
      if (resumed) cards.current[id]?.scrollIntoView({ behavior: "smooth", block: mobile ? "start" : "nearest" });
      else for (const scroller of document.querySelectorAll("#day-panel, #day-panel .panel-contents")) scroller.scrollTo?.({ top: 0, behavior: "smooth" });
    });
  const changeDay = (index: number) => {
    // 이 세션에서 그 날짜에 보던 장소가 있으면 그 장소부터, 처음이면 첫 장소(오늘이면 지금·다음 장소)부터 보여준다.
    const nextDay = trip.days[index];
    const nextId = restoreDaySelection(trip.id, nextDay, nowStopId(index, new Date()));
    const resumed = Boolean(nextId) && nextId !== nextDay.places[0]?.id;
    setDayIndex(index);
    setSelectedId(nextId);
    document.getElementById(`day-tab-${index}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    scrollList(nextId, resumed);
  };
  const today = todayIndex(trip, now);
  const nowId = today >= 0 ? nowStopId(today, now) : undefined;
  const jumpToNow =
    today >= 0 && (today !== dayIndex || (nowId && nowId !== selectedId))
      ? () => {
          const id = nowId || trip.days[today].places[0]?.id || "";
          setDayIndex(today);
          setSelectedId(id);
          setFocusVersion((version) => version + 1);
          document.getElementById(`day-tab-${today}`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          scrollList(id, true);
        }
      : undefined;
  const showSelectedInList = () => {
    setSheet("half");
    requestAnimationFrame(() => {
      cards.current[selectedId]?.querySelector<HTMLButtonElement>(".place-card")?.focus({ preventScroll: true });
      cards.current[selectedId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const showSelectedOnMap = () => {
    setSheet("peek");
    setFocusVersion(version => version + 1);
  };
  const routeModes = [...new Set(dayRoutes.map((route) => route.mode))];
  const routeNotes = [
    routes.saveFailed ? "경로를 저장하지 못했습니다. 다음 접속 시 다시 조회될 수 있습니다." : "",
    dayRoutes.length ? "실시간 교통은 반영하지 않습니다." : "",
    day?.places.some(p => p.mode === "WALK") ? "도보 경로에 보도나 보행자 통로가 없을 수 있습니다. 현장 표지와 안전한 통행로를 확인하세요." : "",
    day?.places.some(p => p.mode === "TRANSIT") ? "대중교통 경로는 조회한 시각의 노선 기준이라 실제 시간표·환승과 다를 수 있습니다." : "",
    ...new Set(routes.warnings),
  ].filter(Boolean);
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
        <div className="trip-heading-main">
          <h1>{trip.title}</h1>
          <div className="trip-metadata">
            <span>
              <CalendarDays size={14} />
              {trip.days[0].date.replaceAll("-", ".")} — {trip.days.at(-1)?.date.replaceAll("-", ".")}
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
          <button
            className="icon-button heading-settings"
            aria-label="지도 설정"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={18} />
          </button>
          <TripMenu onEdit={onEdit} onRename={onRename} onDelete={onDelete} />
        </div>
      </section>
      <main ref={planner} className="planner-layout" data-sheet={sheet}>
        <div className="planner-toolbar">
          <div className="date-toolbar">
            {/* 바깥 틀은 남는 너비를 재기만 하고 클릭은 지도로 넘긴다. 탭 묶음은 탭만큼만 차지한다. */}
            <div className="date-tabs-frame" ref={dateTabs.ref}>
            <div className="date-tabs" style={dateTabs.style} data-rows={dateTabs.rows} role="tablist" aria-label="여행 날짜">
              {trip.days.map((d, i) => (
                <button
                  key={d.date}
                  id={`day-tab-${i}`}
                  role="tab"
                  aria-selected={dayIndex === i}
                  aria-controls="day-panel"
                  title={`${d.date} · ${d.title}`}
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
            </div>
            <button
              className="date-calendar icon-button"
              aria-label="날짜별 전체 일정 보기"
              onClick={() => setModal("overview")}
            >
              <CalendarDays size={18} />
            </button>
          </div>
        </div>
        <section className="map-section" aria-label="여행 지도">
          <TravelMap
            day={day}
            region={trip.region || trip.title}
            selectedId={selectedId}
            focusVersion={focusVersion}
            onSelect={selectPlace}
            onSettings={() => setModal("settings")}
            routeVisible={routeVisible}
            roadPaths={dayRoutes}
            compact={mobile}
            location={location.position}
            locationStatus={location.status}
            onStartLocation={location.start}
            onStopLocation={location.stop}
          />
          {mapsKey && (
            <div className="route-legend" role="status">
              {routes.loading ? (
                <span className="route-legend-status">경로 준비 중…</span>
              ) : routes.error ? (
                <span className="route-legend-status route-legend-warn">{routes.error}</span>
              ) : routeModes.length ? (
                routeModes.map((mode) => (
                  <span key={mode} className="route-legend-item">
                    <i style={{ background: ROUTE_STYLES[mode].color }} />
                    {ROUTE_STYLES[mode].label}
                  </span>
                ))
              ) : (
                <span className="route-legend-status">표시할 경로 없음</span>
              )}
              {!routes.loading && (routes.error || routes.saveFailed) && (
                <button className="text-action" onClick={routes.retry}>다시 조회</button>
              )}
              {routeNotes.length > 0 && (
                <button
                  className="route-legend-info"
                  aria-label="경로 안내 보기"
                  aria-expanded={routeNotesOpen}
                  onClick={() => setRouteNotesOpen((open) => !open)}
                >
                  <Info size={15} />
                </button>
              )}
              {routeNotesOpen && routeNotes.length > 0 && (
                <div className="route-legend-notes" aria-label="길찾기 안내">
                  {routeNotes.map((note) => <p key={note}>{note}</p>)}
                </div>
              )}
            </div>
          )}
        </section>
        <aside
          ref={sheetDrag.sheetRef}
          id="day-panel"
          className="itinerary-panel"
          role="tabpanel"
          aria-labelledby={`day-tab-${dayIndex}`}
        >
          {mobile ? (
            <div className="sheet-head" {...sheetDrag.headHandlers}>
              <SheetGrip state={sheet} onState={setSheet} />
              <NextStopCard
                day={day}
                dayIndex={dayIndex}
                selectedId={selectedId}
                now={now}
                location={location.position}
                onSelect={selectPlace}
                onShowDetails={showSelectedInList}
                onJumpToNow={jumpToNow}
              />
            </div>
          ) : (
            today >= 0 && (
              <NextStopCard
                day={day}
                dayIndex={dayIndex}
                selectedId={selectedId}
                now={now}
                location={location.position}
                onSelect={selectPlace}
                onJumpToNow={jumpToNow}
              />
            )
          )}
          <div className="panel-contents" ref={mobile ? sheetDrag.listRef : undefined}>
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
                        <div className="place-links">
                          <a href={directionsUrl(p, i > 0 ? day.places[i - 1].mode : undefined)} target="_blank" rel="noreferrer">
                            <Navigation size={13} />
                            길찾기
                          </a>
                          <a href={mapsUrl(p)} target="_blank" rel="noreferrer">
                            Google Maps에서 보기
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <button className="mobile-show-map" onClick={showSelectedOnMap}><MapIcon size={17} />지도에서 위치 보기</button>
                      </div>
                    )}
                    {i < day.places.length - 1 && (
                      <div className="travel-leg">
                        <Navigation size={11} />
                        <span>
                          {p.mode === "OTHER" ? "기타 이동수단" : `${ROUTE_STYLES[p.mode].label} 이동`}
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
          title={modal === "settings" ? "지도 설정" : "날짜별 전체 일정"}
          onClose={() => setModal(null)}
          wide={modal === "overview"}
        >
          {modal === "settings" ? (
            <MapKeySettings />
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
