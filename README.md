# 여정 · 여행 일정 지도

React + TypeScript + Vite, Node.js + Express로 만든 개인 PC 실행용 여행 지도입니다. **현재 구현 범위는 1단계: 프로젝트 구성과 지도 화면**입니다. 외부 클라우드 서비스나 로그인 없이 실행합니다.

## 실행 방법

Node.js 22 이상과 npm이 필요합니다.

```bash
cd travel-itinerary-map
npm ci
cp .env.example .env
npm run dev
```

Windows PowerShell에서는 `cp` 대신 `Copy-Item .env.example .env`도 사용할 수 있습니다.

- 웹 화면: http://localhost:4173
- Express API: http://localhost:6001/api/health
- 개발 화면의 `/api` 요청은 Vite가 Express로 전달합니다.
- 키 없이 실행해도 후지산 3일 샘플 일정과 위치 기반 SVG 샘플 지도를 사용할 수 있습니다.
- Google Maps 키를 설정하면 실제 Google Maps로 전환됩니다. 환경변수 수정 후 개발 서버를 재시작하세요.
- 개발 서버를 종료하려면 `Ctrl+C`를 누르세요.

### 개인 서버 PC에서 실행

```bash
npm ci
cp .env.example .env
# .env에 Google Maps 브라우저 키를 입력한 다음 빌드
npm run build
npm start
```

로컬 확인 주소는 http://localhost:6001 이며, 외부 접속 주소는 **https://19991115.xyz**입니다. Express가 빌드된 웹 화면과 API를 함께 제공합니다. 기존 도메인 프록시가 앱으로 전달할 대상은 `http://127.0.0.1:6001`입니다. 로그인 없이 제공되는 일정은 도메인 접속자에게도 표시됩니다.

브라우저용 `VITE_` 변수는 빌드 시 포함됩니다. 키를 변경하면 다시 빌드하세요. 실행 포트는 `.env`의 `PORT`로 바꿀 수 있으며 개발 프록시도 같은 값을 읽습니다. 개발 화면 포트 기본값은 4173입니다.

## Windows 서버 PC · NSSM 자동 실행

프로젝트 경로는 `C:\Development\travel-itinerary-map`, 내부 포트는 **6001**, 운영 주소는 **https://19991115.xyz** 기준입니다. 기존 NSSM을 재사용하고 이 앱의 `TravelItineraryMap` 서비스만 등록합니다. 다른 사이트 서비스는 변경하지 않습니다. 아래 작업은 서버 PC에서 수행하세요. 이 개발 환경에서는 Windows 서비스 등록이나 실제 재부팅 검증을 수행하지 않았습니다.

### 1. 설정과 빌드

수정된 프로젝트 파일을 서버 PC에 반영한 뒤 PowerShell에서 실행합니다. 기존 `.env`와 `data/`는 유지하세요.

```powershell
cd C:\Development\travel-itinerary-map
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

기존 API 키는 유지하면서 `PORT=6001`인지 확인하세요. 파일 전체를 샘플로 덮어쓰지 마세요.

```powershell
npm run build
```

`npm start`로 수동 실행 중인 이 앱이 있으면 그 창에서 `Ctrl+C`로 종료한 뒤 서비스를 등록합니다. 기존 다른 사이트는 종료하지 않습니다.

### 2. NSSM 등록

**관리자 권한 Windows PowerShell**에서 실행합니다. NSSM이 PATH에 있다면:

```powershell
cd C:\Development\travel-itinerary-map
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\install-service.ps1
```

NSSM이 PATH에 없다면 기존에 사용하는 실행 파일의 실제 경로를 넘깁니다. 아래 `C:\Tools\nssm\win64\nssm.exe`는 예시이므로 실제 설치 경로로 바꾸세요.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\install-service.ps1 -NssmPath "C:\Tools\nssm\win64\nssm.exe"
```

여기서 `ExecutionPolicy Bypass`는 해당 실행 프로세스에만 적용되며 시스템의 실행 정책을 변경하지 않습니다.

스크립트는 다음을 설정하고 즉시 시작합니다.

