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
    fireEvent.click(screen.getByRole("button", { name: "프롬프트 복사" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("ChatGPT에서"),
      ),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "이름 변경" }));
    fireEvent.change(screen.getByLabelText("일정 이름"), {
      target: { value: "겨울 시즈오카" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이름 저장" }));
    await screen.findByRole("tab", { name: /겨울 시즈오카/ });
    fireEvent.click(screen.getByRole("button", { name: "일정 삭제" }));
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
});
