import { evidenceRules, recommendationRubrics, workbookSheets } from "../services/recommendations";

export default function RecommendationGuide() {
  return (
    <section className="recommendation-guide" aria-labelledby="recommendation-guide-title">
      <div className="guide-section-heading">
        <span className="page-eyebrow">WORKBOOK & RECOMMENDATIONS</span>
        <h2 id="recommendation-guide-title">세 개의 시트, 한눈에 읽는 여행 계획</h2>
        <p>일정은 지도에, 장소와 호텔 후보는 비교표에 담습니다. 점수의 근거와 채점 기준은 이 가이드에서 확인하세요.</p>
      </div>
      <div className="workbook-sheet-cards">
        {workbookSheets.map((sheet, index) => <article key={sheet.name}><span className="sheet-number">0{index + 1}</span><h3>{sheet.name}</h3><p>{sheet.description}</p></article>)}
      </div>
      <div className="workbook-readability-note">
        <strong>생성 파일도 읽기 편하게</strong>
        <p>본문 12pt · 헤더 13pt · 자동 줄바꿈 · 열 너비와 주요 열 고정 · 날짜별 구분을 프롬프트에 포함했어요. 후속 수정에서도 같은 세 시트의 이름·컬럼·서식을 유지하고 데이터만 갱신하도록 안내합니다.</p>
        <p>장소명·주소에는 실제 클릭 가능한 구글맵 링크를 넣도록 요청합니다. 방문 희망지의 동선을 설계하고 <strong>시작·종료와 앞뒤 여유 시간</strong>을 모두 채워요. 확정 예약은 유지하고, 큰 빈 시간에 넣은 장소는 메모에 <strong>[AI 추천]</strong>으로 표시합니다.</p>
        <p><strong>지도에 가져오는 것은 ‘여행 일정’ 시트</strong>이며 추천 두 시트는 Excel·Google Sheets에서 참고하세요. 기본적으로 연속 90분 이상 비는 구간을 검토하되, 사용자가 원한 자유시간과 휴식은 유지합니다. 조회하지 못한 이동·체류시간은 계획용 추정으로 구분해요.</p>
        <p><strong>지도 표시에는 모든 방문 행의 위도·경도가 필요해요.</strong> 구글맵 링크만 넣어서는 좌표가 자동 생성되지 않습니다. 숨겨진 F·G열도 숫자로 채우고 누락 0건을 확인하도록 프롬프트에 명시했어요. 확인할 수 없는 위치는 추측하지 않고 정확한 장소 정보를 질문하도록 합니다.</p>
      </div>
      <div className="guide-section-heading scoring-heading">
        <h2>추천 점수와 채점 기준</h2>
        <p>점수는 여행 취향에 따른 비교 도구입니다. 숙박일·인원·필수 조건을 먼저 확인하고, 같은 역할의 후보끼리 비교하세요. 아래 기준은 프롬프트와 함께 관리됩니다.</p>
      </div>
      {recommendationRubrics.map((rubric) => (
        <details className="scoring-rubric" key={rubric.id}>
          <summary>{rubric.title}<span>100점 기준 · 항목별 배점과 근거 보기</span></summary>
          <p>{rubric.intro}</p>
          <div className="scoring-table-wrap"><table>
            <caption>{rubric.title} 기본 평가 기준</caption>
            <thead><tr><th scope="col">항목</th><th scope="col">배점</th><th scope="col">평가할 근거</th></tr></thead>
            <tbody>{rubric.items.map((item) => <tr key={item.name}><th scope="row">{item.name}</th><td>{item.weight}점</td><td>{item.rule}</td></tr>)}</tbody>
          </table></div>
        </details>
      ))}
      <div className="evidence-guide">
        <h3>미확인 정보와 점수 범위 읽는 법</h3>
        <ul>{evidenceRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        <p>세부 점수 근거·채점 기준·가정 정리용 시트는 생성하지 않습니다. 추천 시트에는 특징·장단점·확인할 조건과 원문 링크를 간결하게 남겨요.</p>
      </div>
    </section>
  );
}
