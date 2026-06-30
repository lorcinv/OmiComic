import type { OmiComicApi } from "./index";

declare global {
  interface Window {
    omicomic: OmiComicApi;
  }
}

export {};

