# 여정 · 여행 일정 지도

### 이 PC의 공개 경로

`https://19991115.xyz/travel` → Cloudflare Tunnel → `http://127.0.0.1:7000`으로 연결합니다. `.env`는 기존 키와 데이터를 유지하며 `PORT=7000`, `BASE_PATH=/travel`을 사용합니다. `BASE_PATH`는 화면 파일·API·다운로드와 로그인 쿠키 경로에 반영되므로 변경 후 `npm run build`와 `TravelItineraryMap` 서비스 재시작이 필요합니다. 로컬 상태 확인용 `http://localhost:7000/api/health`도 계속 사용할 수 있습니다.

React·TypeScript·Vite와 Node.js·Express로 실행하는 여행 플래너입니다. **가이드 | 전체 일정** 메뉴에서 일정을 만들고, 계정별로 서버 PC에 저장합니다. 기본 포트는 **6001**, 운영 도메인 기준은 **19991115.xyz**입니다.

## 이번 버전의 동작

- 첫 화면은 가이드입니다. ChatGPT·Claude용 여행 일정 프롬프트와 복사 버튼을 제공합니다.
- 회원가입·로그인 후 전체 일정에서 본인이 등록한 여행만 조회합니다.
- **새 계정의 여행은 0개이며 여행 탭도 없습니다.** 샘플을 자동 등록하지 않습니다.
- `.xlsx` 파일을 업로드하면 이름이 붙은 여행 탭이 생성됩니다. 예: `시즈오카.xlsx` → 시즈오카 탭.
- 각 여행 탭은 날짜 선택, Google Maps/위치 미리보기, 오른쪽 상세 일정의 기존 UI를 사용합니다.
- 여행 이름 변경·삭제 결과도 서버에 저장되며, 마지막 여행을 삭제하면 다시 0개가 됩니다.
- 로그인은 해당 브라우저에서 30일간 유지합니다. 브라우저 종료·페이지 새로고침·서버 재시작 후에도 유효한 세션을 복원합니다. 명시적 로그아웃·쿠키 삭제·기간 만료 시에는 다시 로그인해야 합니다.

이전 버전의 공개 샘플 API `/api/itinerary`는 제거했습니다. 이전 `data/itinerary.json` 파일은 보존하지만 새 계정에 자동 연결하지 않습니다. 필요한 샘플은 가이드에서 내려받아 직접 업로드하세요.

## 설치와 실행

Node.js 22.12 이상과 npm을 사용합니다(Node.js 24 LTS 권장).

```bash
npm ci
cp .env.example .env
npm run dev
```

개발 웹: http://localhost:4173 · Express: http://localhost:6001/api/health

프로덕션에서는 Express 하나가 화면과 API를 함께 제공합니다.

```bash
npm ci
npm run build
npm start
```

접속 주소: http://localhost:6001. `.env`는 프로젝트 루트에서 읽습니다. 브라우저용 환경변수는 빌드 시 포함되므로 API 키 변경 후 다시 빌드해야 합니다.

### Windows 서버 PC

프로젝트 경로는 `C:\Development\travel-itinerary-map` 기준입니다. GitHub에서 내려받은 프로젝트 파일이 해당 폴더 바로 아래에 있어야 합니다.

```powershell
cd C:\Development\travel-itinerary-map
Test-Path .\package.json
Test-Path .\package-lock.json
```

두 결과가 `True`인지 확인한 뒤 설치합니다.

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

`.env`의 기존 키와 데이터 설정은 유지하고 포트를 확인합니다.

```dotenv
VITE_GOOGLE_MAPS_API_KEY=브라우저용_키
GOOGLE_MAPS_SERVER_API_KEY=
PORT=6001
DATA_DIR=./data
```

```powershell
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
npm start
```

기존 서버를 업데이트할 때는 현재 앱 프로세스를 중지 → `git pull` → `npm ci` → `npm run build` → 같은 방식으로 재시작합니다. `.env`와 `data/`는 삭제하지 마세요. 실제 자동 실행 방식은 기존 서버 PC에서 확인한 뒤 사용합니다. **NSSM 사용을 기본 전제로 하지 않습니다.**

## 가이드 프롬프트

