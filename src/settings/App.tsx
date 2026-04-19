import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { exportBackup, restoreBackup } from "../shared/backup";
import { createErrorMessage, type FeedbackMessage } from "../shared/feedback";
import { ImportSection } from "../import/App";
import {
  CLIPBOARD_CLEAR_OPTIONS,
  DENSITY_OPTIONS,
  type AppPreferences,
  type AppPreferencesRepository
} from "../shared/preferences";
import type { OtpRepository, OtpSecurityState } from "../shared/storage";
import "./styles.css";

type SettingsAppProps = {
  repository: OtpRepository;
  preferencesRepository: AppPreferencesRepository;
  initialSection?: SettingsSection;
};

type SettingsSection = "general" | "import" | "protection" | "backup" | "about";
type SecurityFormMode = "set" | "change" | "remove" | null;

const DEFAULT_SECURITY_STATE: OtpSecurityState = {
  protectionEnabled: false,
  locked: false,
  autoLockMs: 30 * 60 * 1000
};

const SECTION_OPTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "import", label: "Import" },
  { id: "protection", label: "Protection" },
  { id: "backup", label: "Backup & Restore" },
  { id: "about", label: "About" }
];

function SettingsRow({
  title,
  description,
  actions,
  href,
  tone = "default",
  trailing
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  href?: string;
  tone?: "default" | "danger";
  trailing?: ReactNode;
}) {
  const rowClassName = tone === "danger" ? "settings-row settings-row-danger" : "settings-row";

  return (
    <li className={href ? `${rowClassName} settings-row-linkable` : rowClassName}>
      {href ? (
        <a className="settings-row-link" href={href} target="_blank" rel="noreferrer">
          <div className="settings-row-copy">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        </a>
      ) : (
        <>
          <div className="settings-row-copy">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <div className="settings-row-actions">
            {trailing}
            {actions}
          </div>
        </>
      )}
    </li>
  );
}

function getManifestVersion() {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "dev";
  }
}