- 서비스 이름: `TravelItineraryMap`; 이름이 같은 다른 앱이 있으면 중단
- 실행 파일: 현재 Node의 절대 경로; 작업 폴더: 프로젝트 루트
- 계정: 비밀번호가 필요 없는 Windows `LocalService` 계정
- 부팅 후 지연 자동 시작(로그인 불필요), 앱 종료 시 5초 후 재시작
- 서비스 전용 환경: `NODE_ENV=production`, `PORT=6001`, `DATA_DIR=./data`
- 프로젝트 읽기 권한과 `data/`, `logs/` 수정 권한을 LocalService에 부여
- `logs/stdout.log`, `logs/stderr.log` 기록과 10MB 기준 로그 회전

Node는 서비스에서도 접근할 수 있는 시스템 설치본을 권장합니다. 필요하면 `-NodePath "C:\Program Files\nodejs\node.exe"`로 지정하세요. 서비스 등록 후 Node 경로를 옮기면 서비스 설정도 갱신해야 합니다. NSSM 실행 파일도 서비스가 계속 사용하므로 이동·삭제하지 마세요.

이 서비스는 기본 `data/` 폴더를 사용합니다. 기존 `.env`의 `DATA_DIR`를 다른 곳으로 설정했다면 기존 데이터를 먼저 확인하고 스크립트의 `DATA_DIR` 및 해당 경로의 권한을 맞춘 뒤 등록하세요.

### 3. 상태 확인과 운영

```powershell
Get-Service TravelItineraryMap
Invoke-RestMethod http://localhost:6001/api/health
```

`Running`과 `status: ok`를 확인합니다. 실제 재부팅 후에도 동일한 명령으로 확인하세요. 서비스가 `Running`이어도 Node가 포트 충돌로 반복 재시작 중일 수 있으므로 API 응답과 로그를 함께 확인합니다.

```powershell
# 코드 수정/업데이트 후
cd C:\Development\travel-itinerary-map
npm ci
npm run build
Restart-Service TravelItineraryMap

# 필요할 때 중지 / 시작 (관리자 PowerShell)
Stop-Service TravelItineraryMap
Start-Service TravelItineraryMap

# 오류 로그 확인
Get-Content .\logs\stderr.log -Tail 60
```

서버 코드·의존성까지 교체하는 업데이트는 `Stop-Service TravelItineraryMap` → 파일 교체·`npm ci`·빌드 → `Start-Service TravelItineraryMap` 순서로 진행하세요. 데이터와 `.env`는 보존합니다. 자동 실행 등록 후 이 앱을 `npm start`나 다른 자동 실행 항목으로 동시에 실행하지 마세요.

### 4. 운영 도메인 연결

요청 흐름은 `https://19991115.xyz` → 기존 HTTPS 프록시 → `http://127.0.0.1:6001`입니다. 브라우저의 `/api` 요청도 같은 도메인으로 전송되므로 별도 프런트엔드 API 주소나 CORS 설정은 필요하지 않습니다. `.env`에 도메인을 넣는 것만으로 실제 프록시 설정이 바뀌지는 않습니다.

- 기존 Cloudflare Tunnel 사용: 이 호스트의 서비스 URL을 `http://localhost:6001`로 변경
- 기존 Nginx 사용: 해당 도메인의 `proxy_pass`를 `http://127.0.0.1:6001`로 변경. `deploy/nginx-location.example.conf` 참고
- 기존 Caddy 사용: 해당 도메인의 `reverse_proxy`를 `127.0.0.1:6001`로 변경. `deploy/Caddyfile.example` 참고
- 그 외 프록시도 같은 내부 주소를 사용합니다. 기존 TLS 인증서와 다른 도메인 설정은 유지합니다.

기존 프록시가 동일 PC에서 실행 중이라면 외부로 6001 포트를 추가 개방할 필요가 없습니다. 프록시가 별도 기기/컨테이너라면 `127.0.0.1` 대신 프록시에서 접근할 수 있는 서버 PC 주소를 사용하세요.

Google Maps 브라우저 키에는 `https://19991115.xyz/*`를 허용하세요. `www` 주소도 사용하는 경우에만 `https://www.19991115.xyz/*`를 추가합니다. 도메인에서는 API 요청에 6001 포트를 붙이지 않습니다.

## Google Cloud 설정

