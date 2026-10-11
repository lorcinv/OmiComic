import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/mobile.css";
import { connectAndroid } from "./android/bridge";

async function start() {
  if (import.meta.env.MODE === "android") {
    document.documentElement.dataset.platform = "android";
    const native = await connectAndroid();
    const { createAndroidApi } = await import("./android/data");
    window.omicomic = await createAndroidApi(native);
  }
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

