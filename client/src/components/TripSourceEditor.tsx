import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Download, ExternalLink, FileSpreadsheet, Link2, LoaderCircle, RefreshCw, Save, Upload } from "lucide-react";
import type { Itinerary } from "../types";
import { ApiError, downloadTripWorkbook, refreshTripSheet, replaceTripWorkbook, updateTripSheetLink } from "../services/api";
import Dialog from "./Dialog";

export default function TripSourceEditor({ trip, onClose, onUpdated }: {
  trip: Itinerary;
  onClose: () => void;
  onUpdated: (trip: Itinerary, message: string) => void;
}) {
  const [tab, setTab] = useState<"excel" | "sheet">(trip.source?.googleSheetUrl ? "sheet" : "excel");
  const [url, setUrl] = useState(trip.source?.googleSheetUrl || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"download" | "upload" | "link" | "refresh" | null>(null);
  const [error, setError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: "nearest" }); }, [error]);
  const savedUrl = trip.source?.googleSheetUrl || "";
  const unsavedLink = url.trim() !== savedUrl;
  function fail(error: unknown) {
    setError(error instanceof Error ? error.message : "일정을 수정하지 못했습니다. 다시 시도해 주세요.");
    setDetails(error instanceof ApiError ? error.details : []);
  }
  function begin(action: typeof busy) { setBusy(action); setError(""); setDetails([]); setNotice(""); }
  async function download() {
    begin("download");
    try {
      const { blob, filename } = await downloadTripWorkbook(trip.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl; anchor.download = filename;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { fail(error); }
    finally { setBusy(null); }
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    begin("upload");
    try {
      const { trip: updated } = await replaceTripWorkbook(trip.id, file, trip.revision ?? 0);
      onUpdated(updated, "수정한 Excel로 기존 여행 일정을 갱신했어요.");
      onClose();
    } catch (error) { fail(error); }
    finally { setBusy(null); }
  }
  async function saveLink(event: FormEvent) {
    event.preventDefault();
    begin("link");
    try {
      const { trip: updated } = await updateTripSheetLink(trip.id, url.trim(), trip.revision ?? 0);
      setUrl(updated.source?.googleSheetUrl || "");
      onUpdated(updated, "구글 시트 링크를 저장했어요.");
      setNotice("링크를 저장했어요. 아래 최신화 버튼을 누르면 시트의 현재 내용이 일정에 반영됩니다.");
    } catch (error) { fail(error); }
    finally { setBusy(null); }
  }
  async function refresh() {
    begin("refresh");
    try {
      const { trip: updated } = await refreshTripSheet(trip.id, trip.revision ?? 0);
      onUpdated(updated, "등록된 구글 시트의 현재 내용으로 여행을 최신화했어요.");
      onClose();
    } catch (error) { fail(error); }
    finally { setBusy(null); }
  }
  return <Dialog title="여행 일정 수정" onClose={() => { if (!busy) onClose(); }}>
    <div className="trip-source-editor">
    <p><strong>{trip.title}</strong>의 날짜·장소를 수정합니다. 여행 이름과 기존 여행 탭은 유지하고, 가져오기를 완료한 내용으로 일정을 교체해요.</p>
    <div className="import-methods" role="tablist" aria-label="일정 수정 방식">
      <button type="button" role="tab" aria-selected={tab === "excel"} aria-controls="edit-excel-panel" id="edit-excel-tab" disabled={Boolean(busy)}
        onClick={() => { setTab("excel"); setError(""); setDetails([]); }}><FileSpreadsheet size={16} /> Excel 수정</button>
      <button type="button" role="tab" aria-selected={tab === "sheet"} aria-controls="edit-sheet-panel" id="edit-sheet-tab" disabled={Boolean(busy)}
        onClick={() => { setTab("sheet"); setError(""); setDetails([]); }}><Link2 size={16} /> 구글 시트</button>
    </div>
    {tab === "excel" ? <div id="edit-excel-panel" role="tabpanel" aria-labelledby="edit-excel-tab">
      <div className="source-help">
        <strong>1. 내려받기 → 2. Excel에서 수정 → 3. 수정본 적용</strong>
        {trip.workbookAvailable ? <p>마지막으로 가져온 원본 파일을 내려받습니다. 원본에 있는 추천 시트와 서식도 포함돼요.</p>
          : <p>이 여행은 원본 파일이 보관되지 않아 현재 일정으로 Excel을 만듭니다. 이전 파일의 추천 시트·서식은 복구되지 않습니다.</p>}
        {trip.source?.filename && <span className="source-filename">보관 파일: {trip.source.filename}</span>}
        <button type="button" className="secondary-button source-download" onClick={download} disabled={Boolean(busy)}>
          {busy === "download" ? <LoaderCircle className="spinning" size={16} /> : <Download size={16} />}
          {trip.workbookAvailable ? "원본 Excel 내려받기" : "현재 일정 Excel 내려받기"}
        </button>
      </div>
      <form className="app-form" onSubmit={upload}>
        <label htmlFor="replacement-workbook">수정한 Excel 파일</label>
        <input id="replacement-workbook" className="source-file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required disabled={Boolean(busy)}
          onChange={event => { setFile(event.target.files?.[0] || null); setError(""); setDetails([]); }} />
        <p className="source-help-text">.xlsx · 최대 5MB. 여행 일정 시트를 검사한 뒤 전체 날짜·장소를 바꿉니다. 오류가 있으면 기존 일정은 그대로 유지돼요.</p>
        <button className="primary-button" disabled={Boolean(busy) || !file}>{busy === "upload" ? <LoaderCircle className="spinning" size={16} /> : <Upload size={16} />} 수정본으로 일정 갱신</button>
      </form>
    </div> : <div id="edit-sheet-panel" role="tabpanel" aria-labelledby="edit-sheet-tab">
      <form className="app-form" onSubmit={saveLink}>
        <label htmlFor="saved-sheet-link">등록할 구글 시트 링크</label>
        <input id="saved-sheet-link" type="url" value={url} maxLength={2048} required disabled={Boolean(busy)}
          onChange={event => { setUrl(event.target.value); setError(""); setDetails([]); setNotice(""); }} placeholder="https://docs.google.com/spreadsheets/d/…" />
        <p className="source-help-text">링크 저장만으로 일정이 바뀌지는 않습니다. 공유는 ‘링크가 있는 모든 사용자 · 뷰어’이며 다운로드가 허용돼야 해요.</p>
        <button className="secondary-button" disabled={Boolean(busy) || !url.trim() || !unsavedLink}>{busy === "link" ? <LoaderCircle className="spinning" size={16} /> : <Save size={16} />} 링크 저장</button>
      </form>
      <div className="source-refresh">
        <strong>등록된 시트의 현재 내용으로 최신화</strong>
        <p>날짜·방문지가 시트 내용으로 교체됩니다. 수동으로 수정한 Excel 일정도 덮어쓰며, 실패하면 현재 일정과 보관 파일을 유지해요.</p>
        {savedUrl ? <a href={savedUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> 등록된 시트 열기</a> : <p>이전 여행은 링크가 저장되지 않았을 수 있어요. 위에서 링크를 한 번 등록해 주세요.</p>}
        {unsavedLink && savedUrl && <p>수정한 링크를 먼저 저장해 주세요.</p>}
        <button type="button" className="primary-button" disabled={Boolean(busy) || !savedUrl || unsavedLink} onClick={refresh}>
          {busy === "refresh" ? <LoaderCircle className="spinning" size={16} /> : <RefreshCw size={16} />} 등록된 시트로 최신화
        </button>
      </div>
    </div>}
    {trip.source?.importedAt && <p className="source-last-import">마지막 내용 반영: {new Date(trip.source.importedAt).toLocaleString("ko-KR")}</p>}
    {notice && <p className="source-notice" role="status">{notice}</p>}
    {error && <div ref={errorRef} className="form-error" role="alert">{error}{details.length > 0 && <ul>{details.map((line, index) => <li key={index}>{line}</li>)}</ul>}</div>}
    </div>
  </Dialog>;
}
