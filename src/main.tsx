import './android/webviewCompat';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/desktopLibrary.css";
import "./styles/mobile.css";
import "./styles/desktopTheme.css";
import "./styles/tagData.css";
import "./styles/apple.css";
import { connectAndroid } from "./android/bridge";
import { initializeSystemTheme } from './theme';
import { startViewMemorySession } from './library/viewMemory';

async function start() {
  startViewMemorySession();
  if (import.meta.env.MODE === "android") {
    document.documentElement.dataset.platform = "android";
    // Reader pinch zoom is handled by its own gesture layer. Keep the app
    // shell at device scale even in WebViews that retain browser page zoom.
    document.querySelector('meta[name="viewport"]')?.setAttribute('content','width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    document.documentElement.style.touchAction='pan-x pan-y';
    const [native, { createAndroidApi }] = await Promise.all([
      connectAndroid(),
      import('./android/data'),
    ]);
    window.omicomic = await createAndroidApi(native);
  }
  if (import.meta.env.MODE !== "android") {
    document.documentElement.dataset.platform = (await window.omicomic.getAppInfo()).platform;
  }
  await initializeSystemTheme();
  ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
}
void start().catch(error => {
  const root=document.getElementById("root")!;
  root.textContent=error instanceof Error?error.message:"启动失败，请重新打开 OmiComic。";
  root.style.cssText="padding:40px 24px;line-height:1.8";
});