1. Google Cloud에서 프로젝트를 만들고 결제 계정을 연결합니다.
2. **Maps JavaScript API**를 활성화합니다.
3. 웹사이트용 API 키를 만들고 API 제한을 **Maps JavaScript API**로 설정합니다.
4. 애플리케이션 제한은 **웹사이트 / HTTP referrer**로 설정합니다. 실제 사용하는 주소만 추가하세요. 개발 예시:
   - `http://localhost:4173/*`
   - `http://127.0.0.1:4173/*`
   - 운영 도메인: `https://19991115.xyz/*`
   - HTTP 주소도 실제 사용하는 경우: `http://19991115.xyz/*`
   - 로컬 운영 확인: `http://localhost:6001/*`
   - LAN 사용 시 실제 IP 주소와 포트도 추가합니다.
5. 루트 `.env`에 다음 값을 설정합니다.

```dotenv
VITE_GOOGLE_MAPS_API_KEY=브라우저용_키
PORT=6001
DATA_DIR=./data
```

Google Maps가 로드되면 날짜별 번호 마커, 장소 선택, 정보창, 전체 장소 보기, 확대·축소와 드래그가 동작합니다. 인증 실패나 네트워크 오류가 발생하면 샘플 지도와 오류 안내를 표시합니다. **실제 API 연동 검증에는 사용자의 유효한 키가 필요합니다.**

Geocoding API와 Routes API는 후속 단계에서 서버에서 호출합니다. 별도 서버 키를 `.env`의 `GOOGLE_MAPS_SERVER_API_KEY`에 설정하도록 준비했으며, 현재 사용하지 않습니다. 서버 키에는 활성화할 API만 허용하고 가능한 경우 서버 공인 IP 제한을 적용합니다. 서버 키를 `VITE_` 변수에 넣지 마세요.

브라우저 키는 브라우저에서 보이는 식별자이므로 소스에 숨기는 것만으로 보호되지 않습니다. 위 referrer/API 제한과 Google Cloud의 예산 알림·API 할당량을 함께 설정하세요. 예산 알림 자체가 사용을 자동 차단하지는 않습니다.

## 현재 가능한 동작

- 날짜와 요일이 표시되는 날짜 탭, 날짜별 방문 순서·번호 마커
- 데스크톱의 지도 + 오른쪽 일정 패널
- 모바일의 지도 + 하단 접기/펼치기 일정 패널
- 마커와 일정 항목의 양방향 선택 연동
- 장소 시간·주소·메모·사진 및 Google Maps로 열기
- 샘플 지도의 이동·확대·축소·전체 장소 보기·스타일 전환
- 전체 일정 보기와 여행 즐겨찾기(해당 브라우저 localStorage)
- 로딩·빈 일정·서버 오류·지도 연결 실패 UI
- 후지산 3일 샘플 Excel 다운로드
- JSON 파일 읽기와 최초 샘플 저장; 기존 데이터는 덮어쓰지 않음

**샘플 지도는 실제 지도 타일이 아닙니다. 점선은 방문 순서의 직선 연결이며 도로 경로나 거리·소요시간이 아닙니다.** 실제 Google Maps 모드에서도 1단계에는 번호 마커만 표시하고 도로 경로는 계산하지 않습니다.

Excel 버튼은 양식 다운로드와 다음 단계 안내를 엽니다. 아직 업로드·파싱·컬럼 매핑·자동 Geocoding·경로 API·일정 수정 기능은 제공하지 않습니다. 샘플 사진은 Unsplash 외부 URL을 사용하며, 연결이 실패하면 프로젝트에 포함된 후지산 일러스트를 대신 표시합니다. 운영시간과 여행 정보는 예시이므로 방문 전에 확인하세요.

## 프로젝트 구조

```text
travel-itinerary-map/
├── client/
│   ├── public/images/           # 연결 실패 시 사용할 원본 일러스트
│   ├── src/
│   │   ├── components/TravelMap.tsx  # Google Maps와 샘플 지도
│   │   ├── services/api.ts      # 서버 API 경계
│   │   ├── types/index.ts      # 여행·날짜·장소 타입
│   │   ├── App.tsx             # 여행 플래너 화면
│   │   └── styles.css          # 반응형 스타일
│   └── vite.config.ts
├── server/
│   ├── services/store.js       # JSON 저장소 경계 (향후 DB 대체 가능)
│   ├── test/app.test.js        # 실제 HTTP API·저장소 테스트
│   ├── app.js                  # Express 앱
│   └── index.js                # 환경변수·실행 설정
├── scripts/
│   ├── dev.mjs                 # API와 Vite 동시 실행 및 종료
│   └── windows/install-service.ps1  # 기존 NSSM으로 부팅 자동 실행
├── deploy/                     # 기존 프록시에 병합할 설정 예시
├── sample/
│   ├── itinerary.json
│   ├── itinerary.xlsx
│   └── generate.mjs            # 샘플 Excel 재생성
├── data/                       # 자동 생성, Git 제외
├── .env.example
├── .gitignore
├── package-lock.json
└── README.md
```

