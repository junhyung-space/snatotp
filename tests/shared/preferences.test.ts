import { beforeEach, describe, expect, it } from "vitest";
import { createAppPreferencesRepository, DEFAULT_APP_PREFERENCES } from "../../src/shared/preferences";

type StoredShape = Record<string, unknown>;

function createFakeStorage() {
  let state: StoredShape = {};

  return {
    area: {
      async get(key: string) {
        return { [key]: state[key as keyof StoredShape] };
      },
      async set(next: StoredShape) {
        state = { ...state, ...next };
      },
      async remove(key: string | string[]) {
        const keys = Array.isArray(key) ? key : [key];
        for (const item of keys) {
          delete state[item];
        }
      }
    },
    read() {
      return state;
    }
  };
}

describe("app preferences repository", () => {
  let storage = createFakeStorage();

  beforeEach(() => {
    storage = createFakeStorage();
  });

  it("returns defaults when no preferences are stored", async () => {
    const repository = createAppPreferencesRepository(storage.area);

    await expect(repository.get()).resolves.toEqual(DEFAULT_APP_PREFERENCES);
  });

  it("merges partial preference updates and reads them back", async () => {
    const repository = createAppPreferencesRepository(storage.area);

    await repository.set({
      cardDensity: "compact"
    });

    await repository.set({
      clipboardClearSeconds: 30
    });

    await expect(repository.get()).resolves.toEqual({
      clipboardClearSeconds: 30,
      cardDensity: "compact"
    });
    expect(JSON.stringify(storage.read())).toContain("compact");
    expect(JSON.stringify(storage.read())).toContain("30");
  });
});
