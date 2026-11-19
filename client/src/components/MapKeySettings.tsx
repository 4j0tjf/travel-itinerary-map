import { useState } from "react";
import type { FormEvent } from "react";
import { Check, Info, KeyRound, LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { ApiError } from "../services/api";
import { KEY_CHANGED_MESSAGE, mapsKeyNeedsReload } from "../services/google-maps";
import { resolveMapsKey, useMapsKey } from "../services/maps-key";

// 서버와 같은 규칙: Google API 키는 AIza로 시작하는 39자다.
const KEY_FORMAT = /^AIza[0-9A-Za-z_-]{35}$/;
const mask = (key: string) => `${key.slice(0, 4)}…${key.slice(-4)}`;
const failure = (error: unknown) =>
  error instanceof ApiError ? error.message : "서버 연결을 확인한 뒤 다시 시도해 주세요.";

export default function MapKeySettings() {
  const maps = useMapsKey();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const needsReload = Boolean(maps.key) && mapsKeyNeedsReload(maps.key);
  const site = `${window.location.origin}${import.meta.env.BASE_URL}*`;
  const status =
    maps.source === "account"
      ? { label: "내 키 사용 중", detail: mask(maps.key) }
      : maps.source === "shared"
        ? { label: "공용 키 사용 중", detail: "서버에 설정된 키" }
        : { label: "등록한 키 없음", detail: "위치 미리보기로 표시" };

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(done);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  function save(e: FormEvent) {
    e.preventDefault();
    const key = draft.trim();
    if (!KEY_FORMAT.test(key)) {
      setNotice("");
      setError("Google Maps API 키 형식이 아닙니다. AIza로 시작하는 39자 키를 붙여 넣어 주세요.");
      return;
    }
    void run(async () => {
      await maps.save(key);
      setDraft("");
    }, "내 지도 키를 저장했어요. 지도와 길찾기에 이 키를 씁니다.");
  }
  function remove() {
    const next = resolveMapsKey("").source === "shared" ? "공용 키로" : "위치 미리보기로";
    void run(() => maps.remove(), `내 지도 키를 지웠어요. 이제 ${next} 표시합니다.`);
  }

  return (
    <>
      <p>
        Google 지도는 계정마다 등록한 브라우저용 API 키로 불러옵니다. 지도 로드와 길찾기
        사용량은 등록한 키의 Google Cloud 프로젝트에 잡힙니다.
      </p>
      <div className="setup-status map-key-status" role="status">
        <KeyRound size={16} />
        <span>{status.label}</span>
        <span>{status.detail}</span>
      </div>
      {needsReload && (
        <div className="info-note map-key-reload">
          <RotateCw size={17} />
          <p>{KEY_CHANGED_MESSAGE}</p>
          <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
            새로고침
          </button>
        </div>
      )}
      <form className="app-form map-key-form" onSubmit={save} noValidate>
        <label htmlFor="maps-api-key">{maps.accountKey ? "새 키로 바꾸기" : "내 Google Maps API 키"}</label>
        <input
          id="maps-api-key"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="AIza로 시작하는 39자 키"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={80}
          disabled={busy}
        />
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {notice && <p className="map-key-notice">{notice}</p>}
        <button className="primary-button" type="submit" disabled={busy || !draft.trim()}>
          {busy ? <LoaderCircle className="spinning" size={16} /> : <Check size={16} />}
          키 저장
        </button>
        {maps.accountKey && (
          <button type="button" className="text-action danger-text map-key-remove" onClick={remove} disabled={busy}>
            <Trash2 size={14} />
            <span>내 키 삭제</span>
          </button>
        )}
      </form>
      <h3>키 만드는 방법</h3>
      <ol className="setup-steps">
        <li>
          Google Cloud 콘솔에서 <strong>Maps JavaScript API</strong>와 <strong>Routes API</strong>를
          사용 설정합니다.
        </li>
        <li>
          <strong>사용자 인증 정보 → API 키 만들기</strong>에서 애플리케이션 제한사항을 ‘웹사이트’로
          두고 아래 주소를 추가합니다.
          <code className="code-block">{site}</code>
        </li>
        <li>API 제한사항에서 Maps JavaScript API와 Routes API만 고릅니다.</li>
        <li>
          요금이 나오지 않게 하려면 각 API의 <strong>할당량</strong>에서 하루 한도를 낮춰 두세요. 한도를
          넘으면 과금 대신 지도가 멈춥니다.
        </li>
      </ol>
      <div className="info-note">
        <Info size={17} />
        <p>
          자동차·도보 이동은 Google 길찾기 경로로 표시합니다. 같은 이동수단의 연속 구간은 묶어
          조회하며 방문 순서를 유지합니다. 좌표가 없는 구간과 기타 이동수단은 임의로 연결하지
          않습니다. 키가 없으면 상대 위치만 표시합니다.
        </p>
      </div>
    </>
  );
}
