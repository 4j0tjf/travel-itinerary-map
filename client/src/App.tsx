import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  Clipboard,
  Compass,
  FileSpreadsheet,
  Info,
  Leaf,
  List,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Mountain,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import type { Itinerary, User } from "./types";
import {
  ApiError,
  authenticate,
  deleteTrip,
  getMe,
  getTrips,
  logout,
  renameTrip,
  uploadTrip,
} from "./services/api";
import { itineraryPrompt } from "./services/prompts";
import Dialog from "./components/Dialog";
import TripPlanner from "./components/TripPlanner";

type Modal = "login" | "register" | "upload" | "rename" | "delete" | null;
const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "서버 연결을 확인한 뒤 다시 시도해 주세요.";
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionRetry, setSessionRetry] = useState(0);
  const [trips, setTrips] = useState<Itinerary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState("");
  const [tripsRetry, setTripsRetry] = useState(0);
  const [location, setLocation] = useState(
    () => window.location.hash.slice(1) || "guide",
  );
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadAfterLogin, setUploadAfterLogin] = useState(false);
  const [model, setModel] = useState<"ChatGPT" | "Claude">("ChatGPT");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const page = location.startsWith("trips") ? "trips" : "guide";
  const activeId = location.startsWith("trips/") ? location.slice(6) : "";
  const selectedTrip = trips.find((t) => t.id === activeId) || trips[0];
  const navigate = (target: string) => {
    window.location.hash = target;
    setLocation(target);
  };
  useEffect(() => {
    const handle = () => setLocation(window.location.hash.slice(1) || "guide");
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSessionLoading(true);
    setSessionError("");
    getMe(controller.signal)
      .then(({ user }) => setUser(user))
      .catch((error) => {
        if (!controller.signal.aborted) setSessionError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionLoading(false);
      });
    return () => controller.abort();
  }, [sessionRetry]);
  useEffect(() => {
    if (!user) {
      setTrips([]);
      setTripsError("");
      setTripsLoading(false);
      return;
    }
    const controller = new AbortController();
    setTrips([]);
    setTripsLoading(true);
    setTripsError("");
    getTrips(controller.signal)
      .then(({ trips }) => setTrips(trips))
      .catch((error) => {
        if (!controller.signal.aborted) setTripsError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setTripsLoading(false);
      });
    return () => controller.abort();
  }, [user, tripsRetry]);
  useEffect(() => {
    const handle = () => {
      setUser(null);
      setTrips([]);
      setModal("login");
      setToast("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    };
    window.addEventListener("travel-session-expired", handle);
    return () => window.removeEventListener("travel-session-expired", handle);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  const open = (next: Modal) => {
    setModalError("");
    setDetails([]);
    setPassword("");
    setModal(next);
  };
  const close = () => {
    if (!busy) {
      setModal(null);
      setModalError("");
      setDetails([]);
      setPassword("");
      setUploadAfterLogin(false);
    }
  };
  const showUpload = () => {
    setTitle("");
    setFile(null);
    if (user) open("upload");
    else {
      setUploadAfterLogin(true);
      open("login");
    }
  };
  const fail = (error: unknown) => {
    setModalError(errorMessage(error));
    setDetails(error instanceof ApiError ? error.details : []);
  };
  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setModalError("");
    try {
      const { user } = await authenticate(
        modal === "register" ? "register" : "login",
        username,
        password,
      );
      setUser(user);
      setPassword("");
      setModal(uploadAfterLogin ? "upload" : null);
      setUploadAfterLogin(false);
      navigate("trips");
      setToast(`${user.username}님, 여행을 시작해 볼까요?`);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setModalError(".xlsx 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setModalError("");
    setDetails([]);
    try {
      const { trip } = await uploadTrip(file, title);
      setTrips((previous) => [...previous, trip]);
      setModal(null);
      setFile(null);
      navigate("trips/" + trip.id);
      setToast(
        `${trip.title} 여행을 저장했어요.${trip.warnings.length ? " 가져오기 안내를 확인해 주세요." : ""}`,
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!selectedTrip) return;
    setBusy(true);
    setModalError("");
    try {
      const { trip } = await renameTrip(selectedTrip.id, title);
      setTrips((previous) =>
        previous.map((t) => (t.id === trip.id ? trip : t)),
      );
      setModal(null);
      setToast("일정 이름을 변경했어요.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!selectedTrip) return;
    setBusy(true);
    setModalError("");
    try {
      await deleteTrip(selectedTrip.id);
      const remaining = trips.filter((t) => t.id !== selectedTrip.id);
      setTrips(remaining);
      setModal(null);
      navigate(remaining[0] ? "trips/" + remaining[0].id : "trips");
      setToast("여행 일정을 삭제했어요.");
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    try {
      await logout();
      setUser(null);
      setTrips([]);
      navigate("guide");
      setToast("로그아웃했어요.");
    } catch (error) {
      setToast(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(itineraryPrompt(model));
      setCopied(true);
    } catch {
      setToast(
        "복사할 수 없습니다. 프롬프트 내용을 선택해 직접 복사해 주세요.",
      );
    }
  }
  const modalHeading =
    modal === "login"
      ? "다시 만나 반가워요"
      : modal === "register"
        ? "나만의 여행 공간 만들기"
        : modal === "upload"
          ? "새로운 여행 가져오기"
          : modal === "rename"
            ? "일정 이름 변경"
            : "여행 일정을 삭제할까요?";
  return (
    <div className={`app-shell ${page === "guide" ? "guide-shell" : ""}`}>
      <header className="app-header">
        <a href="#guide" className="brand" aria-label="여정 가이드 홈">
          <span className="brand-symbol">
            <Mountain size={25} strokeWidth={1.6} />
          </span>
          <span>
            여정<span className="brand-sub">YE O J E O N G</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="workspace-name">나의 여행 공간</span>
        <nav className="primary-nav" aria-label="주 메뉴">
          <button
            className={page === "guide" ? "nav-active" : ""}
            onClick={() => navigate("guide")}
          >
            <BookOpen size={16} />
            가이드
          </button>
          <button
            className={page === "trips" ? "nav-active" : ""}
            onClick={() => navigate("trips")}
          >
            <List size={16} />
            전체 일정
          </button>
        </nav>
        <div className="header-actions">
          {user && (
            <span className="personal-label">
              <span className="status-dot" />
              {user.username}님의 여행
            </span>
          )}
          <button
            className="upload-button"
            onClick={showUpload}
            disabled={sessionLoading || busy}
          >
            <Upload size={16} />
            <span>일정 불러오기</span>
          </button>
          {user ? (
            <button
              className="account-button"
              onClick={signOut}
              disabled={busy}
              aria-label="로그아웃"
            >
              <LogOut size={16} />
              <span>로그아웃</span>
            </button>
          ) : (
            <button
              className="account-button"
              onClick={() => open("login")}
              disabled={sessionLoading}
            >
              <LogIn size={16} />
              <span>로그인</span>
            </button>
          )}
        </div>
      </header>
      {sessionError && (
        <div className="connection-banner" role="alert">
          <Info size={16} />
          {sessionError}
          <button onClick={() => setSessionRetry((n) => n + 1)}>
            다시 연결
          </button>
        </div>
      )}
      {page === "guide" ? (
        <main className="guide-page">
          <section className="guide-intro">
            <div className="guide-intro-copy">
              <span className="page-eyebrow">
                <Leaf size={14} /> A JOURNEY THAT FEELS LIKE YOU
              </span>
              <h1>
                일정 한 장이,
                <br />
                <em>나만의 여행 지도</em>가 되도록.
              </h1>
              <p>
                여행 계획은 AI와 함께, 여행의 순간은 지도와 함께.
                <br />
                스프레드시트에 담은 일정을 날짜별로 펼쳐 보세요.
              </p>
              <div className="guide-intro-actions">
                <button
                  className="primary-button"
                  onClick={() => navigate("trips")}
                >
                  내 여행 일정 보기
                  <ArrowRight size={16} />
                </button>
                <span>
                  <ShieldCheck size={14} />내 계정에 안전하게 저장
                </span>
              </div>
            </div>
            <div className="guide-postcard" aria-hidden="true">
              <div className="postcard-art">
                <Mountain size={115} strokeWidth={0.65} />
                <span className="postcard-sun" />
                <div className="postcard-route">
                  <span>1</span>
                  <i />
                  <span>2</span>
                  <i />
                  <span>3</span>
                </div>
              </div>
              <span>YOUR PLANS, BEAUTIFULLY CONNECTED.</span>
              <strong>다음 여행은 어디인가요?</strong>
              <p>시즈오카부터, 당신이 꿈꾸는 모든 곳까지.</p>
              <span className="postcard-stamp">
                <Compass size={28} />
              </span>
            </div>
          </section>
          <section className="guide-steps" aria-label="사용 방법">
            <div>
              <span>01</span>
              <div>
                <strong>AI에게 여행 일정 요청</strong>
                <p>아래 프롬프트를 복사하고 여행 정보를 채워 주세요.</p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <strong>스프레드시트로 저장</strong>
                <p>완성된 일정을 .xlsx 파일로 준비하세요.</p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <strong>나의 여행 지도 완성</strong>
                <p>로그인 후 파일을 올리면 여행 탭이 생겨요.</p>
              </div>
            </div>
          </section>
          <section className="prompt-section">
            <div className="prompt-section-title">
              <div>
                <span className="page-eyebrow">START WITH A GOOD PLAN</span>
                <h2>복사하고, 여행 정보만 채워 주세요.</h2>
                <p>
                  ChatGPT·Claude에 붙여 넣으면 업로드 양식에 맞춰 일정을 정리할
                  수 있어요.
                </p>
              </div>
              <a
                className="sample-download"
                href="/api/sample"
                download="itinerary.xlsx"
              >
                <ArrowDownToLine size={15} />
                샘플 Excel 양식
              </a>
            </div>
            <div className="prompt-card">
              <div className="prompt-toolbar">
                <div
                  className="model-tabs"
                  role="tablist"
                  aria-label="프롬프트 대상 AI"
                >
                  {(["ChatGPT", "Claude"] as const).map((name) => (
                    <button
                      key={name}
                      role="tab"
                      aria-selected={model === name}
                      aria-controls="prompt-text"
                      className={model === name ? "active" : ""}
                      onClick={() => {
                        setModel(name);
                        setCopied(false);
                      }}
                    >
                      <Sparkles size={14} />
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  className={`copy-button ${copied ? "copied" : ""}`}
                  onClick={copyPrompt}
                >
                  {copied ? <CheckCheck size={15} /> : <Clipboard size={15} />}
                  <span>{copied ? "복사했어요" : "프롬프트 복사"}</span>
                </button>
              </div>
              <textarea
                id="prompt-text"
                className="prompt-text"
                aria-label={`${model}용 여행 일정 프롬프트`}
                readOnly
                value={itineraryPrompt(model)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="prompt-footer">
                <Info size={13} />
                <span>
                  AI가 파일을 만들 수 없다면 표를 Excel에 붙여 넣고 .xlsx로
                  저장해 주세요.
                </span>
              </div>
            </div>
          </section>
          <section className="guide-notes">
            <div>
              <FileSpreadsheet size={23} />
              <h3>한 행에 한 장소</h3>
              <p>
                날짜·시간·장소명과 주소 또는 좌표가 필요해요. 셀을 병합하지 않고
                매 행에 입력해 주세요.
              </p>
            </div>
            <div>
              <MapPin size={23} />
              <h3>정확한 위치로 연결</h3>
              <p>
                검증한 위도·경도가 있으면 지도에 바로 표시해요. 좌표가 없어도
                주소와 일정은 저장됩니다.
              </p>
            </div>
            <div>
              <ShieldCheck size={23} />
              <h3>다음에도 이어지는 여행</h3>
              <p>
                여행은 서버 PC에 계정별로 저장해요. 로그인은 30일간 유지되고
                언제든 로그아웃할 수 있어요.
              </p>
            </div>
          </section>
          <footer className="guide-footer">
            <Leaf size={14} />
            <span>당신의 속도로, 당신만의 여행.</span>
            <span>여정</span>
          </footer>
        </main>
      ) : (
        <>
          <section className="library-heading">
            <div>
              <span className="page-eyebrow">YOUR TRAVEL COLLECTION</span>
              <h1>
                전체 일정
                <span>
                  {user && !tripsLoading
                    ? `${trips.length}개의 여행`
                    : "나만의 여행 기록"}
                </span>
              </h1>
            </div>
            <button
              className="secondary-button"
              onClick={showUpload}
              disabled={sessionLoading || busy}
            >
              <Plus size={16} />
              여행 추가
            </button>
          </section>
          {sessionLoading ? (
            <main className="state-page">
              <LoaderCircle className="spinning" size={28} />
              <h2>로그인 정보를 확인하고 있어요</h2>
            </main>
          ) : !user ? (
            <main className="state-page library-empty">
              <span className="empty-compass">
                <Compass size={42} />
              </span>
              <span className="page-eyebrow">YOUR PRIVATE JOURNEY</span>
              <h2>로그인하고, 나의 여행을 펼쳐 보세요.</h2>
              <p>
                내가 등록한 여행만 모아서 볼 수 있어요.
                <br />
                처음에는 비어 있는 공간을, 나만의 여행으로 채워 보세요.
              </p>
              <button className="primary-button" onClick={() => open("login")}>
                로그인 / 회원가입
                <ArrowRight size={16} />
              </button>
            </main>
          ) : tripsLoading ? (
            <main className="state-page">
              <LoaderCircle className="spinning" size={28} />
              <h2>저장된 여행을 불러오고 있어요</h2>
            </main>
          ) : tripsError ? (
            <main className="state-page">
              <Info size={28} />
              <h2>여행을 불러오지 못했어요</h2>
              <p>{tripsError}</p>
              <button
                className="primary-button"
                onClick={() => setTripsRetry((n) => n + 1)}
              >
                다시 불러오기
              </button>
            </main>
          ) : trips.length === 0 ? (
            <main className="state-page library-empty">
              <span className="empty-compass">
                <Compass size={46} />
              </span>
              <span className="page-eyebrow">
                A BLANK PAGE, A NEW ADVENTURE
              </span>
              <h2>아직 등록된 여행이 없어요.</h2>
              <p>
                준비한 스프레드시트를 올려 보세요.
                <br />
                시즈오카, 제주, 파리… 여행마다 새로운 탭이 만들어져요.
              </p>
              <button className="primary-button" onClick={showUpload}>
                <Upload size={16} />첫 여행 일정 불러오기
              </button>
              <button
                className="quiet-button"
                onClick={() => navigate("guide")}
              >
                일정 만드는 방법 보기
                <ArrowRight size={13} />
              </button>
            </main>
          ) : (
            <>
              <div
                className="trip-tabs"
                role="tablist"
                aria-label="등록된 여행"
              >
                {trips.map((trip) => (
                  <button
                    key={trip.id}
                    id={`trip-tab-${trip.id}`}
                    role="tab"
                    aria-selected={selectedTrip?.id === trip.id}
                    aria-controls="trip-view"
                    className={selectedTrip?.id === trip.id ? "selected" : ""}
                    onClick={() => navigate("trips/" + trip.id)}
                  >
                    <MapPin size={14} />
                    {trip.title}
                    <span>{trip.days.length}일</span>
                  </button>
                ))}
              </div>
              {selectedTrip && (
                <div
                  className="trip-view"
                  id="trip-view"
                  role="tabpanel"
                  aria-labelledby={`trip-tab-${selectedTrip.id}`}
                >
                  <TripPlanner
                    key={selectedTrip.id}
                    trip={selectedTrip}
                    onRename={() => {
                      setTitle(selectedTrip.title);
                      open("rename");
                    }}
                    onDelete={() => open("delete")}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {modal && (
        <Dialog title={modalHeading} onClose={close}>
          {modal === "login" || modal === "register" ? (
            <>
              <p>
                {modal === "login"
                  ? "저장해 둔 여행이 기다리고 있어요."
                  : "아이디와 비밀번호로 여행 일정을 나만의 공간에 보관하세요."}
              </p>
              <div className="auth-switch">
                <button
                  type="button"
                  className={modal === "login" ? "active" : ""}
                  onClick={() => open("login")}
                  disabled={busy}
                >
                  로그인
                </button>
                <button
                  type="button"
                  className={modal === "register" ? "active" : ""}
                  onClick={() => open("register")}
                  disabled={busy}
                >
                  회원가입
                </button>
              </div>
              <form onSubmit={submitAuth} className="app-form">
                <label htmlFor="username">아이디</label>
                <input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="영문·숫자·_·-, 3~32자"
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_-]{3,32}"
                  required
                  disabled={busy}
                />
                <label htmlFor="password">비밀번호</label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    modal === "register" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="10자 이상 입력해 주세요"
                  minLength={10}
                  maxLength={128}
                  required
                  disabled={busy}
                />
                {modalError && (
                  <div className="form-error" role="alert">
                    {modalError}
                  </div>
                )}
                <span className="session-note">
                  <ShieldCheck size={13} />이 브라우저에서 30일간 로그인을
                  유지합니다.
                </span>
                <button className="primary-button" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spinning" size={16} />
                  ) : (
                    <LogIn size={16} />
                  )}{" "}
                  {modal === "login" ? "로그인" : "회원가입하고 시작하기"}
                </button>
              </form>
            </>
          ) : modal === "upload" ? (
            <>
              <p>
                여행 한 개당 .xlsx 파일 하나를 올려 주세요.
                <br />
                파일 이름이나 ‘여행명’ 컬럼으로 여행 탭이 만들어집니다.
              </p>
              <form onSubmit={submitUpload} className="app-form">
                <label htmlFor="trip-file" className="file-drop">
                  <FileSpreadsheet size={32} />
                  <strong>{file ? file.name : "Excel 파일 선택하기"}</strong>
                  <span>.xlsx · 최대 5MB · 최대 1,000행</span>
                  <input
                    id="trip-file"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={busy}
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setModalError("");
                      setDetails([]);
                    }}
                    required
                  />
                </label>
                <label htmlFor="upload-title">
                  여행 이름 <span className="optional-label">선택</span>
                </label>
                <input
                  id="upload-title"
                  value={title}
                  maxLength={80}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 시즈오카 · 비우면 파일/여행명 사용"
                />
                <div className="upload-help">
                  필수: 날짜 · 시간 · 장소명 · 주소 또는 위도/경도
                  <br />
                  여러 시트가 있으면 일정 컬럼이 있는 첫 시트를 가져옵니다.
                </div>
                {modalError && (
                  <div className="form-error" role="alert">
                    {modalError}
                    {details.length > 0 && (
                      <ul>
                        {details.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <button className="primary-button" disabled={busy || !file}>
                  {busy ? (
                    <LoaderCircle className="spinning" size={16} />
                  ) : (
                    <Upload size={16} />
                  )}{" "}
                  {busy ? "일정 확인 및 저장 중…" : "여행 일정 저장하기"}
                </button>
              </form>
              <a
                className="sample-download modal-sample"
                href="/api/sample"
                download="itinerary.xlsx"
              >
                <ArrowDownToLine size={13} />
                샘플 Excel 양식 내려받기
              </a>
            </>
          ) : modal === "rename" ? (
            <>
              <p>여행 탭과 지도 화면에 표시되는 이름을 바꿉니다.</p>
              <form className="app-form" onSubmit={submitRename}>
                <label htmlFor="rename-title">일정 이름</label>
                <input
                  id="rename-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  required
                  disabled={busy}
                />
                {modalError && (
                  <div className="form-error" role="alert">
                    {modalError}
                  </div>
                )}
                <button
                  className="primary-button"
                  disabled={busy || !title.trim()}
                >
                  {busy ? (
                    <LoaderCircle className="spinning" size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  이름 저장
                </button>
              </form>
            </>
          ) : (
            <>
              <p>
                <strong>{selectedTrip?.title}</strong> 여행이 서버에서
                삭제됩니다.
                <br />
                삭제한 일정은 되돌릴 수 없습니다.
              </p>
              {modalError && (
                <div className="form-error" role="alert">
                  {modalError}
                </div>
              )}
              <div className="delete-actions">
                <button
                  className="secondary-button"
                  onClick={close}
                  disabled={busy}
                >
                  취소
                </button>
                <button
                  className="danger-button"
                  onClick={confirmDelete}
                  disabled={busy}
                >
                  {busy && <LoaderCircle className="spinning" size={15} />}일정
                  삭제
                </button>
              </div>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