가이드에서 ChatGPT 또는 Claude 탭을 선택하고 **프롬프트 복사**를 누릅니다. 복사한 내용을 해당 AI에 붙여 넣고 여행 지역·기간·숙소·희망 장소를 채워 요청하세요.

프롬프트는 실제 주소·좌표를 검증하도록 요청하고 불확실한 정보는 만들지 않도록 안내합니다. AI 환경에서 파일 생성 기능을 사용할 수 없으면 TSV 표를 받아 Excel에 붙여 넣고 `.xlsx`로 저장할 수 있습니다. AI 결과의 정확성은 방문 전에 확인하세요.

## Excel 양식과 업로드

한 파일은 여행 하나로 저장됩니다. 로그인 후 **일정 불러오기** 또는 **여행 추가**를 사용합니다. 업로드가 완전히 성공한 뒤에만 여행이 저장됩니다. 잘못된 행이 있으면 행 번호와 오류를 표시하며 부분 저장하지 않습니다.

권장 컬럼:

```text
날짜 | 시간 | 종료시간 | 장소명 | 주소 | 위도 | 경도 | 메모 | 이동수단 | 이미지URL | 여행지역 | 여행명
```

| 컬럼 | 입력 방법 |
| --- | --- |
| 날짜 | 필수. `2026-12-01`; 실제 Excel 날짜 셀도 지원 |
| 시간 | 필수. 24시간 `09:00`; 실제 Excel 시간 셀도 지원 |
| 종료시간 | 선택. `10:30`; 당일 시작시간 이후 |
| 장소명 | 필수 |
| 주소 | 좌표가 없으면 필수 |
| 위도·경도 | WGS84 십진수. 함께 입력하거나 함께 비우기. `0`도 유효한 값 |
| 메모 | 선택 |
| 이동수단 | 현재 장소 → 다음 장소. `DRIVE` 또는 `WALK`. 기타 수단은 목록에 보존하고 경로 미지원 안내 |
| 이미지URL | 선택. 공개 `http`/`https` 이미지 URL |
| 여행지역·여행명 | 선택. 첫 번째 입력 값을 사용 |

- 이름 우선순위: 업로드 창의 여행 이름 → `여행명` 컬럼 → 파일 이름(`.xlsx` 제외).
- 같은 날짜의 행은 방문 시간으로 정렬하고 날짜별로 자동 그룹화합니다.
- 첫 20행 안에서 날짜·시간·장소명 컬럼이 있는 첫 워크시트를 가져옵니다. 안내 시트가 앞에 있어도 일정 시트를 탐색합니다. 여러 일정 시트가 있으면 파일을 각각 올려 주세요.
- `일자`, `방문시간`, `방문장소`, `비고`, `Latitude`, `Longitude`, `Date`, `Time`, `Place` 등의 대표 별칭도 지원합니다. 임의의 컬럼 이름은 가이드 양식에 맞춰 바꿔 주세요.
- 날짜·시간 셀을 병합하지 말고 매 행에 입력합니다. 암호로 잠긴 파일·`.xls`·`.csv`는 지원하지 않습니다.
- 파일 최대 5MB, 일정 최대 1,000행·100열, 계정당 최대 100개 여행입니다.
- 샘플 재생성: `npm run sample` (`sample/itinerary.xlsx`). 샘플은 초기 계정에 자동 등록되지 않습니다.

### 좌표와 지도

Google Maps 키가 있으면 실제 Google Maps에 좌표가 있는 장소의 번호 마커를 표시합니다. 마커 번호는 전체 방문 순서를 따릅니다. 날짜를 바꾸면 해당 날짜의 장소만 표시합니다.

**좌표가 없는 장소도 주소·메모와 함께 일정 목록에 저장**합니다. 해당 장소는 지도 마커에서 제외하고 안내를 표시합니다. 주소 기반 Google Maps 열기는 가능합니다. 자동 Geocoding은 이번 버전에 포함하지 않습니다.

키가 없거나 지도 연결이 실패하면 좌표의 상대 위치를 보여 주는 미리보기를 표시합니다. 지역에 종속되지 않으며 **실제 지형·도로 지도가 아닙니다.** 점선은 연속해서 좌표가 있는 장소 사이의 방문 순서만 나타냅니다. 좌표가 없는 중간 장소를 건너뛰어 선을 잇지 않습니다.

