let mapsPromise: Promise<void> | undefined;
let loadedKey: string | undefined;
export const KEY_CHANGED_MESSAGE =
  "지도 키가 바뀌었습니다. 페이지를 새로고침하면 새 키로 지도를 불러옵니다.";
// 지도를 못 쓰게 된 이유. quota: 오늘 사용량을 다 씀, unavailable: 키 인증·설정 문제(사용량일 수도 있음).
export type MapsFailure = "quota" | "unavailable";
let failure: MapsFailure | undefined;
const failureListeners = new Set<(kind: MapsFailure) => void>();

// 지도 실패는 페이지에 한 번만 알려진다. 지도를 다시 붙이는 화면도 알 수 있게 기억해 둔다.
export function reportMapsFailure(kind: MapsFailure) {
  if (failure === "quota") return; // 사용량 초과가 더 구체적인 이유라 덮어쓰지 않는다.
  failure = kind;
  failureListeners.forEach((listener) => listener(kind));
}
export function onMapsFailure(listener: (kind: MapsFailure) => void) {
  if (failure) listener(failure);
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

// Google은 사용량 초과 때 gm_authFailure를 부르지 않고 콘솔에 OverQuotaMapError 같은 오류만 남긴다.
// 그래서 세 가지를 함께 본다: gm_authFailure, 콘솔의 "…MapError", 지도 위 오류 화면(watchMapErrors).
export const mapsErrorKind = (text: string): MapsFailure | undefined =>
  /OverQuota|OverDailyLimit/i.test(text) ? "quota" : /\b[A-Za-z]+MapError\b/.test(text) ? "unavailable" : undefined;
function installFailureWatchers() {
  (window as unknown as Record<string, unknown>).gm_authFailure = () => reportMapsFailure("unavailable");
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const kind = mapsErrorKind(args.map(String).join(" "));
    if (kind) reportMapsFailure(kind);
    original(...args);
  };
}

// Google 지도 스크립트는 페이지마다 키 하나로만 불러올 수 있다. 다른 키는 새로고침해야 적용된다.
export const mapsKeyNeedsReload = (key: string) => loadedKey !== undefined && loadedKey !== key;
export function loadMaps(key: string) {
  if (mapsKeyNeedsReload(key)) return Promise.reject(new Error(KEY_CHANGED_MESSAGE));
  if (window.google?.maps) return Promise.resolve();
  if (!mapsPromise) {
    loadedKey = key;
    mapsPromise = new Promise((resolve, reject) => {
      installFailureWatchers();
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
  }
  return mapsPromise;
}
// 서버에 빌드할 때 넣은 공용 키. 계정 키가 없을 때만 쓴다. 비워 두면 계정 키가 없는 사용자는 위치 미리보기만 본다.
export const sharedApiKey: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/* ---------- 페이지당 지도 하나 ---------- */
// Google은 google.maps.Map을 만들 때마다 지도 로드 1회로 센다. 지도는 페이지에서 한 번만 만들고,
// 여행 탭 전환·가이드 왕복·시트 최신화로 화면이 다시 그려지면 그 지도의 div만 옮겨 붙인다.

export interface SharedMap {
  map: google.maps.Map;
  info: google.maps.InfoWindow;
  element: HTMLDivElement;
}
const INITIAL_VIEW = { center: { lat: 0, lng: 0 }, zoom: 2, mapTypeId: "roadmap" };
let shared: SharedMap | undefined;

// loadMaps가 끝난 뒤에 부른다. 처음에만 지도를 만들고, 그다음부터는 만들어 둔 지도를 옮겨 붙인다.
export function attachSharedMap(host: HTMLElement): SharedMap {
  if (shared) {
    host.appendChild(shared.element);
    return shared;
  }
  const element = document.createElement("div");
  element.style.width = "100%";
  element.style.height = "100%";
  // 크기를 알 수 있도록 화면에 먼저 붙인 다음 지도를 만든다.
  host.appendChild(element);
  shared = {
    element,
    map: new google.maps.Map(element, {
      ...INITIAL_VIEW,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
    }),
    info: new google.maps.InfoWindow({ disableAutoPan: true }),
  };
  return shared;
}

// Google은 지도를 못 불러오면 지도 자리에 자체 오류 화면(.gm-err-container)이나 안내 창을 띄운다.
export function watchMapErrors(element: HTMLElement) {
  const check = () => {
    if (element.querySelector(".gm-err-container, .gm-err-message")) reportMapsFailure("unavailable");
  };
  const observer = new MutationObserver(check);
  observer.observe(element, { childList: true, subtree: true });
  check();
  return () => observer.disconnect();
}

// 화면이 사라질 때 지도를 떼어 두고, 다음 화면에 이전 여행 위치·지형 설정이 남지 않게 초기 상태로 돌린다.
// 마커와 경로선은 그린 쪽에서 지운다.
export function detachSharedMap(host: HTMLElement) {
  if (!shared || shared.element.parentElement !== host) return;
  shared.info.close();
  shared.map.setOptions(INITIAL_VIEW);
  host.removeChild(shared.element);
}
