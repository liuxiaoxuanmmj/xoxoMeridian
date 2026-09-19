"use client";

export const SESSION_LOGOUT_EVENT = "xoxo:session-logout";

/** 仅通知显示状态失效；身份仍由服务器重验，不在浏览器存储凭据。 */
export function notifySessionLogout() {
  window.dispatchEvent(new Event(SESSION_LOGOUT_EVENT));
  try {
    window.localStorage.setItem(SESSION_LOGOUT_EVENT, crypto.randomUUID());
  } catch {
    // 存储不可用时，同标签通知仍生效；其他标签在聚焦或重新可见时重验。
  }
}

export function subscribeToSessionLogout(onLogout: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_LOGOUT_EVENT && event.newValue !== null) onLogout();
  };
  window.addEventListener(SESSION_LOGOUT_EVENT, onLogout);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_LOGOUT_EVENT, onLogout);
    window.removeEventListener("storage", onStorage);
  };
}
