let mapsPromise: Promise<void> | undefined;
export function loadMaps(key: string) {
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
export const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
