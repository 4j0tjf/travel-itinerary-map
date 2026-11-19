import { ExternalLink } from "lucide-react";

// 가이드 페이지와 ‘지도 설정’ 창이 같은 순서를 쓴다.
export function MapKeySteps() {
  const site = `${window.location.origin}${import.meta.env.BASE_URL}*`;
  return (
    <ol className="setup-steps map-key-steps">
      <li>
        <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud 콘솔</a>에서
        프로젝트를 만듭니다. 결제 계정 없이 시작하려면{" "}
        <a href="https://mapsplatform.google.com/maps-demo-key/" target="_blank" rel="noreferrer">Maps 데모 키</a>를
        써도 됩니다. 데모 키는 API마다 하루 한도가 있고, 넘으면 다음 날까지 멈춥니다.
      </li>
      <li>
        <strong>API 및 서비스 → 라이브러리</strong>에서 <strong>Maps JavaScript API</strong>와{" "}
        <strong>Routes API</strong>를 사용 설정합니다.
      </li>
      <li>
        <strong>사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키</strong>로 키를 만듭니다.
      </li>
      <li>
        키 제한에서 애플리케이션 제한사항을 ‘웹사이트’로 두고 아래 주소를 추가합니다. API 제한사항은
        Maps JavaScript API와 Routes API만 고릅니다.
        <code className="code-block">{site}</code>
      </li>
      <li>
        요금이 나오지 않게 하려면 각 API의 <strong>할당량</strong>에서 하루 한도를 낮춰 두세요. 한도를 넘으면
        과금 대신 지도가 멈춥니다.
      </li>
      <li>
        로그인한 뒤 여행 화면의 <strong>지도 설정</strong>에 키를 붙여 넣고 저장합니다. 키는 내 계정에만
        저장되고 다른 사용자에게 보이지 않습니다.
      </li>
    </ol>
  );
}

export default function MapKeyGuide() {
  return (
    <section className="map-key-guide" id="maps-key-guide" aria-labelledby="map-key-guide-title">
      <div className="guide-section-heading">
        <span className="page-eyebrow">GOOGLE MAPS API KEY</span>
        <h2 id="map-key-guide-title">내 Google 지도 키 만들기</h2>
        <p>
          Google 지도와 길찾기는 계정마다 등록한 브라우저용 API 키로 불러옵니다. 공용 키는 하루 사용량이
          정해져 있어 다 쓰면 위치 미리보기로 바뀌어요. 내 키를 등록하면 사용량이 내 Google Cloud 프로젝트에
          따로 잡힙니다.
        </p>
      </div>
      <MapKeySteps />
      <p className="map-key-guide-links">
        <a href="https://developers.google.com/maps/documentation/javascript/get-api-key" target="_blank" rel="noreferrer">
          Google 공식 안내: API 키 사용하기 <ExternalLink size={14} />
        </a>
      </p>
    </section>
  );
}
