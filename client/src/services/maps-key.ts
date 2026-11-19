import { createContext, useContext } from "react";
import { sharedApiKey } from "./google-maps";

// 지도에 쓸 키: 로그인한 계정의 키 → 서버 공용 키 → 없음(위치 미리보기) 순서.
export type MapsKeySource = "account" | "shared" | "none";
export interface MapsKeyState {
  key: string;
  source: MapsKeySource;
  accountKey: string;
  save: (key: string) => Promise<void>;
  remove: () => Promise<void>;
}

export function resolveMapsKey(accountKey = ""): Pick<MapsKeyState, "key" | "source"> {
  const own = accountKey.trim();
  if (own) return { key: own, source: "account" };
  if (sharedApiKey) return { key: sharedApiKey, source: "shared" };
  return { key: "", source: "none" };
}

const unavailable = async () => {
  throw new Error("로그인한 뒤 지도 키를 등록할 수 있습니다.");
};
const MapsKeyContext = createContext<MapsKeyState>({
  ...resolveMapsKey(),
  accountKey: "",
  save: unavailable,
  remove: unavailable,
});
export const MapsKeyProvider = MapsKeyContext.Provider;
export const useMapsKey = () => useContext(MapsKeyContext);
