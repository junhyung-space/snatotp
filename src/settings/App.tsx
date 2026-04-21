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
  const [unlockPassword, setUnlockPassword] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<FeedbackMessage | null>(null);
  const [securityFormMode, setSecurityFormMode] = useState<SecurityFormMode>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setCurrentPassword("");
    setNextPassword("");
    setConfirmPassword("");
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
      const nextState = await repository.unlock(unlockPassword);
      setSecurityState(nextState);
      setUnlockPassword("");
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

    if (!nextPassword) {
      setSecurityMessage(createErrorMessage(new Error("Enter a password"), "Protection not enabled"));
      return;
    }

    if (nextPassword !== confirmPassword) {
      setSecurityMessage(createErrorMessage(new Error("Passwords do not match"), "Protection not enabled"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      const nextState = await repository.enableProtection(nextPassword);
      setSecurityState(nextState);
      setEntryCount(0);
      setMessage({
        kind: "warning",
        text: "Password protection enabled"
      });
      resetSecurityForm();
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Protection not enabled"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function submitChangePassword() {
    if (securityBusy) {
      return;
    }

    if (!currentPassword || !nextPassword) {
      setSecurityMessage(createErrorMessage(new Error("Enter both current and new passwords"), "Password not changed"));
      return;
    }

    if (nextPassword !== confirmPassword) {
      setSecurityMessage(createErrorMessage(new Error("Passwords do not match"), "Password not changed"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      await repository.changePassword(currentPassword, nextPassword);
      await refreshState();
      resetSecurityForm();
      setMessage({
        kind: "success",
        text: "Password updated"
      });
    } catch (error) {
      setSecurityMessage(createErrorMessage(error, "Password not changed"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function submitDisableProtection() {
    if (securityBusy) {
      return;
    }

    if (!currentPassword) {
      setSecurityMessage(createErrorMessage(new Error("Enter your current password"), "Protection not removed"));
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);

    try {
      await repository.disableProtection(currentPassword);
      await refreshState();
      resetSecurityForm();
      setMessage({
        kind: "warning",
        text: "Password protection removed"
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
          <h1>Unlock Snap OTP</h1>
          <p className="settings-copy">
            Your accounts are locked. Enter your password to continue.
          </p>

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUnlock();
            }}
          >
            <label className="settings-field">
              <span>Password</span>
              <input
                aria-label="Password"
                autoFocus
                type="password"
                value={unlockPassword}
                onChange={(event) => {
                  setUnlockPassword(event.currentTarget.value);
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
                title="Saved accounts"
                description={`${entryCount} ${entryCount === 1 ? "account saved" : "accounts saved"}`}
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
                title="Card size"
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
                title="Delete all accounts"
                description="Delete all saved accounts from this browser profile."
                tone="danger"
                actions={
                  <button
                    className="settings-danger-button"
                    type="button"
                    onClick={() => setDeleteAllDialogOpen(true)}
                  >
                    Delete all accounts
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
              <p>Add accounts from QR images or authentication links.</p>
            </header>
            <ImportSection repository={repository} onImportSaved={() => refreshState()} />
          </section>
        ) : null}

        {activeSection === "protection" ? (
          <section className="settings-section">
            <header className="settings-section-header">
              <h2>Protection</h2>
              <p>Add a password to protect your accounts and keep them locked when Snap OTP is closed.</p>
            </header>

            <ul aria-label="Protection settings" className="settings-list">
              <SettingsRow
                title="Password protection"
                description="Protects your saved accounts with a password. Removing protection disables the lock screen."
                trailing={
                  <span className={securityState.protectionEnabled ? "settings-status-pill protected" : "settings-status-pill"}>
                    {securityState.protectionEnabled ? "Protected" : "Not protected"}
                  </span>
                }
              />

              {securityFormMode === null && !securityState.protectionEnabled ? (
                <SettingsRow
                  title="Enable protection"
                  description="Add a password to protect all saved accounts."
                  actions={
                    <button className="settings-primary-button" type="button" onClick={() => setSecurityFormMode("set")}>
                      Set password
                    </button>
                  }
                />
              ) : null}

              {securityFormMode === null && securityState.protectionEnabled ? (
                <>
                  <SettingsRow
                    title="Change password"
                    description="Update your protection password."
                    actions={
                      <button className="settings-secondary-button" type="button" onClick={() => setSecurityFormMode("change")}>
                        Change password
                      </button>
                    }
                  />

                  <SettingsRow
                    title="Remove password"
                    description="Remove password protection from your accounts."
                    tone="danger"
                    actions={
                      <button className="settings-danger-button" type="button" onClick={() => setSecurityFormMode("remove")}>
                        Remove password
                      </button>
                    }
                  />

                  <SettingsRow
                    title="Lock now"
                    description="Lock your accounts now without waiting."
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
                <h3>Set password</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>New password</span>
                    <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Confirm new password</span>
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
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
                <h3>Change password</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Current password</span>
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>New password</span>
                    <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.currentTarget.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Confirm new password</span>
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
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
                  <button className="settings-primary-button" disabled={securityBusy} type="button" onClick={() => void submitChangePassword()}>
                    {securityBusy ? "Updating…" : "Update password"}
                  </button>
                </div>
              </article>
            ) : null}

            {securityFormMode === "remove" ? (
              <article className="settings-form-card settings-form-card-danger">
                <h3>Remove password</h3>
                <div className="settings-form-grid">
                  <label className="settings-field">
                    <span>Current password</span>
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.currentTarget.value)} />
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
                    {securityBusy ? "Removing…" : "Remove password"}
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
              <p>Export your saved accounts and preferences, then restore them later.</p>
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
                description="Add accounts from a backup file. Duplicate accounts are skipped."
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
              <p>Version info, support, and project links.</p>
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
            <p className="settings-kicker">Delete accounts</p>
            <h2 id="delete-all-entries-title">Delete all accounts</h2>
            <p className="settings-copy">
              This removes every saved account from this browser profile. Password protection settings stay as-is, but the saved accounts and secrets will be deleted.
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
                Delete all accounts permanently
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