async function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SettingsApp({ repository, preferencesRepository, initialSection = "general" }: SettingsAppProps) {
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [securityState, setSecurityState] = useState<OtpSecurityState>(DEFAULT_SECURITY_STATE);
  const [entryCount, setEntryCount] = useState(0);
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<FeedbackMessage | null>(null);
  const [securityFormMode, setSecurityFormMode] = useState<SecurityFormMode>(null);
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [nextPassphrase, setNextPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);

  const version = useMemo(() => getManifestVersion(), []);

  async function refreshState() {
    const nextSecurityState = await repository.getSecurityState();
    const nextPreferences = await preferencesRepository.get();

    setSecurityState(nextSecurityState);
    setPreferences(nextPreferences);

    if (nextSecurityState.protectionEnabled && nextSecurityState.locked) {
      setEntryCount(0);
      return;
    }

    setEntryCount((await repository.list()).length);
  }

  useEffect(() => {
    void refreshState();
  }, [preferencesRepository, repository]);

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    const timer = window.setTimeout(() => setMessage(null), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  function resetSecurityForm() {
    setSecurityFormMode(null);
    setCurrentPassphrase("");
    setNextPassphrase("");
    setConfirmPassphrase("");
    setSecurityMessage(null);
    setSecurityBusy(false);
  }

  async function updatePreferences(next: Partial<AppPreferences>) {
    const updated = await preferencesRepository.set(next);
    setPreferences(updated);
    setMessage({
      kind: "success",
      text: "Preferences updated"
    });
  }

  async function submitUnlock() {
    if (securityBusy) {
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      const nextState = await repository.unlock(unlockPassphrase);
      setSecurityState(nextState);
      setUnlockPassphrase("");
      setPreferences(await preferencesRepository.get());

      if (nextState.protectionEnabled && nextState.locked) {
        setEntryCount(0);
      } else {
        setEntryCount((await repository.list()).length);
      }
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Unlock failed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function submitEnableProtection() {
    if (securityBusy) {
      return;
    }

    if (!nextPassphrase) {
      setSecurityMessage(createErrorMessage(new Error("Enter a passphrase"), "Protection not enabled"));
      return;
    }

    if (nextPassphrase !== confirmPassphrase) {
      setSecurityMessage(createErrorMessage(new Error("Passphrases do not match"), "Protection not enabled"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      const nextState = await repository.enableProtection(nextPassphrase);
      setSecurityState(nextState);
      setEntryCount(0);
      setMessage({
        kind: "warning",
        text: "Passphrase protection enabled"
      });
      resetSecurityForm();
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Protection not enabled"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function submitChangePassphrase() {
    if (securityBusy) {
      return;
    }

    if (!currentPassphrase || !nextPassphrase) {
      setSecurityMessage(createErrorMessage(new Error("Enter both current and new passphrases"), "Passphrase not changed"));
      return;
    }

    if (nextPassphrase !== confirmPassphrase) {
      setSecurityMessage(createErrorMessage(new Error("Passphrases do not match"), "Passphrase not changed"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      await repository.changePassphrase(currentPassphrase, nextPassphrase);
      await refreshState();
      resetSecurityForm();
      setMessage({
        kind: "success",
        text: "Passphrase updated"
      });
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Passphrase not changed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function submitDisableProtection() {
    if (securityBusy) {
      return;
    }

    if (!currentPassphrase) {
      setSecurityMessage(createErrorMessage(new Error("Enter your current passphrase"), "Protection not removed"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      await repository.disableProtection(currentPassphrase);
      await refreshState();
      resetSecurityForm();
      setMessage({
        kind: "warning",
        text: "Passphrase protection removed"
      });
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Protection not removed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function handleLockNow() {
    if (securityBusy) {
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      const nextState = await repository.lock();
      setSecurityState(nextState);
      setEntryCount(0);
      setMessage({
        kind: "warning",
        text: "Vault locked"
      });
      resetSecurityForm();
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Unable to lock"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function handleExportBackup() {
    try {
      const backup = await exportBackup({
        repository,
        preferencesRepository
      });

      const dateLabel = backup.exportedAt.slice(0, 10);
      await downloadJsonFile(backup, `snapotp-backup-${dateLabel}.json`);
      setMessage({
        kind: "success",
        text: "Backup exported"
      });
    } catch (error) {
      setMessage(createErrorMessage(error, "Backup failed"));
    }
  }

  async function handleRestoreFile(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const result = await restoreBackup(await file.text(), {
        repository,
        preferencesRepository
      });

      await refreshState();
      setMessage({
        kind: result.duplicateCount > 0 ? "warning" : "success",
        text:
          result.duplicateCount > 0
            ? `Restore finished: ${result.addedCount} added, ${result.duplicateCount} skipped`
            : `Restore finished: ${result.addedCount} added`
      });
    } catch (error) {
      setMessage(createErrorMessage(error, "Restore failed"));
    } finally {
      if (restoreInputRef.current) {
        restoreInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteAllEntries() {
    try {
      await repository.deleteAll();
      await refreshState();
      setDeleteAllDialogOpen(false);
      setMessage({
        kind: "warning",
        text: "All entries deleted"
      });
    } catch (error) {
      setMessage(createErrorMessage(error, "Delete failed"));
    }
  }

  if (preferences === null) {
    return <main className="settings-shell settings-loading">Loading settings…</main>;
  }

  if (securityState.protectionEnabled && securityState.locked) {
    return (
      <main className="settings-shell settings-locked-shell">
        <section className="settings-locked-panel">
          <p className="settings-kicker">Protected</p>
          <h1>Unlock your OTP vault</h1>
          <p className="settings-copy">
            Passphrase protection is enabled. Unlock Snap OTP before using import, backup, or protection settings.
          </p>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUnlock();
            }}
          >
            <label className="settings-field">
              <span>Passphrase</span>
              <input
                aria-label="Passphrase"
                autoFocus
                type="password"
                value={unlockPassphrase}
                onChange={(event) => {
                  setUnlockPassphrase(event.currentTarget.value);
                  setSecurityMessage(null);
                }}
              />
            </label>

            {securityMessage ? (
              <p className={`settings-inline-message ${securityMessage.kind}`} role={securityMessage.kind === "error" ? "alert" : "status"}>
                {securityMessage.text}
              </p>
            ) : null}

            <div className="settings-button-row">
              <button className="settings-primary-button" disabled={securityBusy} type="submit">
                {securityBusy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-header">
          <p className="settings-kicker">Snap OTP</p>
          <h1>Settings</h1>
        </div>

        <nav aria-label="Settings sections" className="settings-nav">
          {SECTION_OPTIONS.map((section) => (
            <button
              key={section.id}
              aria-pressed={activeSection === section.id}
              className={activeSection === section.id ? "settings-nav-button active" : "settings-nav-button"}
              type="button"
              onClick={() => {
                setActiveSection(section.id);
                setDeleteAllDialogOpen(false);
                setSecurityMessage(null);
              }}
            >
              {section.label}
            </button>
          ))}
        </nav>

      </aside>

      <section className="settings-content">
        {message ? (
          <p className={`settings-inline-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}

        {activeSection === "general" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>General</h2>
              <p>Everyday preferences and storage status.</p>
            </header>

            <ul aria-label="General settings" className="settings-list">
              <SettingsRow
                title="Chrome sync storage"
                description={`${entryCount} item stored`}
                trailing={
                  <span className="settings-status-pill">
                    {securityState.protectionEnabled ? "Protected entries" : "Ready"}
                  </span>
                }
              />

              <SettingsRow
                title="Clipboard clear"
                description="Automatically clear copied OTP codes after a delay."
                actions={
                  <div className="settings-segmented-row">
                    {CLIPBOARD_CLEAR_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        aria-pressed={preferences.clipboardClearSeconds === option.value}
                        className={preferences.clipboardClearSeconds === option.value ? "settings-chip active" : "settings-chip"}
                        type="button"
                        onClick={() => void updatePreferences({ clipboardClearSeconds: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                }
              />

              <SettingsRow
                title="Popup density"
                description="Control how much information fits inside the extension popup."
                actions={
                  <div className="settings-segmented-row">
                    {DENSITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        aria-pressed={preferences.cardDensity === option.value}
                        className={preferences.cardDensity === option.value ? "settings-chip active" : "settings-chip"}
                        type="button"
                        onClick={() => void updatePreferences({ cardDensity: option.value })}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                }
              />

              <SettingsRow
                title="Delete all entries"
                description="Remove every saved OTP from this browser profile."
                tone="danger"
                actions={
                  <button
                    className="settings-danger-button"
                    type="button"
                    onClick={() => setDeleteAllDialogOpen(true)}
                  >
                    Delete all entries
                  </button>
                }
              />
            </ul>
          </section>
        ) : null}

        {activeSection === "import" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>Import</h2>
              <p>Bring OTP entries into Snap OTP without using in-page overlays.</p>
            </header>
            <ImportSection repository={repository} onImportSaved={() => refreshState()} />
          </section>
        ) : null}

        {activeSection === "protection" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>Protection</h2>
              <p>Passphrase protection</p>
            </header>

            <ul aria-label="Protection settings" className="settings-list">
              <SettingsRow
                title="Passphrase protection"
                description="Optional passphrase protection encrypts saved OTP data. Removing it restores standard Chrome sync storage behavior."
                trailing={
                  <span className={securityState.protectionEnabled ? "settings-status-pill protected" : "settings-status-pill"}>
                    {securityState.protectionEnabled ? "Protected" : "Standard mode"}
                  </span>
                }
              />

              {securityFormMode === null && !securityState.protectionEnabled ? (
                <SettingsRow
                  title="Enable protection"
                  description="Turn on passphrase protection for all saved OTP entries."
                  actions={
                    <button className="settings-primary-button" type="button" onClick={() => setSecurityFormMode("set")}>
                      Set passphrase
                    </button>
                  }
                />
              ) : null}

              {securityFormMode === null && securityState.protectionEnabled ? (
                <>
                  <SettingsRow
                    title="Change passphrase"
                    description="Re-encrypt saved entries with a new passphrase."
                    actions={
                      <button className="settings-secondary-button" type="button" onClick={() => setSecurityFormMode("change")}>
                        Change passphrase
                      </button>
                    }
                  />

                  <SettingsRow
                    title="Remove passphrase"
                    description="Return to standard Chrome sync storage behavior."
                    tone="danger"
                    actions={
                      <button className="settings-danger-button" type="button" onClick={() => setSecurityFormMode("remove")}>
                        Remove passphrase
                      </button>
                    }
                  />

                  <SettingsRow
                    title="Lock now"
                    description="Clear the current unlocked session immediately."
                    actions={
                      <button className="settings-warning-button" type="button" onClick={() => void handleLockNow()}>
                        Lock now
                      </button>
                    }
                  />
                </>
              ) : null}
            </ul>

            {securityFormMode === null ? null : (
              <div className="settings-form-panel">
            {securityFormMode === "set" ? (
              <article className="settings-form-card">
                <h3>Set passphrase</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>New passphrase</span>
                    <input type="password" value={nextPassphrase} onChange={(event) => setNextPassphrase(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Confirm new passphrase</span>
                    <input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.currentTarget.value)} />
                  </label>
                </div>
                {securityMessage ? (
                  <p className={`settings-inline-message ${securityMessage.kind}`} role={securityMessage.kind === "error" ? "alert" : "status"}>
                    {securityMessage.text}
                  </p>
                ) : null}
                <div className="settings-button-row">
                  <button className="settings-secondary-button" type="button" onClick={() => resetSecurityForm()}>
                    Cancel
                  </button>
                  <button className="settings-primary-button" disabled={securityBusy} type="button" onClick={() => void submitEnableProtection()}>
                    {securityBusy ? "Encrypting…" : "Enable protection"}
                  </button>
                </div>
              </article>
            ) : null}

            {securityFormMode === "change" ? (
              <article className="settings-form-card">
                <h3>Change passphrase</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Current passphrase</span>
                    <input type="password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>New passphrase</span>
                    <input type="password" value={nextPassphrase} onChange={(event) => setNextPassphrase(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Confirm new passphrase</span>
                    <input type="password" value={confirmPassphrase} onChange={(event) => setConfirmPassphrase(event.currentTarget.value)} />
                  </label>
                </div>
                {securityMessage ? (
                  <p className={`settings-inline-message ${securityMessage.kind}`} role={securityMessage.kind === "error" ? "alert" : "status"}>
                    {securityMessage.text}
                  </p>
                ) : null}
                <div className="settings-button-row">
                  <button className="settings-secondary-button" type="button" onClick={() => resetSecurityForm()}>
                    Cancel
                  </button>
                  <button className="settings-primary-button" disabled={securityBusy} type="button" onClick={() => void submitChangePassphrase()}>
                    {securityBusy ? "Updating…" : "Update passphrase"}
                  </button>
                </div>
              </article>
            ) : null}

            {securityFormMode === "remove" ? (
              <article className="settings-form-card settings-form-card-danger">
                <h3>Remove passphrase</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Current passphrase</span>
                    <input type="password" value={currentPassphrase} onChange={(event) => setCurrentPassphrase(event.currentTarget.value)} />
                  </label>
                </div>
                {securityMessage ? (
                  <p className={`settings-inline-message ${securityMessage.kind}`} role={securityMessage.kind === "error" ? "alert" : "status"}>
                    {securityMessage.text}
                  </p>
                ) : null}
                <div className="settings-button-row">
                  <button className="settings-secondary-button" type="button" onClick={() => resetSecurityForm()}>
                    Cancel
                  </button>
                  <button className="settings-danger-button" disabled={securityBusy} type="button" onClick={() => void submitDisableProtection()}>
                    {securityBusy ? "Removing…" : "Remove passphrase"}
                  </button>
                </div>
              </article>
            ) : null}
              </div>
            )}
          </section>
        ) : null}

        {activeSection === "backup" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>Backup &amp; Restore</h2>
              <p>Export entries and preferences, then merge them back later.</p>
            </header>

            <ul aria-label="Backup settings" className="settings-list">
              <SettingsRow
                title="Export backup"
                description="Download a JSON backup containing saved entries and app preferences."
                actions={
                  <button className="settings-primary-button" type="button" onClick={() => void handleExportBackup()}>
                    Export backup
                  </button>
                }
              />

              <SettingsRow
                title="Restore backup"
                description="Merge a backup file into the current profile. Existing duplicates are skipped."
                actions={
                  <>
                    <button className="settings-secondary-button" type="button" onClick={() => restoreInputRef.current?.click()}>
                      Choose backup file
                    </button>
                    <input
                      ref={restoreInputRef}
                      accept="application/json"
                      className="settings-hidden-input"
                      type="file"
                      onChange={(event) => void handleRestoreFile(event.currentTarget.files?.[0] ?? null)}
                    />
                  </>
                }
              />
            </ul>
          </section>
        ) : null}

        {activeSection === "about" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>About</h2>
              <p>Release info and project links.</p>
              <p className="settings-meta-text">{`Version ${version}`}</p>
            </header>

            <ul aria-label="About settings" className="settings-list">
              <SettingsRow
                title="GitHub"
                description="Source code and release history."
                href="https://github.com/junhyung-space/snatotp"
              />
              <SettingsRow
                title="Issues / Support"
                description="Bug reports, requests, and support."
                href="https://github.com/junhyung-space/snatotp/issues"
              />
              <SettingsRow
                title="Privacy Policy"
                description="Data handling and permission details."
                href="https://junhyung-space.github.io/snatotp/privacy/"
              />
            </ul>
          </section>
        ) : null}
      </section>

      {deleteAllDialogOpen ? (
        <div
          aria-labelledby="delete-all-entries-title"
          aria-modal="true"
          className="settings-dialog-backdrop"
          role="dialog"
        >
          <section className="settings-dialog">
            <p className="settings-kicker">Delete entries</p>
            <h2 id="delete-all-entries-title">Delete all entries</h2>
            <p className="settings-copy">
              This removes every saved OTP entry from this browser profile. Passphrase protection settings stay as-is, but the saved accounts and secrets will be deleted.
            </p>

            <div className="settings-button-row">
              <button
                className="settings-secondary-button"
                type="button"
                onClick={() => setDeleteAllDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="settings-danger-button"
                type="button"
                onClick={() => void handleDeleteAllEntries()}
              >
                Delete all entries permanently
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
