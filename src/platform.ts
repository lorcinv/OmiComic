export function isAndroid(): boolean {
  return document.documentElement.dataset.platform === "android";
}

export function isIOS(): boolean { return document.documentElement.dataset.platform === 'ios'; }
export function isNativeMobile(): boolean { return isAndroid() || isIOS(); }
export function primaryModifier(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || (document.documentElement.dataset.platform === 'darwin' && event.metaKey);
}

/** Android WebViews can report a fine pointer when a mouse/stylus is connected. */
export function singleTapNavigation(): boolean {
  return isNativeMobile() || window.matchMedia("(any-pointer: coarse)").matches;
}