**Routes API 기반 도로 경로·거리·이동 시간은 아직 구현하지 않았습니다.** 임의의 선을 실제 도로 경로로 표시하지 않습니다. Geocoding·Routes 결과 캐싱은 추후 각 서비스의 최신 약관을 확인한 뒤 구현할 예정입니다.

## 회원과 로그인 저장

외부 OAuth 없이 로컬 아이디·비밀번호로 회원가입합니다.

- 아이디: 영문·숫자·`_`·`-`, 3~32자, 대소문자 구분 없이 소문자로 저장
- 비밀번호: 10~128자; salt와 scrypt 해시로만 저장
- 로그인: 서버가 임의 세션 토큰을 발급하고 `HttpOnly`, `SameSite=Lax`, 30일 유효 쿠키로 전달
- HTTPS 요청(또는 신뢰하는 프록시의 HTTPS 전달)에는 `Secure` 쿠키 적용
- 서버에는 세션 토큰의 SHA-256 해시와 만료 시각만 저장; 브라우저 localStorage에는 비밀번호·토큰을 저장하지 않음
- 로그아웃 시 해당 세션을 서버에서 삭제. 만료된 세션으로는 일정에 접근할 수 없음
- 인증 API 시도 횟수 제한과 변경 요청의 커스텀 헤더 검사 적용
- 모든 여행 API에서 소유자 확인. 다른 회원의 ID를 알아도 조회·수정·삭제할 수 없음

회원가입은 공개되어 있으며 이메일 인증·비밀번호 재설정·소셜 로그인·계정 삭제는 아직 제공하지 않습니다. 공용 기기에서는 로그아웃해 주세요.

## 서버 저장과 백업

`DATA_DIR/database.json` 한 파일에 회원·세션·소유자별 여행을 저장합니다. 첫 상태는 회원 0명·여행 0개입니다. 세션과 일정 모두 서버 재시작 후 유지됩니다.

쓰기 요청은 한 Node 프로세스에서 순서대로 처리하고 임시 파일 → rename으로 원자적으로 저장합니다. 손상된 JSON은 덮어쓰지 않습니다. **같은 데이터 파일을 여러 Node 프로세스/클러스터가 동시에 사용하지 마세요.** 데이터가 커지면 저장소 모듈을 DB 구현으로 교체할 수 있습니다.

백업·복구는 앱을 중지한 상태에서 `data/database.json` 전체를 복사·복구합니다. 이 파일에는 계정 해시와 로그인 세션도 포함되므로 비공개로 보관하고 Git에 넣지 마세요. 복구 후 세션의 만료 시각은 그대로 유지됩니다. UI에서 여행을 삭제하면 복구할 수 없으므로 필요한 파일은 별도로 보관하세요.

기존 `data/itinerary.json`은 이번 버전에서 자동으로 읽거나 삭제하지 않습니다. 새 회원에게 기존 공개 샘플을 노출하지 않기 위한 동작입니다.

## Google Cloud와 도메인

1. 결제 계정을 연결한 Google Cloud 프로젝트에서 **Maps JavaScript API**를 활성화합니다.
2. 브라우저 키에는 Maps JavaScript API 제한과 HTTP referrer 제한을 적용합니다.
3. 사용하는 주소만 허용합니다.
   - `https://19991115.xyz/*`
   - 실제 사용하는 경우에만 `https://www.19991115.xyz/*`
   - 개발: `http://localhost:4173/*`
   - 로컬 운영 확인: `http://localhost:6001/*`
4. `.env`에 브라우저 키를 설정한 뒤 다시 빌드합니다.

`GOOGLE_MAPS_SERVER_API_KEY`는 향후 서버용 API를 위한 예약 변수이며 브라우저에 전달하지 않습니다. 실제 키를 소스·샘플·README에 쓰지 마세요. `.env`, `data/`, `logs/`, `backups/`, 빌드 결과와 `node_modules`는 Git에서 제외합니다.

운영 요청 흐름은 다음과 같습니다.

```text
https://19991115.xyz → 기존 HTTPS 프록시 → http://127.0.0.1:6001
```

