export const DESKTOP_FONT_MIN = 10;
export const DESKTOP_FONT_MAX = 24;
export const DESKTOP_FONT_STANDARD = 14;
export const DESKTOP_INFO_STANDARD = 12;

export function normalizeDesktopFontSize(value: unknown, fallback: number): number {
  const number = Number(value);
  return value == null || value === '' || !Number.isFinite(number)
    ? fallback : Math.max(DESKTOP_FONT_MIN, Math.min(DESKTOP_FONT_MAX, Math.round(number)));
}

export function desktopTypography(settings: { desktopInfoFontSize?: number; desktopGlobalFontSize?: number }) {
  // Earlier releases saved 14 as the default info size. Preserve other custom sizes.
  const legacyDefault = settings.desktopGlobalFontSize === undefined && settings.desktopInfoFontSize === 14;
  return {
    desktopInfoFontSize: normalizeDesktopFontSize(legacyDefault ? 12 : settings.desktopInfoFontSize, DESKTOP_INFO_STANDARD),
    desktopGlobalFontSize: normalizeDesktopFontSize(settings.desktopGlobalFontSize, DESKTOP_FONT_STANDARD),
  };
}
