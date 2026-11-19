import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "../App";
import type { Itinerary } from "../types";
const user = { id: "user-a", username: "traveler" };
const itinerary: Itinerary = {
  id: "shizuoka-test",
  title: "시즈오카",
  region: "시즈오카",
  country: "",
  subtitle: "2일간의 여행",
  warnings: [],
  sourceSheet: "여행 일정",
  createdAt: "2026-11-17",
  updatedAt: "2026-11-17",
  days: [
    {
      date: "2026-12-01",
      title: "1일차 여행",
      description: "2개의 장소를 둘러보는 하루",
      places: [
        {
          id: "station",
          time: "09:00",
          endTime: "10:00",
          name: "시즈오카역",
          nameJa: "",
          category: "방문 장소",
          address: "Shizuoka",
          lat: 34.971,
          lng: 138.389,
          memo: "역에서 여행 시작",
          image: "",
          mode: "DRIVE",
        },
        {
          id: "miho",
          time: "11:00",
          endTime: "12:00",
          name: "미호노마쓰바라",
          nameJa: "",
          category: "산책",
          address: "Shizuoka",
          lat: 35.014,
          lng: 138.523,
          memo: "바다 산책",
          image: "",
          mode: "WALK",
        },
      ],
    },
    {
      date: "2026-12-02",
      title: "2일차 여행",
      description: "1개의 장소",
      places: [
        {
          id: "park",
          time: "10:00",
          endTime: "",
          name: "순푸성 공원",
          nameJa: "",
          category: "산책",
          address: "Shizuoka",
          lat: 34.98,
          lng: 138.38,
          memo: "",
          image: "",
          mode: "WALK",
        },
      ],
    },
  ],
};
const response = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const openTripMenuItem = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "여행 관리" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
};
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  window.location.hash = "guide";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("guide and private travel collection", () => {
  it("offers ChatGPT/Claude prompts and copies the selected prompt without requiring login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ user: null })));
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "로그인" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.getByRole("button", { name: "가이드" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체 일정" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "추천 점수와 채점 기준" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "세 개의 시트, 한눈에 읽는 여행 계획" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "프롬프트 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("ChatGPT에서"),
      ),
    );
    const copied = writeText.mock.lastCall?.[0] as string;
    expect(copied).toContain("1. '여행 일정'");
    expect(copied).toContain("2. '가볼 만한 곳'");
    expect(copied).toContain("3. '호텔 추천'");
    expect(copied).toContain("본문 12pt, 헤더 13pt");
    expect(copied).toContain("확정한 항공·예약·숙소");
    expect(copied).toContain("두 시간 모두 반드시 생성하세요");
    expect(copied).toContain("네이티브 hyperlink 속성");
    expect(copied).toContain("연속 90분 이상");
    expect(copied).toContain("메모 맨 앞에 반드시 '[AI 추천]'");
    expect(copied).not.toContain("종료시간을 모르면 비워");
    expect(copied).toContain("지도 좌표 필수");
    expect(copied).toContain("좌표 누락 0건");
    expect(copied).toContain("전체 방문 행 수와 유효한 숫자 좌표 쌍의 수가 같은지");
    expect(copied).not.toContain("불확실하면 둘 다 비우세요");
    expect(copied).not.toContain("검증한 숫자 쌍 또는 둘 다 빈칸");
    expect(copied).toContain("세부 점수·점수 근거·채점 기준·가정·출처 모음용 탭을 생성하지 마세요");
    fireEvent.click(screen.getByRole("tab", { name: "Claude" }));
    fireEvent.click(screen.getByRole("button", { name: "프롬프트 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenLastCalledWith(
        expect.stringContaining("Claude에서"),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "전체 일정" }));
    expect(
      screen.getByText("로그인하고, 나의 여행을 펼쳐 보세요."),
    ).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "등록된 여행" })).toBeNull();
  });

  it("copies the full fixed format again for follow-up changes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ user: null })));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "프롬프트 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const initial = writeText.mock.lastCall?.[0] as string;
    fireEvent.click(screen.getByRole("button", { name: "후속 수정용 문구 복사" }));
    await screen.findByRole("button", { name: "후속 문구 복사했어요" });
    const followup = writeText.mock.lastCall?.[0] as string;
    const begin = "[양식 고정 계약: TRAVEL_WORKBOOK_V1]";
    const initialContract = initial.slice(initial.indexOf(begin), initial.indexOf("[내 여행 정보"));
    expect(followup).toContain(initialContract.trim());
    expect(followup).toContain("[이번 수정·보충 내용]");
    expect(followup).toContain("컬럼이 12/12/13개인지");
    expect(followup).toContain("중첩 프롬프트");
    expect(followup).toContain("모든 방문 행에 날짜와 시작·종료를 채우고");
    expect(followup).toContain("앞 장소 종료 + 뒤 여유");
    expect(followup).toContain("D열 장소명은 모든 방문 행");
    expect(followup).toContain("큰 빈 시간에 AI 추천 일정 추가");
    expect(followup).toContain("지도 좌표 필수");
    expect(followup).toContain("F:G가 기본 숨김이어도 선택 입력 항목이 아닙니다");
    expect(followup).toContain("기존 파일의 검증된 좌표");
    expect(followup).toContain("좌표 누락 0건");
    expect(followup).toContain("변경 부분만 담은 파일이 아니라");
    expect(followup).toContain("날짜 | 시간 | 종료시간 | 장소명 | 주소 | 위도 | 경도 | 메모 | 이동수단 | 이미지URL | 여행지역 | 여행명");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts with zero tabs, imports a workbook, switches dates, renames and deletes the travel tab", async () => {
    const calls: { url: string; options: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        calls.push({ url, options });
        if (url === "/api/auth/me") return response({ user });
        if (url === "/api/trips" && options?.method === "POST")
          return response({ trip: itinerary }, 201);
        if (url === "/api/trips") return response({ trips: [] });
        if (url === "/api/trips/shizuoka-test" && options?.method === "PATCH")
          return response({ trip: { ...itinerary, title: "겨울 시즈오카" } });
        if (url === "/api/trips/shizuoka-test" && options?.method === "DELETE")
          return response(null, 204);
        throw new Error("Unexpected API request " + url);
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "전체 일정" }));
    await screen.findByText("아직 등록된 여행이 없어요.");
    expect(screen.queryByRole("tablist", { name: "등록된 여행" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "첫 여행 일정 불러오기" }),
    );
    const dialog = screen.getByRole("dialog");
    const input = dialog.querySelector("input[type=file]") as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["xlsx-test"], "시즈오카.xlsx", {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
        ],
      },
    });
    fireEvent.submit(dialog.querySelector("form")!);
    const tripTab = await screen.findByRole("tab", {
      name: /시즈오카/,
      selected: true,
    });
    expect(tripTab).toBeTruthy();
    expect(screen.getByRole("button", { name: "1. 시즈오카역" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /DAY 02/ }));
    expect(screen.getByRole("button", { name: "1. 순푸성 공원" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1. 시즈오카역" })).toBeNull();
    openTripMenuItem("이름 변경");
    fireEvent.change(screen.getByLabelText("일정 이름"), {
      target: { value: "겨울 시즈오카" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
    await screen.findByRole("tab", { name: /겨울 시즈오카/ });
    openTripMenuItem("일정 삭제");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "일정 삭제",
      }),
    );
    await screen.findByText("아직 등록된 여행이 없어요.");
    expect(screen.queryByRole("tablist", { name: "등록된 여행" })).toBeNull();
    expect(
      calls.some(
        (c) =>
          c.options?.method === "POST" && c.options.body instanceof FormData,
      ),
    ).toBe(true);
    expect(calls.some((c) => c.options?.method === "PATCH")).toBe(true);
    expect(calls.some((c) => c.options?.method === "DELETE")).toBe(true);
  });

  it("replaces the selected journey from Excel without creating a second tab and resets a removed day", async () => {
    const original: Itinerary = { ...itinerary, revision: 0, workbookAvailable: true,
      source: { kind: "excel", filename: "original.xlsx", importedAt: "2026-11-17T01:00:00Z" } };
    const updated: Itinerary = { ...original, revision: 1, days: [{ ...itinerary.days[0],
      places: [{ ...itinerary.days[0].places[0], name: "수정된 장소" }] }],
      source: { kind: "excel", filename: "edited.xlsx", importedAt: "2026-11-18T01:00:00Z" } };
    const uploads: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/auth/me") return response({ user });
      if (url === "/api/trips") return response({ trips: [original] });
      if (url === "/api/trips/shizuoka-test/workbook" && options?.method === "PUT") {
        uploads.push(options.body as FormData);
        return uploads.length === 1 ? response({ error: "날짜를 확인해 주세요.", details: ["2행 날짜 오류"] }, 400) : response({ trip: updated });
      }
      throw new Error("Unexpected API request " + url);
    }));
    window.location.hash = "trips/shizuoka-test";
    render(<App />);
    await screen.findByRole("tab", { name: /시즈오카/, selected: true });
    fireEvent.click(screen.getByRole("tab", { name: /DAY 02/ }));
    openTripMenuItem("일정 수정");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "원본 Excel 내려받기" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("수정한 Excel 파일"), { target: { files: [new File(["edited"], "edited.xlsx")] } });
    fireEvent.submit(dialog.querySelector("form")!);
    await within(dialog).findByRole("alert");
    expect(screen.getByRole("tab", { name: /DAY 02/, selected: true })).toBeTruthy();
    fireEvent.submit(dialog.querySelector("form")!);
    await screen.findByRole("button", { name: "1. 수정된 장소" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("tab", { name: /DAY 02/ })).toBeNull();
    expect(within(screen.getByRole("tablist", { name: "등록된 여행" })).getAllByRole("tab")).toHaveLength(1);
    expect(uploads.map(body => body.get("revision"))).toEqual(["0", "0"]);
  });

  it("registers or edits a sheet link separately and refreshes only the selected journey", async () => {
    const original: Itinerary = { ...itinerary, revision: 0, workbookAvailable: false };
    const url = "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit";
    const linked: Itinerary = { ...original, revision: 1, source: { kind: "excel", importedAt: original.createdAt, googleSheetUrl: url } };
    const updated: Itinerary = { ...linked, revision: 2, workbookAvailable: true,
      days: [{ ...itinerary.days[0], places: [{ ...itinerary.days[0].places[0], name: "현재 시트의 장소" }] }],
      source: { ...linked.source!, kind: "google-sheet", importedAt: "2026-11-18T02:00:00Z" } };
    const refreshes: { revision: number }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (address: string, options?: RequestInit) => {
      if (address === "/api/auth/me") return response({ user });
      if (address === "/api/trips") return response({ trips: [original] });
      if (address === "/api/trips/shizuoka-test/source") {
        expect(JSON.parse(options?.body as string)).toEqual({ url, revision: 0 });
        return response({ trip: linked });
      }
      if (address === "/api/trips/shizuoka-test/refresh") {
        refreshes.push(JSON.parse(options?.body as string));
        return refreshes.length === 1 ? response({ error: "공유 설정을 확인해 주세요." }, 400) : response({ trip: updated });
      }
      throw new Error("Unexpected API request " + address);
    }));
    window.location.hash = "trips/shizuoka-test";
    render(<App />);
    await screen.findByRole("tab", { name: /시즈오카/, selected: true });
    openTripMenuItem("일정 수정");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "현재 일정 Excel 내려받기" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("tab", { name: "구글 시트" }));
    expect((within(dialog).getByRole("button", { name: "등록된 시트로 최신화" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("등록할 구글 시트 링크"), { target: { value: url } });
    fireEvent.submit(dialog.querySelector("form")!);
    await within(dialog).findByText(/링크를 저장했어요/);
    expect(screen.getByRole("tab", { name: /DAY 02/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "등록된 시트로 최신화" }));
    await within(dialog).findByRole("alert");
    expect(screen.getByRole("tab", { name: /DAY 02/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "등록된 시트로 최신화" }));
    await screen.findByRole("button", { name: "1. 현재 시트의 장소" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screen.getByRole("tablist", { name: "등록된 여행" })).getAllByRole("tab")).toHaveLength(1);
    expect(refreshes).toEqual([{ revision: 1 }, { revision: 1 }]);
  });

  it("imports a Google sheet link and preserves it when sharing access fails", async () => {
    const imports: { url: string; title: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/auth/me") return response({ user });
      if (url === "/api/trips") return response({ trips: [] });
      if (url === "/api/trips/from-google-sheet") {
        imports.push(JSON.parse(options?.body as string));
        return imports.length === 1
          ? response({ error: "공유 설정을 확인해 주세요." }, 400)
          : response({ trip: itinerary }, 201);
      }
      throw new Error("Unexpected API request " + url);
    }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "전체 일정" }));
    await screen.findByText("아직 등록된 여행이 없어요.");
    fireEvent.click(screen.getByRole("button", { name: "첫 여행 일정 불러오기" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "구글 시트 링크" }));
    expect(dialog.querySelector("input[type=file]")).toBeNull();
    const link = "https://docs.google.com/spreadsheets/d/1XWJLkAwch5GXAt_7zOFDcg8Wm8Xv29_8PWuuW15qmAE/edit";
    fireEvent.change(screen.getByLabelText("구글 스프레드시트 링크"), { target: { value: link } });
    fireEvent.change(screen.getByLabelText(/여행 이름/), { target: { value: "시즈오카" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("구글 스프레드시트 링크") as HTMLInputElement).value).toBe(link);
    expect(screen.getByText("가져온 뒤 원본 시트를 수정해도 저장된 여행은 바뀌지 않습니다.")).toBeTruthy();
    fireEvent.submit(dialog.querySelector("form")!);
    await screen.findByRole("tab", { name: /시즈오카/, selected: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(imports).toEqual([{ url: link, title: "시즈오카" }, { url: link, title: "시즈오카" }]);
  });

  it("registers through the account form and opens an empty personal collection", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/me") return response({ user: null });
      if (url === "/api/auth/register") return response({ user }, 201);
      if (url === "/api/trips") return response({ trips: [] });
      throw new Error(url);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "로그인" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    fireEvent.click(
      screen.getByRole("button", { name: "회원가입" }),
    );
    fireEvent.change(screen.getByLabelText("아이디"), {
      target: { value: "traveler" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "test-password-2026" },
    });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await screen.findByText("아직 등록된 여행이 없어요.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "등록된 여행" })).toBeNull();
    expect(localStorage.getItem("password")).toBeNull();
  });

  it("restores the authenticated user on a fresh mount and logs out without retaining private trips", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me") return response({ user });
        if (url === "/api/trips") return response({ trips: [itinerary] });
        if (url === "/api/auth/logout") return response(null, 204);
        throw new Error(url);
      }),
    );
    window.location.hash = "trips";
    render(<App />);
    await screen.findByRole("tab", { name: /시즈오카/ });
    expect(screen.queryByRole("button", { name: "로그인" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await screen.findByRole("button", { name: "로그인" });
    fireEvent.click(screen.getByRole("button", { name: "전체 일정" }));
    expect(screen.queryByRole("tablist", { name: "등록된 여행" })).toBeNull();
    expect(
      screen.getByText("로그인하고, 나의 여행을 펼쳐 보세요."),
    ).toBeTruthy();
  });
  it("registers, replaces and removes the account's own map key without reloading trips", async () => {
    const key = "AIza" + "AccountKey".padEnd(35, "1");
    const next = "AIza" + "ReplacedKey".padEnd(35, "2");
    let saved = "";
    const tripLoads = vi.fn();
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/auth/me") return response({ user: { ...user, mapsApiKey: "" } });
      if (url === "/api/trips") { tripLoads(); return response({ trips: [itinerary] }); }
      if (url === "/api/account/maps-key" && options?.method === "PUT") {
        saved = JSON.parse(String(options.body)).key;
        return response({ user: { ...user, mapsApiKey: saved } });
      }
      if (url === "/api/account/maps-key" && options?.method === "DELETE") {
        saved = "";
        return response({ user: { ...user, mapsApiKey: "" } });
      }
      throw new Error("Unexpected API request " + url);
    });
    vi.stubGlobal("fetch", fetcher);
    window.location.hash = "trips/shizuoka-test";
    render(<App />);
    await screen.findByRole("tab", { name: /시즈오카/, selected: true });
    fireEvent.click(screen.getByRole("button", { name: "지도 설정" }));
    const dialog = screen.getByRole("dialog", { name: "지도 설정" });
    expect(within(dialog).getByText("등록한 키 없음")).toBeTruthy();
    const input = within(dialog).getByLabelText("내 Google Maps API 키");

    fireEvent.change(input, { target: { value: "not-a-key" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(within(dialog).getByRole("alert").textContent).toMatch(/AIza/);
    expect(fetcher.mock.calls.some(([url]) => url === "/api/account/maps-key")).toBe(false);

    fireEvent.change(input, { target: { value: ` ${key} ` } });
    fireEvent.submit(dialog.querySelector("form")!);
    await within(dialog).findByText("내 키 사용 중");
    expect(saved).toBe(key);
    expect(within(dialog).getByText("AIza…1111")).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("새 키로 바꾸기"), { target: { value: next } });
    fireEvent.submit(dialog.querySelector("form")!);
    await within(dialog).findByText("AIza…2222");
    expect(saved).toBe(next);

    fireEvent.click(within(dialog).getByRole("button", { name: "내 키 삭제" }));
    await within(dialog).findByText("등록한 키 없음");
    expect(saved).toBe("");
    expect(tripLoads).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("tab", { name: /시즈오카/, selected: true })).toBeTruthy();
  });
  it("explains on the guide page how to create a Google Maps key for this site", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ user: null })));
    window.location.hash = "guide-maps-key";
    render(<App />);
    const section = (await screen.findByRole("heading", { name: "내 Google 지도 키 만들기" })).closest("section")!;
    expect(within(section).getByText(/Maps JavaScript API/, { selector: "strong" })).toBeTruthy();
    expect(within(section).getByText(window.location.origin + "/*")).toBeTruthy();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});
