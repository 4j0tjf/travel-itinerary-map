import { HttpError } from "../utils/errors.js";

const MAX_BYTES = 5 * 1024 * 1024;
const SHARING_HELP = "구글 시트를 읽을 수 없습니다. 공유를 ‘링크가 있는 모든 사용자 · 뷰어’로 설정하고 다운로드를 허용했는지 확인해 주세요.";

function exportUrl(input) {
  let url;
  try {
    if (typeof input !== "string" || input.length > 2048) throw new Error();
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, "구글 스프레드시트의 공유 링크를 입력해 주세요.");
  }
  const match = url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/);
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.port || url.username || url.password || !match) {
    throw new HttpError(400, "공유 버튼에서 복사한 https://docs.google.com/spreadsheets/d/… 링크를 사용해 주세요.");
  }
  const target = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`);
  const resourceKey = url.searchParams.get("resourcekey");
  if (resourceKey) {
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(resourceKey)) throw new HttpError(400, "올바른 구글 시트 공유 링크인지 확인해 주세요.");
    target.searchParams.set("resourcekey", resourceKey);
  }
  return target;
}

function allowedDownload(url) {
  return url.protocol === "https:" && !url.port && !url.username && !url.password &&
    (url.hostname === "docs.google.com" || /^[a-z0-9-]+-sheets\.googleusercontent\.com$/.test(url.hostname));
}

export function normalizeGoogleSheetLink(input) {
  const url = exportUrl(input);
  url.pathname = url.pathname.replace(/\/export$/, "/edit");
  url.searchParams.delete("format");
  return url.href;
}

function filename(header = "") {
  let name = "구글 스프레드시트.xlsx";
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = header.match(/filename="([^"]+)"|filename=([^;]+)/i);
  try { name = encoded ? decodeURIComponent(encoded[1]) : plain?.[1] || plain?.[2] || name; } catch { }
  name = name.replace(/[\\/\x00-\x1f\x7f]/g, "").trim().slice(0, 180);
  return /\.xlsx$/i.test(name) ? name : `${name || "구글 스프레드시트"}.xlsx`;
}

export async function fetchGoogleSheet(input, { fetchImpl = fetch, maxBytes = MAX_BYTES, timeoutMs = 15000 } = {}) {
  let target = exportUrl(input);
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let redirects = 0; redirects <= 4; redirects++) {
      if (!allowedDownload(target)) throw new HttpError(400, SHARING_HELP);
      const response = await fetchImpl(target.href, {
        redirect: "manual", credentials: "omit", signal,
        headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 4) throw new HttpError(400, SHARING_HELP);
        try { target = new URL(location, target); } catch { throw new HttpError(400, SHARING_HELP); }
        continue;
      }
      if (response.status === 429) {
        await response.body?.cancel();
        throw new HttpError(429, "Google에서 요청을 제한했습니다. 잠시 후 다시 가져와 주세요.");
      }
      if (!response.ok || /text\/html/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel();
        throw new HttpError(400, SHARING_HELP);
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new HttpError(400, "구글 시트는 Excel로 내보낸 파일 크기가 5MB 이하여야 합니다.");
      }
      if (!response.body) throw new HttpError(400, SHARING_HELP);
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new HttpError(400, "구글 시트는 Excel로 내보낸 파일 크기가 5MB 이하여야 합니다.");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const buffer = Buffer.concat(chunks, bytes);
      if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new HttpError(400, SHARING_HELP);
      return { buffer, filename: filename(response.headers.get("content-disposition") || "") };
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (signal.aborted || error.name === "TimeoutError" || error.name === "AbortError") {
      throw new HttpError(408, "구글 시트를 가져오는 데 시간이 오래 걸립니다. 잠시 후 다시 시도해 주세요.");
    }
    throw new HttpError(400, "Google에 연결하지 못했습니다. 링크와 공유 설정을 확인한 뒤 다시 시도해 주세요.");
  }
}