`App.tsx`의 브랜드/샘플 소개 부분과 예시 SVG 지도는 후지산을 표현하지만 실제 Google Maps 렌더링과 데이터 타입은 전달된 좌표·날짜를 사용합니다. 새로운 여행의 제목·날짜·장소는 JSON으로 교체할 수 있습니다. 예시 SVG는 후지산 지역 미리보기 전용이며 다른 지역에서는 Google Maps 키를 설정하세요.

### 데이터와 백업

첫 `/api/itinerary` 요청 시 `data/itinerary.json`이 없으면 `sample/itinerary.json`을 복사합니다. 이후에는 저장 파일을 읽으며 서버 재시작 시 덮어쓰지 않습니다. 경로는 `DATA_DIR`로 변경할 수 있습니다(상대 경로는 프로젝트 루트 기준).

1단계에서는 서버를 중지한 뒤 `data/itinerary.json`을 다른 위치에 복사하면 백업할 수 있습니다. 복구는 서버를 중지하고 해당 파일을 되돌린 뒤 재시작합니다. 손상된 파일은 자동으로 덮어쓰지 않고 오류를 반환합니다. 업로드·수정 시 자동 백업과 UI 복구 기능은 후속 단계입니다.

`.env`, 사용자 데이터, 백업, 로그, 빌드 결과와 `node_modules`는 Git에서 제외합니다. `.env.example`에는 실제 키가 없습니다. 사용자 주소·메모나 실제 키를 `sample/`에 넣지 마세요. 샘플 폴더는 Git에 포함됩니다.

### 데이터 API

| 요청 | 응답 |
| --- | --- |
| `GET /api/health` | 실행 상태와 현재 단계 |
| `GET /api/itinerary` | 저장된 여행 일정 |
| `GET /api/sample` | 샘플 `.xlsx` 다운로드 |

## 검증 명령

```bash
npm run build
npm test
npm run sample
```

- `build`: TypeScript 엄격 검사와 Vite 프로덕션 번들 생성
- `test`: HTTP 상태, 일정 형식과 서버 키 비노출, HTTP 서버 재시작 후 데이터 유지, 손상된 JSON 보호, Excel 다운로드와 API 404 응답
- `sample`: `sample/itinerary.json`으로 샘플 Excel 재생성(ExcelJS는 이 생성 도구에서만 사용)

현재 개발 환경에서 빌드와 자동 테스트 4개를 통과했습니다. 브라우저 미리보기 중계 연결 실패로 실제 데스크톱·모바일 브라우저 조작 검증은 완료하지 못했습니다. Google Maps 실연동은 키가 없어 미검증 상태입니다.

수동 확인 순서: 개발 실행 → 날짜별 장소 수 변화 → 장소 클릭과 마커 연동 → 지도 조작 → 전체 일정 → Excel 다운로드 → 모바일 폭에서 일정 접기/펼치기 → 키 설정 후 실제 지도 로드 → 서버 재시작 후 일정 유지.

## 다음 단계

| 단계 | 범위 | 상태 |
| --- | --- | --- |
| 1 | Vite·Express 구성, Google Maps 로더, 반응형 플래너 | 구현 완료, 위 검증 한계 참고 |
| 2 | `.xlsx` 업로드, 컬럼 매핑, 검증, 날짜·시간 정렬, Geocoding | 예정 |
| 3 | Routes API 구간별 DRIVE/WALK 계산, 실제 도로 폴리라인, 거리·소요시간 | 예정 |
| 4 | 업로드·경로 상태 UI 보완과 모바일 실기기 검증 | 예정 |
| 5 | 자동 백업·복구, 개인 PC 배포 점검, 전체 흐름 검증 | 예정 |

Geocoding과 Routes 결과의 캐시는 후속 단계에서 각 서비스의 최신 약관에 맞는 저장 항목·허용 기간·만료 삭제 정책을 확인한 뒤 구현합니다. 영구 좌표·경로 캐싱을 기본값으로 두지 않습니다. 지원되지 않는 경로나 API 실패를 임의 도로 경로로 대신 표시하지 않습니다.
