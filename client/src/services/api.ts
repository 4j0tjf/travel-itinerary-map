import type { Itinerary, User } from "../types";
export class ApiError extends Error {
  status: number;
  details: string[];
  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(import.meta.env.BASE_URL + "api" + url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "X-Travel-Client": "1",
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "서버 연결을 확인해 주세요." }));
    if (response.status === 401 && !url.startsWith("/auth/"))
      window.dispatchEvent(new Event("travel-session-expired"));
    throw new ApiError(
      body.error || "요청을 처리하지 못했습니다.",
      response.status,
      body.details || [],
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getMe = (signal?: AbortSignal) =>
  request<{ user: User | null }>("/auth/me", { signal });
export const authenticate = (
  mode: "login" | "register",
  username: string,
  password: string,
) =>
  request<{ user: User }>("/auth/" + mode, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
export const logout = () => request<void>("/auth/logout", { method: "POST" });
export const getTrips = (signal?: AbortSignal) =>
  request<{ trips: Itinerary[] }>("/trips", { signal });
export const renameTrip = (id: string, title: string) =>
  request<{ trip: Itinerary }>("/trips/" + encodeURIComponent(id), {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
export const deleteTrip = (id: string) =>
  request<void>("/trips/" + encodeURIComponent(id), { method: "DELETE" });
export const uploadTrip = (file: File, title: string) => {
  const data = new FormData();
  data.append("file", file);
  data.append("title", title);
  return request<{ trip: Itinerary }>("/trips", { method: "POST", body: data });
};
