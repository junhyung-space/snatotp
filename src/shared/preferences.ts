import type { StorageAreaLike } from "./storage";

export const APP_PREFERENCES_KEY = "preferences";

export const CLIPBOARD_CLEAR_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "15 seconds", value: 15 },
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 }
] as const;

export const DENSITY_OPTIONS = [
  { label: "Comfortable", value: "comfortable" },
  { label: "Compact", value: "compact" }
] as const;

export type ClipboardClearSeconds = (typeof CLIPBOARD_CLEAR_OPTIONS)[number]["value"];
export type CardDensity = (typeof DENSITY_OPTIONS)[number]["value"];

export type AppPreferences = {
  clipboardClearSeconds: ClipboardClearSeconds;
  cardDensity: CardDensity;
};

export type AppPreferencesRepository = {
  get(): Promise<AppPreferences>;
  set(next: Partial<AppPreferences>): Promise<AppPreferences>;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  clipboardClearSeconds: 0,
  cardDensity: "comfortable"
};

export function normalizeAppPreferences(value: unknown): AppPreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_APP_PREFERENCES;
  }

  const candidate = value as Partial<AppPreferences>;
  const clipboardClearSeconds = CLIPBOARD_CLEAR_OPTIONS.some((option) => option.value === candidate.clipboardClearSeconds)
    ? candidate.clipboardClearSeconds
    : DEFAULT_APP_PREFERENCES.clipboardClearSeconds;
  const cardDensity = DENSITY_OPTIONS.some((option) => option.value === candidate.cardDensity)
    ? candidate.cardDensity
    : DEFAULT_APP_PREFERENCES.cardDensity;

  return {
    clipboardClearSeconds,
    cardDensity
  };
}

export function createAppPreferencesRepository(area: StorageAreaLike): AppPreferencesRepository {
  return {
    async get() {
      const result = await area.get(APP_PREFERENCES_KEY);
      return normalizeAppPreferences(result[APP_PREFERENCES_KEY]);
    },
    async set(next) {
      const current = await this.get();
      const merged = normalizeAppPreferences({
        ...current,
        ...next
      });

      await area.set({
        [APP_PREFERENCES_KEY]: merged
      });

      return merged;
    }
  };
}

export function createChromeAppPreferencesRepository() {
  return createAppPreferencesRepository(chrome.storage.sync as unknown as StorageAreaLike);
}
