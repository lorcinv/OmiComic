export function isAndroid(): boolean {
  return document.documentElement.dataset.platform === "android";
}

/** Android WebViews can report a fine pointer when a mouse/stylus is connected. */
export function singleTapNavigation(): boolean {
  return isAndroid() || window.matchMedia("(any-pointer: coarse)").matches;
}