기존 프록시에서 해당 도메인의 대상만 6001로 맞춥니다. 프런트엔드 API는 같은 도메인의 `/api`를 사용하므로 별도 CORS 주소는 필요하지 않습니다. Nginx 예시는 `deploy/nginx-location.example.conf`, Caddy 예시는 `deploy/Caddyfile.example`에 있습니다. Cloudflare Tunnel을 이미 사용한다면 해당 호스트의 서비스 URL을 `http://localhost:6001`로 설정합니다.

프록시는 원래 Host와 `X-Forwarded-Proto: https`를 전달해야 HTTPS 쿠키가 적용됩니다. 앱은 기본적으로 loopback 프록시만 신뢰합니다. 프록시가 별도 기기/컨테이너라면 서버 설정의 trust proxy 범위를 실제 배포에 맞게 조정하세요. 기존 인증서·다른 사이트의 설정은 유지합니다. 운영 로그인에는 HTTPS를 사용하세요.

## 자동 실행: 기존 방식을 확인한 뒤 선택

자동 실행 방식을 새로 가정해서 기존 서비스를 변경하지 않습니다. PM2·작업 스케줄러·서비스 등 현재 사용 중인 방식에서 `node server/index.js`를 프로젝트 루트 작업 폴더로 실행하면 됩니다. 앱은 한 프로세스만 실행하세요.

**실제로 NSSM을 사용하고 있는 경우에만** 기존 보조 스크립트를 선택해서 사용할 수 있습니다. 관리자 PowerShell에서:

```powershell
cd C:\Development\travel-itinerary-map
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\install-service.ps1 -NssmPath "C:\실제경로\nssm.exe"
```

NSSM 보조 스크립트는 `TravelItineraryMap` 서비스만 등록하며, 지연 자동 시작·비정상 종료 후 재시작·로그 회전을 설정합니다. LocalService 계정에 프로젝트 읽기 및 기본 `data/`, `logs/` 쓰기 권한을 부여합니다. 서비스 환경에서 `PORT=6001`, `DATA_DIR=./data`를 사용하므로 별도 데이터 경로를 사용하는 경우 먼저 스크립트를 맞춰야 합니다. 다른 사이트를 종료·수정하지 않습니다. Windows 서비스 등록은 이 개발 환경에서 검증하지 않았습니다.

## 검증

```bash
npm run build
npm test
```

빌드는 TypeScript 엄격 검사와 Vite 번들 생성을 수행합니다. 자동 테스트는 서버 12개와 화면 컴포넌트 4개로 구성됩니다. 새 계정의 빈 일정, 업로드 정렬, 사용자 간 접근 차단, 이름 변경·삭제, 서버 재시작 후 세션·데이터 유지, 잘못된 비밀번호·중복 계정·로그아웃·만료, Excel 오류·좌표 누락·헤더 별칭·행 제한, 변경 요청 보호, 로그인 횟수 제한, HTTPS 쿠키, 손상된 저장 파일 보호, 동시 업로드를 확인합니다.

화면 컴포넌트 테스트는 프롬프트 복사, 회원가입 폼, 빈 여행 → 업로드 → 날짜 전환 → 이름 변경 → 삭제, 로그인 복원과 로그아웃을 확인합니다. 이 환경에서는 미리보기 중계 연결 오류로 실제 브라우저·모바일 화면 검증은 완료하지 못했습니다.

실제 Google Maps는 유효한 사용자 API 키가 있어야 검증할 수 있습니다. Windows 서버의 실제 재부팅·서비스 실행은 서버 PC에서 확인하세요.

## 구조

```text
client/src/
├── App.tsx                     # 가이드·계정·여행 탭·업로드·변경·삭제
├── components/
│   ├── Dialog.tsx              # 모달과 키보드 초점 관리
│   ├── TripPlanner.tsx         # 날짜별 지도·일정 패널
│   └── TravelMap.tsx           # Google Maps와 위치 미리보기
├── services/
│   ├── api.ts                  # 인증 쿠키 기반 API 호출
│   └── prompts.ts              # ChatGPT·Claude 프롬프트
└── types/index.ts
server/
├── app.js                      # 인증·여행 API와 소유자 검사
├── index.js                    # 6001 포트·환경변수
├── services/
│   ├── auth.js                 # 비밀번호 해시·영속 세션
│   ├── excel.js                # .xlsx 검증과 날짜 분류
│   └── store.js                # JSON 원자 저장
├── utils/errors.js
└── test/
```
