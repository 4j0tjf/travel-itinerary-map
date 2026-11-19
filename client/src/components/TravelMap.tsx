import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Minus,
  LocateFixed,
  Mountain,
  Layers,
  MapPin,
  ExternalLink,
  Navigation,
  LoaderCircle,
  KeyRound,
  X,
} from "lucide-react";
import type { Day, LocatedPlace } from "../types";
import { hasCoordinates, mapsUrl } from "../types";
import {
  attachSharedMap,
  detachSharedMap,
  loadMaps,
  onMapsFailure,
  watchMapErrors,
  type MapsFailure,
} from "../services/google-maps";
import type { RoadPath } from "../services/road-routes";
import { useMapsKey } from "../services/maps-key";
import {
  LABEL_FONT,
  MOBILE_LABEL_FONT,
  clusterLabel,
  clusterPins,
  clusterText,
  fitLabel,
  labelBox,
  placeLabels,
  slotOrder,
  textWidth,
  type Box,
} from "../services/label-layout";
export default function TravelMap({
  day,
  region,
  selectedId,
  focusVersion,
  onSelect,
  onSettings,
  routeVisible,
  roadPaths = [],
  compact = false,
  onShowList,
}: {
  day: Day;
  region: string;
  selectedId: string;
  focusVersion: number;
  onSelect: (id: string) => void;
  onSettings: () => void;
  routeVisible: boolean;
  roadPaths?: RoadPath[];
  compact?: boolean;
  onShowList?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<Record<string, google.maps.Marker>>({});
  const info = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const { key: apiKey, source: keySource } = useMapsKey();
  // 오류는 그 키에만 붙인다. 계정이 바뀌어 키가 달라지면 이전 키의 오류는 보이지 않는다.
  const [failure, setFailure] = useState<{ key: string; message: string; kind?: MapsFailure } | null>(null);
  const currentFailure = failure?.key === apiKey ? failure : null;
  const error = currentFailure?.message || "";
  const [keyAlertClosed, setKeyAlertClosed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [aspect, setAspect] = useState(1.3);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [terrain, setTerrain] = useState(false);
  const [peekKey, setPeekKey] = useState("");
  const [, setFontsLoaded] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const previousSelection = useRef({ day: day.date, focus: focusVersion });
  const previousMapFocus = useRef<{ day: string; focus: number } | null>(null);
  const located = day.places.filter(hasCoordinates);
  const selected = day.places.find((p) => p.id === selectedId);
  const missing = day.places.length - located.length;
  const midLat = located.length
    ? (Math.min(...located.map((p) => p.lat)) +
        Math.max(...located.map((p) => p.lat))) /
      2
    : 0;
  const midLng = located.length
    ? (Math.min(...located.map((p) => p.lng)) +
        Math.max(...located.map((p) => p.lng))) /
      2
    : 0;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const xSpan = located.length
    ? (Math.max(...located.map((p) => p.lng)) -
        Math.min(...located.map((p) => p.lng))) *
      cos
    : 0;
  const ySpan = located.length
    ? Math.max(...located.map((p) => p.lat)) -
      Math.min(...located.map((p) => p.lat))
    : 0;
  const baseHeight = 1000 / aspect;
  const scale = Math.min(
    700 / (xSpan || 0.02),
    Math.max(baseHeight - 260, 80) / (ySpan || 0.02),
  );
  const project = (p: LocatedPlace) => ({
    x: 500 + (p.lng - midLng) * cos * scale,
    y: baseHeight / 2 - (p.lat - midLat) * scale,
  });
  const fit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (map.current && located.length) {
      const bounds = new google.maps.LatLngBounds();
      located.forEach((p) => bounds.extend(p));
      map.current.fitBounds(bounds, 75);
      if (located.length === 1) map.current.setZoom(14);
    }
  };
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width && height) {
        setAspect(width / height);
        setViewportWidth(width);
      }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [day]);
  useEffect(() => {
    // 웹 글꼴이 늦게 오면 이름표 폭을 다시 잰다.
    let active = true;
    document.fonts?.ready.then(() => active && setFontsLoaded((v) => v + 1));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const previous = previousSelection.current;
    if (
      previous.day === day.date &&
      previous.focus !== focusVersion &&
      selected &&
      hasCoordinates(selected)
    ) {
      const pos = project(selected);
      setPan({ x: pos.x - 500, y: pos.y - baseHeight / 2 });
    }
    previousSelection.current = { day: day.date, focus: focusVersion };
  }, [selectedId, day, focusVersion]);
  useEffect(() => {
    const mapHost = container.current;
    if (!apiKey || !mapHost) return;
    let active = true;
    let failed = false;
    let stopErrorWatch = () => {};
    // 키 인증 실패·사용량 초과가 알려지면 위치 미리보기로 바꾸고 키 등록 안내를 띄운다.
    const stopFailureWatch = onMapsFailure((kind) => {
      failed = true;
      if (active)
        setFailure({
          key: apiKey,
          kind,
          message:
            kind === "quota"
              ? "Google Maps 키의 오늘 사용량을 모두 썼습니다. 위치 미리보기로 표시합니다."
              : "Google Maps 키로 지도를 불러오지 못했습니다. 지도 설정에서 키를 확인해 주세요.",
        });
    });
    // 지도 로드는 과금 대상이라, 백그라운드에서 다시 열린 탭은 화면에 보일 때까지 기다린다.
    const start = () => {
      if (document.visibilityState === "hidden") return;
      document.removeEventListener("visibilitychange", start);
      loadMaps(apiKey)
        .then(() => {
          if (!active || failed) return;
          const shared = attachSharedMap(mapHost);
          stopErrorWatch = watchMapErrors(shared.element);
          map.current = shared.map;
          info.current = shared.info;
          setReady(true);
        })
        .catch((e) => {
          if (active) setFailure({ key: apiKey, message: e.message });
        });
    };
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      active = false;
      stopFailureWatch();
      stopErrorWatch();
      document.removeEventListener("visibilitychange", start);
      Object.values(markers.current).forEach((marker) => marker.setMap(null));
      markers.current = {};
      detachSharedMap(mapHost);
      map.current = null;
      info.current = null;
      setReady(false);
    };
  }, [apiKey]);
  useEffect(() => {
    if (!ready || !map.current) return;
    info.current?.close();
    Object.values(markers.current).forEach((marker) => marker.setMap(null));
    markers.current = {};
    const bounds = new google.maps.LatLngBounds();
    day.places.forEach((p, index) => {
      if (!hasCoordinates(p)) return;
      bounds.extend(p);
      const marker = new google.maps.Marker({
        map: map.current,
        position: p,
        title: `${index + 1}. ${p.name}`,
        label: { text: String(index + 1), color: "#fff", fontWeight: "700" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 17,
          fillColor: "#285748",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 3,
        },
      });
      marker.addListener("click", () => onSelect(p.id));
      markers.current[p.id] = marker;
    });
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, 75);
      if (Object.keys(markers.current).length === 1) map.current.setZoom(14);
    }
  }, [day, ready, onSelect]);
  useEffect(() => {
    if (!ready || !map.current || !routeVisible || error) return;
    const lines = roadPaths.map((route) =>
      new google.maps.Polyline({
        map: map.current,
        path: route.path,
        clickable: false,
        strokeColor: route.mode === "WALK" ? "#8b5c27" : "#2468c5",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      }),
    );
    return () => lines.forEach((line) => line.setMap(null));
  }, [day, ready, routeVisible, error, roadPaths]);
  useEffect(() => {
    if (!ready || !map.current || !roadPaths.length) return;
    const bounds = new google.maps.LatLngBounds();
    day.places.filter(hasCoordinates).forEach(p => bounds.extend(p));
    roadPaths.forEach(route => route.path.forEach(point => bounds.extend(point)));
    map.current.fitBounds(bounds, 75);
  }, [day, ready, roadPaths]);
  useEffect(() => {
    if (!map.current || !selected || !ready) return;
    const previous = previousMapFocus.current;
    previousMapFocus.current = { day: day.date, focus: focusVersion };
    if (!hasCoordinates(selected)) {
      info.current?.close();
      return;
    }
    if (previous?.day === day.date && previous.focus !== focusVersion) {
      map.current.panTo(selected);
    }
    if (compact) {
      info.current?.close();
      return;
    }
    const content = document.createElement("div");
    content.className = "google-info";
    const heading = document.createElement("strong");
    heading.textContent = selected.name;
    const description = document.createElement("p");
    description.textContent = `${selected.time} · ${selected.memo}`;
    content.append(heading, description);
    info.current?.setContent(content);
    info.current?.open({
      map: map.current,
      anchor: markers.current[selected.id],
    });
  }, [selected, ready, day, focusVersion, compact]);
  useEffect(() => {
    if (ready && map.current) map.current.setMapTypeId(terrain ? "terrain" : "roadmap");
  }, [terrain, ready]);
  const width = 1000 / zoom,
    height = baseHeight / zoom;
  const viewLeft = 500 - width / 2 + pan.x;
  const viewTop = baseHeight / 2 - height / 2 + pan.y;
  const pinScale = width / viewportWidth;
  const previewMode = !apiKey || Boolean(error);
  const compactLabels = viewportWidth < 600;
  const labelFont =
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)")?.matches
      ? MOBILE_LABEL_FONT
      : LABEL_FONT;
  const labelView: Box = { x: 0, y: 0, w: viewportWidth, h: viewportWidth / aspect };
  // 화면 픽셀 기준으로 겹치는 핀은 묶고(예: "3·6"), 이름표는 빈 자리를 찾아 놓는다.
  const pinGroups = previewMode
    ? clusterPins(
        day.places.flatMap((p, i) => {
          if (!hasCoordinates(p)) return [];
          const point = project(p);
          return [{ item: p, number: i + 1, x: (point.x - viewLeft) / pinScale, y: (point.y - viewTop) / pinScale }];
        }),
      ).map((cluster) => {
        const active = cluster.items.some((p) => p.id === selectedId);
        const radius = active ? 20 : 17;
        const text = clusterText(cluster.numbers);
        const label = fitLabel(clusterLabel(cluster.items.map((p) => p.name)), labelFont);
        return {
          ...cluster,
          key: cluster.items[0].id,
          active,
          priority: active,
          radius,
          halfWidth:
            cluster.items.length > 1 ? Math.max(radius, Math.ceil(textWidth(text, 700, labelFont) / 2) + 12) : radius,
          text,
          label: label.text,
          labelWidth: label.width,
          svgX: viewLeft + cluster.x * pinScale,
          svgY: viewTop + cluster.y * pinScale,
        };
      })
    : [];
  type PinGroup = (typeof pinGroups)[number];
  const labelBoxes = placeLabels(pinGroups, labelView, {
    wanted: (group) => !compactLabels || group.active,
    preferAbove: compactLabels,
  });
  // 자리를 못 받은 이름표는 선택했거나 호버·포커스할 때만 맨 위에 띄운다.
  const floatingLabels = pinGroups
    .filter((group) => !labelBoxes.has(group.key) && (group.active || group.key === peekKey))
    .map((group) => ({
      group,
      box: labelBox(group, slotOrder(group, labelView, compactLabels)[0], labelView),
    }));
  const placedLabels = pinGroups
    .filter((group) => labelBoxes.has(group.key))
    .sort((a, b) => Number(a.active) - Number(b.active))
    .map((group) => ({ group, box: labelBoxes.get(group.key)! }));
  const selectGroup = (group: PinGroup) => {
    // 묶음 핀은 누를 때마다 안의 장소를 차례로 고른다.
    const current = group.items.findIndex((p) => p.id === selectedId);
    onSelect(group.items[(current + 1) % group.items.length].id);
  };
  const peek = (key: string) => () => setPeekKey(key);
  const unpeek = (key: string) => () => setPeekKey((current) => (current === key ? "" : current));
  const renderLabel = ({ group, box }: { group: PinGroup; box: Box }) => (
    <g
      key={group.key}
      className="map-label"
      data-marker="true"
      aria-hidden="true"
      transform={`translate(${group.svgX} ${group.svgY}) scale(${pinScale})`}
      onClick={() => selectGroup(group)}
      onPointerEnter={peek(group.key)}
      onPointerLeave={unpeek(group.key)}
    >
      <rect
        x={box.x - group.x}
        y={box.y - group.y}
        width={box.w}
        height={box.h}
        rx="6"
        fill="#fffefa"
        filter="url(#pin-shadow)"
      />
      <text x={box.x - group.x + 10} y={box.y - group.y + 22} fill="#344a35" style={{ fontSize: 14 }}>
        {group.label}
      </text>
    </g>
  );
  return (
    <div ref={host} className="travel-map">
      {apiKey && !error ? (
        <>
          <div className="google-map" ref={container} />
          {!ready && (
            <div className="map-loading">
              <LoaderCircle className="spinning" size={21} />
              Google Maps 연결 중
            </div>
          )}
        </>
      ) : (
        <svg
          className="sample-map"
          viewBox={`${500 - width / 2 + pan.x} ${baseHeight / 2 - height / 2 + pan.y} ${width} ${height}`}
          role="img"
          aria-label={`${region} 장소의 상대 위치 미리보기. 실제 지도와 도로 경로가 아닙니다.`}
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-marker]")) return;
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const factor = e.currentTarget.clientWidth / width;
            setPan({
              x: drag.current.px - (e.clientX - drag.current.x) / factor,
              y: drag.current.py - (e.clientY - drag.current.y) / factor,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <defs>
            <pattern
              id="map-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#cbd6c1"
                strokeWidth=".6"
              />
              <circle cx="0" cy="0" r="1.3" fill="#b9c9ab" />
            </pattern>
            <filter
              id="pin-shadow"
              x="-100%"
              y="-100%"
              width="300%"
              height="300%"
            >
              <feDropShadow
                dx="0"
                dy="3"
                stdDeviation="4"
                floodColor="#314f3a"
                floodOpacity=".16"
              />
            </filter>
          </defs>
          <rect
            x="-5000"
            y="-5000"
            width="15000"
            height="15000"
            fill={terrain ? "#e1e9d5" : "#eaf0e1"}
          />
          <rect
            x="-5000"
            y="-5000"
            width="15000"
            height="15000"
            fill="url(#map-grid)"
          />
          <circle
            cx="500"
            cy={baseHeight / 2}
            r="210"
            fill="none"
            stroke="#d3ddc7"
          />
          <circle
            cx="500"
            cy={baseHeight / 2}
            r="330"
            fill="none"
            stroke="#dce4d3"
          />
          {/* 그리는 순서: 이름표 → 핀 → 띄운 이름표. 핀 번호가 이름표에 가려지지 않는다. */}
          <g className="map-label-layer">{placedLabels.map(renderLabel)}</g>
          <g className="map-pin-layer">
            {pinGroups.map((group) => {
              const multiple = group.items.length > 1;
              const names = [...new Set(group.items.map((p) => p.name))].join(", ");
              return (
                <g
                  key={group.key}
                  data-marker="true"
                  role="button"
                  tabIndex={0}
                  aria-label={`${group.numbers.join("·")}. ${names}`}
                  aria-pressed={group.active}
                  className="map-pin"
                  transform={`translate(${group.svgX} ${group.svgY}) scale(${pinScale})`}
                  onClick={() => selectGroup(group)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectGroup(group);
                    }
                  }}
                  onPointerEnter={peek(group.key)}
                  onPointerLeave={unpeek(group.key)}
                  onFocus={peek(group.key)}
                  onBlur={unpeek(group.key)}
                >
                  {group.active && <circle r="30" fill="#285748" opacity=".1" />}
                  {multiple ? (
                    <rect
                      className="pin-body"
                      x={-group.halfWidth}
                      y={-group.radius}
                      width={group.halfWidth * 2}
                      height={group.radius * 2}
                      rx={group.radius}
                      fill={group.active ? "#285748" : "#fffefa"}
                      stroke={group.active ? "#fff" : "#5b7c58"}
                      strokeWidth="2.5"
                      filter="url(#pin-shadow)"
                    />
                  ) : (
                    <circle
                      className="pin-body"
                      r={group.radius}
                      fill={group.active ? "#285748" : "#fffefa"}
                      stroke={group.active ? "#fff" : "#5b7c58"}
                      strokeWidth="2.5"
                      filter="url(#pin-shadow)"
                    />
                  )}
                  <text
                    textAnchor="middle"
                    y="5"
                    fill={group.active ? "white" : "#285748"}
                    fontSize="14"
                    style={{ fontSize: 14 }}
                    fontWeight="700"
                  >
                    {group.text}
                  </text>
                </g>
              );
            })}
          </g>
          <g className="map-floating-labels" pointerEvents="none">
            {floatingLabels.map(renderLabel)}
          </g>
        </svg>
      )}
      {currentFailure?.kind && !keyAlertClosed && (
        <div className="maps-key-alert" role="alert">
          <KeyRound size={19} />
          <div>
            <strong>
              {keySource === "account" ? "내" : "공용"} 지도 키
              {currentFailure.kind === "quota" ? "의 오늘 사용량을 모두 썼어요" : "로 지도를 불러오지 못했어요"}
            </strong>
            <p>
              {keySource === "account"
                ? currentFailure.kind === "quota"
                  ? "사용량은 다음 날 다시 채워져요. 그동안은 위치 미리보기로 보여드려요. 할당량과 키는 지도 설정에서 확인하세요."
                  : "키가 맞는지, 웹사이트 제한에 이 주소가 들어 있는지, Maps JavaScript API가 켜져 있는지 지도 설정에서 확인해 주세요."
                : currentFailure.kind === "quota"
                  ? "내 Google Maps API 키를 등록하면 바로 Google 지도와 길찾기를 볼 수 있어요. 지금은 위치 미리보기로 보여드려요."
                  : "오늘 사용량을 다 썼거나 공용 키에 문제가 있을 수 있어요. 내 Google Maps API 키를 등록하면 바로 Google 지도를 볼 수 있어요."}
            </p>
            <div className="maps-key-alert-actions">
              <button type="button" className="primary-button" onClick={onSettings}>
                {keySource === "account" ? "지도 설정 열기" : "내 키 등록하기"}
              </button>
              <a href="#guide-maps-key">키 만드는 방법</a>
            </div>
          </div>
          <button type="button" className="icon-button" aria-label="키 안내 닫기" onClick={() => setKeyAlertClosed(true)}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="map-location">
        <span className="location-dot" />
        {apiKey && !error ? "Google Maps" : "위치 미리보기"}
        <span className="location-divider" />
        {region}
      </div>
      {!located.length && (
        <div className="no-coordinates">
          <MapPin size={32} />
          <strong>표시할 좌표가 아직 없어요</strong>
          <p>
            일정은 오른쪽 목록에 저장되어 있어요.
            <br />
            장소의 주소로 Google Maps에서 확인할 수 있습니다.
          </p>
        </div>
      )}
      {missing > 0 && located.length > 0 && (
        <div className="coordinate-notice">
          좌표 없는 장소 {missing}곳은 일정 목록에서 확인하세요.
        </div>
      )}
      <div className="map-tools">
        <button
          className="icon-button"
          aria-label="모든 장소 보기"
          title="모든 장소 보기"
          onClick={fit}
        >
          <LocateFixed size={19} />
        </button>
        <div className="zoom-group">
          <button
            className="icon-button"
            aria-label="지도 확대"
            onClick={() => {
              setZoom((z) => Math.min(z + 0.25, 3));
              if (map.current)
                map.current.setZoom((map.current.getZoom() || 12) + 1);
            }}
          >
            <Plus size={20} />
          </button>
          <span />
          <button
            className="icon-button"
            aria-label="지도 축소"
            onClick={() => {
              setZoom((z) => Math.max(z - 0.25, 0.65));
              if (map.current)
                map.current.setZoom((map.current.getZoom() || 12) - 1);
            }}
          >
            <Minus size={20} />
          </button>
        </div>
        <button
          className="icon-button"
          aria-label="지도 스타일 전환"
          onClick={() => setTerrain((v) => !v)}
        >
          <Layers size={19} />
        </button>
      </div>
      {selected && (
        <div className="map-place-preview">
          <div className="preview-icon">
            <Mountain size={23} />
          </div>
          <div>
            <span>
              {hasCoordinates(selected)
                ? "지금 살펴보는 장소"
                : "좌표 미등록 · 주소로 확인 가능"}
            </span>
            <strong>{selected.name}</strong>
          </div>
          {onShowList && <button className="preview-open-list" onClick={onShowList}>일정 보기</button>}
          <a
            aria-label="선택한 장소를 Google Maps에서 열기"
            href={mapsUrl(selected)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
          </a>
        </div>
      )}
      <div className="map-bottom">
        <button className="map-mode" onClick={onSettings}>
          <span className="status-dot" />
          {apiKey && !error ? "Google Maps 연결" : "위치 미리보기"}
          <span className="mode-link">
            지도 안내
            <Navigation size={11} />
          </span>
        </button>
        <span className="map-disclaimer">
          {error ||
            (!apiKey
              ? "실제 지도·도로 경로가 아닌 상대 위치입니다"
              : "© Google Maps · 자동차 파랑 / 도보 갈색")}
        </span>
      </div>
    </div>
  );
}
