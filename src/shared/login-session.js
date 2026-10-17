import { requestPowerContent } from "./log-power.js";
// The browser attaches its existing session; cookie values are never read or stored.
export async function checkLoginSession(fetcher = fetch) {
  const response = await fetcher("https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus", {
    credentials: "include", cache: "no-store", signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Session check unavailable");
  const data = await response.json();
  if (data?.code !== 200 || typeof data?.content?.loggedIn !== "boolean") throw new Error("Unknown session response");
  // Discard any profile fields returned by the service.
  return data.content.loggedIn;
}

export function bindLoginCheck(button, onAuthenticated) {
  const panel = document.createElement("div");
  panel.className = "login-status";
  panel.hidden = true;
  panel.setAttribute("role", "status");
  const text = document.createElement("span");
  const link = document.createElement("a");
  link.textContent = "직접 로그인 페이지 열기";
  link.href = "https://chzzk.naver.com/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  panel.append(text, link);
  if (document.querySelector(".topbar")) document.querySelector(".topbar").after(panel);
  else button.after(panel);
  button.textContent = "로그인 상태 확인";
  button.addEventListener("click", async () => {
    button.disabled = true;
    panel.hidden = false;
    link.hidden = true;
    text.textContent = "현재 브라우저의 치지직 로그인 상태를 확인하는 중입니다.";
    try {
      const loggedIn = await checkLoginSession();
      if (loggedIn) {
        text.textContent = "현재 브라우저의 로그인이 확인됐습니다. 방송을 새로고침하면 다시 확인할 수 있습니다. 내장 화면에서만 로그인되지 않으면 동일 프로필·시크릿 여부와 사이트 쿠키 설정을 확인해주세요. 로그인 상태 확인은 내장 프레임의 로그인 성공을 보장하지 않습니다.";
        // A failed follow-up (for example, refreshing a player) does not undo
        // the service's confirmed authentication result.
        if (onAuthenticated) {
          try { await onAuthenticated(); }
          catch { text.textContent += " 로그인 확인 후 화면 작업을 완료하지 못했습니다. 로그인 확인 결과는 유지됩니다."; }
        }
      } else {
        text.textContent = "이 요청에서는 로그인 세션을 확인하지 못했습니다. 일반 치지직 탭도 로그아웃 상태라면 직접 로그인해주세요. 일반 탭은 로그인돼 있다면 브라우저의 사이트 쿠키 제한을 확인해주세요. 쿠키를 복사하거나 설정을 자동 변경하지 않습니다.";
        link.hidden = false;
      }
    } catch {
      text.textContent = "로그인 상태를 확인하지 못했습니다. 로그아웃으로 판단한 것은 아닙니다. 네트워크·사이트 접근 권한을 확인한 뒤 다시 시도해주세요.";
      link.hidden = false;
    } finally { button.disabled = false; }
  });
}

// Separate account guard for reward collection; never persist profile or cookie data.
export async function checkPowerAccount(fetcher = fetch) {
  const content = await requestPowerContent("https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus", "GET", fetcher);
  if (typeof content?.loggedIn !== "boolean") throw new Error("계정 응답 형식을 확인하지 못했습니다.");
  if (!content.loggedIn) return null;
  const id = content.userIdHash;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) throw new Error("계정 식별을 확인할 수 없어 자동 획득을 시작하지 않습니다.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cheesemoa.power.account:${id}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
