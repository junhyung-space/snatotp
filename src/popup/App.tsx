import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { START_CAPTURE_FLOW_MESSAGE } from "../background/messages";
import { createErrorMessage, type FeedbackMessage } from "../shared/feedback";
import { formatOtpCode, generateOtpCode, getSecondsRemaining, MARKER_COLOR_OPTIONS } from "../shared/otp";
import {
  createChromeAppPreferencesRepository,
  DEFAULT_APP_PREFERENCES,
  type AppPreferences,
  type AppPreferencesRepository
} from "../shared/preferences";
import type { OtpRepository, OtpSecurityState } from "../shared/storage";
import type { OtpEntry } from "../shared/types";
import "./styles.css";

type AppProps = {
  repository: OtpRepository;
  preferencesRepository?: AppPreferencesRepository;
  now?: () => number;
  copyText?: (value: string) => Promise<void> | void;
  startCapture?: () => Promise<void> | void;
  openSettingsPage?: () => Promise<void> | void;
  closePopup?: () => void;
};

const COLOR_OPTIONS = MARKER_COLOR_OPTIONS;

const DEFAULT_SECURITY_STATE: OtpSecurityState = {
  protectionEnabled: false,
  locked: false,
  autoLockMs: 30 * 60 * 1000
};

function createFallbackPreferencesRepository(): AppPreferencesRepository {
  let preferences = DEFAULT_APP_PREFERENCES;

  return {
    async get() {
      return preferences;
    },
    async set(next) {
      preferences = {
        ...preferences,
        ...next
      };

      return preferences;
    }
  };
}

