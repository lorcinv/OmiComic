export type ColorTheme = 'mist' | 'nord' | 'sand' | 'night';
export type DayColorTheme = Exclude<ColorTheme, 'night'>;
export type ThemePreferences = { colorTheme?: unknown; dayColorTheme?: unknown; followSystemTheme?: unknown };
const isDayTheme = (value: unknown): value is DayColorTheme => value === 'mist' || value === 'nord' || value === 'sand';

/** The saved daytime palette survives automatic dark mode and manual night mode. */
export function normalizeThemePreferences(settings: ThemePreferences) {
  const colorTheme: ColorTheme = isDayTheme(settings.colorTheme) || settings.colorTheme === 'night' ? settings.colorTheme : 'mist';
  const dayColorTheme: DayColorTheme = isDayTheme(colorTheme) ? colorTheme : isDayTheme(settings.dayColorTheme) ? settings.dayColorTheme : 'mist';
  return { colorTheme, dayColorTheme, followSystemTheme: settings.followSystemTheme === true };
}

export function effectiveColorTheme(settings: ThemePreferences, systemDark: boolean): ColorTheme {
  const value = normalizeThemePreferences(settings);
  return value.followSystemTheme ? systemDark ? 'night' : value.dayColorTheme : value.colorTheme;
}
