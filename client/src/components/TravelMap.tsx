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
} from "lucide-react";
import type { Day, LocatedPlace } from "../types";
import { hasCoordinates, mapsUrl } from "../types";
let mapsPromise: Promise<void> | undefined;
function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve();
  if (!mapsPromise)
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ko&loading=async&callback=__travelMapsReady`;
      const timeout = window.setTimeout(
        () => reject(new Error("Google Maps 연결 시간이 초과되었습니다.")),
        20000,
      );
      (window as unknown as Record<string, unknown>).__travelMapsReady = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Google Maps 연결을 확인해 주세요."));
      };
      document.head.appendChild(script);
    });
  return mapsPromise;
}
const apiKey = (import.meta as unknown as { env: Record<string, string> }).env
  .VITE_GOOGLE_MAPS_API_KEY;
export default function TravelMap({
  day,
  region,
  selectedId,
  focusVersion,
  onSelect,
  onSettings,
  routeVisible,
}: {
  day: Day;
  region: string;
  selectedId: string;
  focusVersion: number;
  onSelect: (id: string) => void;
  onSettings: () => void;
  routeVisible: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<Record<string, google.maps.Marker>>({});
  const info = useRef<google.maps.InfoWindow | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [aspect, setAspect] = useState(1.3);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [terrain, setTerrain] = useState(false);
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
    if (!apiKey) return;
    let active = true;
    const authFailure = () => {
      if (active)
        setError(
          "Google Maps 키 인증에 실패했습니다. 키와 웹사이트 제한을 확인해 주세요.",
        );
    };
    (window as unknown as Record<string, unknown>).gm_authFailure = authFailure;
    loadMaps(apiKey)
      .then(() => {
        if (!active || !container.current) return;
        map.current = new google.maps.Map(container.current, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
        });
        info.current = new google.maps.InfoWindow({ disableAutoPan: true });
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      Object.values(markers.current).forEach((marker) => marker.setMap(null));
      info.current?.close();
    };
  }, []);
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
  }, [selected, ready, day, focusVersion]);
  useEffect(() => {
    if (map.current) map.current.setMapTypeId(terrain ? "terrain" : "roadmap");
  }, [terrain]);
  const width = 1000 / zoom,
    height = baseHeight / zoom;
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
          {routeVisible &&
            day.places.slice(0, -1).map((p, i) => {
              const next = day.places[i + 1];
              if (!hasCoordinates(p) || !hasCoordinates(next)) return null;
              const a = project(p),
                b = project(next);
              return (
                <line
                  key={p.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#769579"
                  strokeWidth="3"
                  strokeDasharray="5 7"
                  opacity=".8"
                />
              );
            })}
          {day.places.map((p, i) => {
            if (!hasCoordinates(p)) return null;
            const point = project(p),
              active = p.id === selectedId;
            const pinScale = width / viewportWidth;
            const labelText = p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name;
            const labelWidth = Math.min(labelText.length * 14 + 20, 260);
            const labelOnLeft = (point.x - (500 - width / 2 + pan.x)) / width > 0.58;
            const labelY = viewportWidth < 600 ? -62 : -17;
            return (
              <g
                key={p.id}
                data-marker="true"
                role="button"
                tabIndex={0}
                aria-label={`${i + 1}. ${p.name}`}
                aria-pressed={active}
                className="map-pin"
                transform={`translate(${point.x} ${point.y}) scale(${pinScale})`}
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(p.id);
                  }
                }}
              >
                {active && <circle r="30" fill="#285748" opacity=".1" />}
                <circle
                  r={active ? 20 : 17}
                  fill={active ? "#285748" : "#fffefa"}
                  stroke={active ? "#fff" : "#5b7c58"}
                  strokeWidth="2.5"
                  filter="url(#pin-shadow)"
                />
                <text
                  textAnchor="middle"
                  y="5"
                  fill={active ? "white" : "#285748"}
                  fontSize="14"
                  style={{ fontSize: 14 }}
                  fontWeight="700"
                >
                  {i + 1}
                </text>
                {(viewportWidth >= 600 || active) && <>
                <rect
                  x={labelOnLeft ? -labelWidth - 26 : 26}
                  y={labelY}
                  width={labelWidth}
                  height="34"
                  rx="6"
                  fill="#fffefa"
                  filter="url(#pin-shadow)"
                />
                <text x={labelOnLeft ? -labelWidth - 16 : 36} y={labelY + 22} fill="#344a35" style={{ fontSize: 14 }}>
                  {labelText}
                </text>
                </>}
              </g>
            );
          })}
        </svg>
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
              : "© Google Maps · 도로 경로 미계산")}
        </span>
      </div>
    </div>
  );
}