function getMarkerTextColor(color: string) {
  const hex = color.replace("#", "");

  if (hex.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 150 ? "#132033" : "#ffffff";
}

function CaptureIcon() {
  return (
    <svg aria-hidden="true" className="action-icon" viewBox="0 0 24 24">
      <path
        d="M8 4H6a2 2 0 0 0-2 2v2m12-4h2a2 2 0 0 1 2 2v2M8 20H6a2 2 0 0 1-2-2v-2m12 4h2a2 2 0 0 0 2-2v-2M9 9h6v6H9z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="action-icon" viewBox="0 0 24 24">
      <path
        d="M12 9.25A2.75 2.75 0 1 0 12 14.75 2.75 2.75 0 1 0 12 9.25zM4.75 13.25v-2.5l2-.5c.15-.48.34-.93.58-1.35l-1.12-1.75 1.77-1.77 1.74 1.12c.43-.24.88-.43 1.36-.58l.5-2h2.5l.5 2c.47.15.92.34 1.35.58l1.75-1.12 1.77 1.77-1.12 1.75c.24.42.43.87.58 1.35l2 .5v2.5l-2 .5c-.15.47-.34.92-.58 1.35l1.12 1.75-1.77 1.77-1.75-1.12c-.43.24-.88.43-1.35.58l-.5 2h-2.5l-.5-2a7.2 7.2 0 0 1-1.36-.58l-1.74 1.12-1.77-1.77 1.12-1.75a7.2 7.2 0 0 1-.58-1.35z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function EntryMarker({ entry }: { entry: OtpEntry }) {
  const initials = entry.serviceName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      aria-label={`${entry.serviceName} color marker`}
      className="entry-marker"
      style={
        {
          background: entry.markerColor,
          color: getMarkerTextColor(entry.markerColor)
        } satisfies CSSProperties
      }
    >
      {initials || "OT"}
    </span>
  );
}

function requestStartCapture() {
  return chrome.runtime.sendMessage({
    type: START_CAPTURE_FLOW_MESSAGE
  }).then((response: { kind?: string; message?: string } | undefined) => {
    if (!response || response.kind !== "started") {
      throw new Error(response?.message ?? "Capture failed");
    }
  });
}

function requestOpenSettingsPage() {
  return chrome.runtime.openOptionsPage();
}

function useClock(now: () => number) {
  const [timestamp, setTimestamp] = useState(() => now());

  useEffect(() => {
    setTimestamp(now());
    const timer = window.setInterval(() => {
      setTimestamp(now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [now]);

  return timestamp;
}

type TimerUrgency = "calm" | "warning" | "urgent";

function getTimerUrgency(remaining: number, period: number): TimerUrgency {
  const urgentThreshold = Math.min(9, period);
  const warningThreshold = Math.min(19, period);

  if (remaining <= urgentThreshold) {
    return "urgent";
  }

  if (remaining <= warningThreshold) {
    return "warning";
  }

  return "calm";
}

export function App({
  repository,
  preferencesRepository,
  now = () => Date.now(),
  copyText = (value) => navigator.clipboard.writeText(value),
  startCapture = requestStartCapture,
  openSettingsPage = requestOpenSettingsPage,
  closePopup = () => window.close()
}: AppProps) {
  const resolvedPreferencesRepository = useMemo(
    () =>
      preferencesRepository ??
      (typeof chrome !== "undefined"
        ? createChromeAppPreferencesRepository()
        : createFallbackPreferencesRepository()),
    [preferencesRepository]
  );
  const [entries, setEntries] = useState<OtpEntry[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const [renameEntryId, setRenameEntryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [colorEntryId, setColorEntryId] = useState<string | null>(null);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragOverEntryId, setDragOverEntryId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [securityState, setSecurityState] = useState<OtpSecurityState>(DEFAULT_SECURITY_STATE);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<FeedbackMessage | null>(null);

  const timestamp = useClock(now);
  const locked = securityState.locked;
  const renameEntry = entries.find((entry) => entry.id === renameEntryId) ?? null;
  const deleteEntry = entries.find((entry) => entry.id === deleteEntryId) ?? null;
  const colorEntry = entries.find((entry) => entry.id === colorEntryId) ?? null;

  async function refreshAppState() {
    const [nextSecurityState, loadedEntries] = await Promise.all([
      repository.getSecurityState(),
      repository.list()
    ]);
    setSecurityState(nextSecurityState);
    setEntries(loadedEntries);
  }

  useEffect(() => {
    let active = true;

    Promise.all([
      repository.getSecurityState(),
      repository.list(),
      resolvedPreferencesRepository.get()
    ]).then(([nextSecurityState, loadedEntries, nextPreferences]) => {
      if (!active) {
        return;
      }

      setSecurityState(nextSecurityState);
      setEntries(loadedEntries);
      setPreferences(nextPreferences);
    });

    return () => {
      active = false;
    };
  }, [repository, resolvedPreferencesRepository]);

  useEffect(() => {
    if (!menuEntryId) {
      return undefined;
    }

    function closeMenuOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Element && target.closest("[data-entry-menu-surface='true']")) {
        return;
      }

      setMenuEntryId(null);
    }

    document.addEventListener("pointerdown", closeMenuOnOutsidePointerDown);

    return () => {
      document.removeEventListener("pointerdown", closeMenuOnOutsidePointerDown);
    };
  }, [menuEntryId]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function handleCopy(entry: OtpEntry) {
    const code = generateOtpCode(entry, timestamp);
    await copyText(code);

    if (preferences.clipboardClearSeconds > 0) {
      window.setTimeout(() => {
        void Promise.resolve(copyText("")).catch(() => undefined);
      }, preferences.clipboardClearSeconds * 1000);
    }

    setCopiedId(entry.id);
    setMessage(null);

    window.setTimeout(() => {
      setCopiedId((current) => (current === entry.id ? null : current));
    }, 1200);
  }

  async function handleCapture() {
    try {
      await startCapture();
      setMessage(null);
      closePopup();
    } catch (error) {
      setMessage(createErrorMessage(error, "Capture failed"));
    }
  }

  async function handleOpenSettings() {
    try {
      await openSettingsPage();
      closePopup();
    } catch (error) {
      setMessage(createErrorMessage(error, "Settings unavailable"));
    }
  }

  async function submitRename(entryId: string) {
    const nextValue = renameValue.trim().slice(0, 50);

    if (!nextValue) {
      return;
    }

    await repository.rename(entryId, nextValue);
    await refreshAppState();
    setRenameEntryId(null);
    setRenameValue("");
    setMenuEntryId(null);
  }

  async function confirmDelete(entryId: string) {
    await repository.delete(entryId);
    await refreshAppState();
    setDeleteEntryId(null);
    setMenuEntryId(null);
  }

  async function applyColor(entryId: string, markerColor: string) {
    await repository.updateColor?.(entryId, markerColor);
    await refreshAppState();
    setColorEntryId(null);
    setMenuEntryId(null);
  }

  async function reorderEntries(draggedId: string | null, targetId: string) {
    if (!draggedId || draggedId === targetId) {
      return;
    }

    const nextIds = entries.map((entry) => entry.id);
    const fromIndex = nextIds.indexOf(draggedId);
    const toIndex = nextIds.indexOf(targetId);

    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, movedId);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    setEntries(
      nextIds.flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      })
    );
    await repository.reorder?.(nextIds);
    await refreshAppState();
  }

  async function submitUnlock() {
    if (securityBusy) {
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      await repository.unlock(unlockPassphrase);
      await refreshAppState();
      setUnlockPassphrase("");
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Unlock failed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  if (locked) {
    return (
      <main className="popup-shell locked-shell">
        <header className="popup-header locked-header">
          <div className="popup-title">
            <h1>Snap OTP</h1>
          </div>
        </header>

        <section className="locked-panel">
          <p className="dialog-eyebrow">Protected</p>
          <h2 className="locked-title">Unlock Snap OTP</h2>
          <p className="locked-copy">
            Your accounts are locked. Enter your password to continue.
          </p>

          <form
            className="dialog-form locked-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUnlock();
            }}
          >
            <input
              aria-label="Password"
              autoFocus
              className="dialog-input"
              placeholder="Enter password"
              type="password"
              value={unlockPassphrase}
              onChange={(event) => {
                setUnlockPassphrase(event.currentTarget.value);
                setSecurityMessage(null);
              }}
            />
            {securityMessage ? (
              <p className={`import-message ${securityMessage.kind}`} role={securityMessage.kind === "error" ? "alert" : "status"}>
                {securityMessage.text}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button className="dialog-primary" disabled={securityBusy} type="submit">
                {securityBusy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>

          <p className="locked-footer">Snap OTP locks automatically after 30 minutes.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={`popup-shell density-${preferences.cardDensity}`}>
      <header className="popup-header">
        <div className="popup-title">
          <h1>Snap OTP</h1>
          {entries.length > 0 ? <span className="count-badge">{entries.length}</span> : null}
        </div>
        <section aria-label="Actions" className="action-row">
          <button
            aria-label="Scan QR code from screen"
            className="icon-button"
            type="button"
            onClick={() => void handleCapture()}
          >
            <CaptureIcon />
          </button>
          <button
            aria-label="Settings"
            className="icon-button"
            type="button"
            onClick={() => void handleOpenSettings()}
          >
            <SettingsIcon />
          </button>
        </section>
      </header>

      <section aria-label="OTP accounts" className="entry-list">
        {entries.length === 0 ? (
          <div className="empty-state">
            <strong>Add your first account</strong>
            <span>Add an account from Settings or scan a QR code on the current page.</span>
          </div>
        ) : (
          entries.map((entry) => {
            const code = generateOtpCode(entry, timestamp);
            const remaining = getSecondsRemaining(entry, timestamp);
            const timerUrgency = getTimerUrgency(remaining, entry.period);
            const copied = copiedId === entry.id;
            const menuOpen = menuEntryId === entry.id;

            return (
              <article
                className={["entry-card", dragOverEntryId === entry.id ? "drop-target" : ""].filter(Boolean).join(" ")}
                draggable
                key={entry.id}
                onDragEnd={() => {
                  setDraggedEntryId(null);
                  setDragOverEntryId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverEntryId(entry.id);
                }}
                onDragStart={() => setDraggedEntryId(entry.id)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverEntryId(null);
                  void reorderEntries(draggedEntryId, entry.id);
                }}
              >
                <div className="entry-row">
                  <button
                    aria-label={`${entry.serviceName} ${entry.accountName}`}
                    className="entry-identity"
                    type="button"
                    onClick={() => void handleCopy(entry)}
                  >
                    <EntryMarker entry={entry} />
                    <div className="entry-text">
                      <span className="service-name">{entry.serviceName}</span>
                      <span className="account-name">{entry.accountName}</span>
                    </div>
                  </button>

                  <button
                    aria-expanded={menuOpen}
                    aria-label={`More options for ${entry.serviceName}`}
                    className="menu-button"
                    data-entry-menu-surface="true"
                    type="button"
                    onClick={() => {
                      setMenuEntryId((current) => (current === entry.id ? null : entry.id));
                      setDeleteEntryId(null);
                      setRenameEntryId(null);
                      setColorEntryId(null);
                    }}
                  >
                    ⋮
                  </button>

                  <button
                    className="entry-code-row"
                    type="button"
                    onClick={() => void handleCopy(entry)}
                  >
                    <div className="entry-code-meta">
                      <span className="otp-code">{formatOtpCode(code)}</span>
                      {copied ? <span className="copied-badge">Copied</span> : null}
                    </div>
                    <span className={`timer-badge timer-badge-${timerUrgency}`}>
                      <span aria-hidden="true" className={`timer-dot timer-dot-${timerUrgency}`} />
                      <span className={`timer timer-${timerUrgency}`}>{remaining}s</span>
                    </span>
                  </button>
                </div>

                {menuOpen ? (
                  <div className="entry-menu" data-entry-menu-surface="true" role="menu">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setRenameEntryId(entry.id);
                        setRenameValue(entry.serviceName);
                        setDeleteEntryId(null);
                        setMenuEntryId(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setColorEntryId(entry.id);
                        setDeleteEntryId(null);
                        setRenameEntryId(null);
                        setMenuEntryId(null);
                      }}
                    >
                      Change color
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setDeleteEntryId(entry.id);
                        setRenameEntryId(null);
                        setColorEntryId(null);
                        setMenuEntryId(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      {message ? (
        <div className="message-toast">
          <p className={`import-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        </div>
      ) : null}

      {renameEntry ? (
        <div className="dialog-scrim">
          <section aria-labelledby="rename-dialog-title" aria-modal="true" className="entry-dialog" role="dialog">
            <p className="dialog-eyebrow">{renameEntry.serviceName}</p>
            <h2 id="rename-dialog-title">Rename</h2>
            <form
              className="dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitRename(renameEntry.id);
              }}
            >
              <input
                aria-label="Name"
                autoFocus
                className="dialog-input"
                maxLength={50}
                value={renameValue}
                onChange={(event) => setRenameValue(event.currentTarget.value.slice(0, 50))}
              />
              <div className="dialog-actions">
                <button
                  className="dialog-secondary"
                  type="button"
                  onClick={() => {
                    setRenameEntryId(null);
                    setRenameValue("");
                  }}
                >
                  Cancel
                </button>
                <button className="dialog-primary" type="submit">
                  Save
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {deleteEntry ? (
        <div className="dialog-scrim">
          <section aria-labelledby="delete-dialog-title" aria-modal="true" className="entry-dialog" role="dialog">
            <p className="dialog-eyebrow">{deleteEntry.serviceName}</p>
            <h2 id="delete-dialog-title">Delete</h2>
            <p className="dialog-copy">
              Remove <strong>{deleteEntry.serviceName}</strong> from this browser?
            </p>
            <div className="dialog-actions">
              <button className="dialog-secondary" type="button" onClick={() => setDeleteEntryId(null)}>
                Cancel
              </button>
              <button className="dialog-danger" type="button" onClick={() => void confirmDelete(deleteEntry.id)}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {colorEntry ? (
        <div className="dialog-scrim">
          <section aria-labelledby="color-dialog-title" aria-modal="true" className="entry-dialog" role="dialog">
            <p className="dialog-eyebrow">{colorEntry.serviceName}</p>
            <h2 id="color-dialog-title">Change color</h2>
            <div className="color-grid">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  aria-label={option.label}
                  className="color-swatch"
                  style={{ background: option.value }}
                  type="button"
                  onClick={() => void applyColor(colorEntry.id, option.value)}
                />
              ))}
            </div>
            <div className="dialog-actions">
              <button className="dialog-secondary" type="button" onClick={() => setColorEntryId(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
