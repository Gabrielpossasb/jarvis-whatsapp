import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const JARVIS_URL = import.meta.env.VITE_JARVIS_URL || "https://web-production-f30e8.up.railway.app";
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function registrarPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !VAPID_KEY) return;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    });
    await fetch(`${JARVIS_URL}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
  } catch {
    // push não suportado ou bloqueado — ignora silenciosamente
  }
}

// iOS exige que requestPermission seja chamado dentro de gesto do usuário
function agendarPushNoGesto() {
  function handler() {
    document.removeEventListener("click", handler);
    document.removeEventListener("touchend", handler);
    registrarPush();
  }
  document.addEventListener("click", handler);
  document.addEventListener("touchend", handler);
}

agendarPushNoGesto();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
