import { useEffect, useState } from "react";
import { Check, Clipboard, RefreshCw } from "lucide-react";
import { followupPrompt } from "../services/workbook-format";

export default function FollowupPrompt() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(followupPrompt());
      setCopied(true);
      setError("");
    } catch {
      setError("복사하지 못했어요. 아래 문구 보기를 열어 직접 복사해 주세요.");
    }
  }
  return (
    <aside className="followup-prompt-card" aria-labelledby="followup-title">
      <div className="followup-prompt-heading">
        <div>
          <h3 id="followup-title"><RefreshCw size={19} /> 계속 수정하거나 내용을 보충할 때</h3>
          <p>후속 문구에 수정 내용을 적고 최신 통합본을 함께 첨부하세요. 좌표가 비어 있다면 ‘기존 일정과 시각을 유지하고 위도·경도 누락만 검증해 보완’이라고 요청할 수 있어요. 세 시트의 이름·컬럼·서식과 좌표 검증 규칙도 함께 포함합니다.</p>
        </div>
        <button type="button" className="copy-button" onClick={copy}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
          {copied ? "후속 문구 복사했어요" : "후속 수정용 문구 복사"}
        </button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <details>
        <summary>후속 수정용 문구 보기</summary>
        <textarea readOnly aria-label="후속 수정용 고정 양식 프롬프트" value={followupPrompt()} onFocus={event => event.currentTarget.select()} />
      </details>
    </aside>
  );
}
