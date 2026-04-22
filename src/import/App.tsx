import { useRef, useState } from "react";
import {
  createAddedMessage,
  createDuplicateMessage,
  createErrorMessage,
  type FeedbackMessage
} from "../shared/feedback";
import { parseOtpUri } from "../shared/otp";
import { decodeOtpUriFromFile } from "../shared/qr";
import type { OtpRepository, OtpSaveResult } from "../shared/storage";
import type { SourceType } from "../shared/types";
import "./styles.css";

type ImportSectionProps = {
  repository: OtpRepository;
  decodeUpload?: (file: File) => Promise<string>;
  onImportSaved?: () => Promise<void> | void;
};

type ImportMode = "upload" | "url";

function isSaveResult(result: Awaited<ReturnType<OtpRepository["save"]>>): result is OtpSaveResult {
  return typeof result === "object" && result !== null && "status" in result;
}

function getPastedOtpLinks(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatAccountCount(count: number) {
  return `${count} ${count === 1 ? "account" : "accounts"}`;
}

function formatLinkCount(count: number) {
  return `${count} ${count === 1 ? "link" : "links"}`;
}

function getUrlImportSummaryKind(created: number, duplicate: number, failed: number): FeedbackMessage["kind"] {
  if (failed > 0) {
    return created > 0 || duplicate > 0 ? "warning" : "error";
  }

  return duplicate > 0 ? "warning" : "success";
}

function createUrlImportSummaryMessage(created: number, duplicate: number, failed: number): FeedbackMessage {
  const parts: string[] = [];

  if (created > 0) {
    parts.push(`Added ${formatAccountCount(created)}.`);
  }

  if (duplicate > 0) {
    if (created === 0 && failed === 0) {
      parts.push(`All ${formatAccountCount(duplicate)} are already added.`);
    } else {
      parts.push(`${duplicate} already existed.`);
    }
  }

  if (failed > 0) {
    if (created === 0 && duplicate === 0) {
      parts.push("No accounts were imported.");
    }
    parts.push(`${formatLinkCount(failed)} could not be imported.`);
  }

  return {
    kind: getUrlImportSummaryKind(created, duplicate, failed),
    text: parts.join(" ")
  };
}

async function saveOtpUri(repository: OtpRepository, otpUri: string, sourceType: SourceType): Promise<OtpSaveResult> {
  const trimmedOtpUri = otpUri.trim();

  if (!trimmedOtpUri) {
    throw new Error("Paste an authentication link first");
  }

  if (!trimmedOtpUri.toLowerCase().startsWith("otpauth://")) {
    throw new Error("Paste a valid authentication link");
  }

  const entry = parseOtpUri(trimmedOtpUri, sourceType);
  const result = await repository.save(entry);

  if (isSaveResult(result)) {
    return result;
  }

  return {
    entry: result ?? entry,
    status: "created"
  };
}

export function ImportSection({
  repository,
  decodeUpload = decodeOtpUriFromFile,
  onImportSaved
}: ImportSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeMode, setActiveMode] = useState<ImportMode>("upload");
  const [otpUrl, setOtpUrl] = useState("");
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  async function importOtpUri(otpUri: string, sourceType: SourceType) {
    if (busy) {
      return;
    }

    setMessage(null);
    setBusy(true);

    try {
      const result = await saveOtpUri(repository, otpUri, sourceType);

      if (result.status === "created") {
        setMessage(createAddedMessage(result.entry.serviceName));
        if (sourceType === "url") {
          setOtpUrl("");
        }
        await onImportSaved?.();
      } else {
        setMessage(createDuplicateMessage(result.entry.serviceName));
      }
    } catch (error) {
      setMessage(createErrorMessage(error, "Import failed"));
    } finally {
      setBusy(false);
    }
  }

  async function importOtpUrls(otpUrls: string) {
    if (busy) {
      return;
    }

    const links = getPastedOtpLinks(otpUrls);

    if (links.length <= 1) {
      await importOtpUri(otpUrls, "url");
      return;
    }

    setMessage(null);
    setBusy(true);

    let created = 0;
    let duplicate = 0;
    const failedLinks: string[] = [];

    try {
      for (const link of links) {
        try {
          const result = await saveOtpUri(repository, link, "url");

          if (result.status === "created") {
            created += 1;
          } else {
            duplicate += 1;
          }
        } catch {
          failedLinks.push(link);
        }
      }

      setOtpUrl(failedLinks.join("\n"));
      setMessage(createUrlImportSummaryMessage(created, duplicate, failedLinks.length));

      if (created > 0) {
        await onImportSaved?.();
      }
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | null) {
    if (!file || busy) {
      return;
    }

    setMessage(null);
    setBusy(true);
    setDragActive(false);

    try {
      const result = await saveOtpUri(repository, await decodeUpload(file), "upload");

      if (result.status === "created") {
        setMessage(createAddedMessage(result.entry.serviceName));
        inputRef.current && (inputRef.current.value = "");
        await onImportSaved?.();
      } else {
        setMessage(createDuplicateMessage(result.entry.serviceName));
      }
    } catch (error) {
      setMessage(createErrorMessage(error, "Import failed"));
    } finally {
      setBusy(false);
    }
  }

  function selectMode(nextMode: ImportMode) {
    setActiveMode(nextMode);
    setMessage(null);
  }

  return (
    <section className="import-panel embedded-import-panel">
      <p className="import-eyebrow">Import</p>
      <h2>Add account</h2>
      <p className="import-copy">
        Upload a QR image or paste an authentication link to add an account without leaving Settings.
      </p>

      <div aria-label="How to add an account" className="import-tabs" role="tablist">
        <button
          aria-controls="upload-panel"
          aria-selected={activeMode === "upload"}
          className={activeMode === "upload" ? "import-tab active" : "import-tab"}
          id="upload-tab"
          role="tab"
          type="button"
          disabled={busy}
          onClick={() => selectMode("upload")}
        >
          Upload
        </button>
        <button
          aria-controls="url-panel"
          aria-selected={activeMode === "url"}
          className={activeMode === "url" ? "import-tab active" : "import-tab"}
          id="url-tab"
          role="tab"
          type="button"
          disabled={busy}
          onClick={() => selectMode("url")}
        >
          Link
        </button>
      </div>

      <div className="import-stage">
        {activeMode === "upload" ? (
          <section aria-labelledby="upload-tab" id="upload-panel" role="tabpanel">
            <button
              className={dragActive ? "import-dropzone drag-active" : "import-dropzone"}
              disabled={busy}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                void importFile(event.dataTransfer.files?.[0] ?? null);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragActive) {
                  setDragActive(true);
                }
              }}
            >
              <strong>{busy ? "Scanning QR code..." : "Drop QR image here"}</strong>
              <span className="import-dropzone-subtitle">or click to browse files</span>
              <span>PNG, JPG, or any screenshot containing an OTP QR code</span>
            </button>

            <input
              ref={inputRef}
              aria-label="Select QR image"
              className="import-input"
              type="file"
              accept="image/*"
              onChange={(event) => void importFile(event.currentTarget.files?.[0] ?? null)}
            />
          </section>
        ) : null}

        {activeMode === "url" ? (
          <section aria-labelledby="url-tab" id="url-panel" role="tabpanel">
            <form
              className="url-form"
              onSubmit={(event) => {
                event.preventDefault();
                void importOtpUrls(otpUrl);
              }}
            >
              <label className="url-label" htmlFor="otp-url-input">
                Authentication links
              </label>
              <textarea
                aria-label="Authentication links"
                className="url-input"
                id="otp-url-input"
                placeholder={"Paste one link per line\notpauth://...Example 1\notpauth://...Example 2"}
                value={otpUrl}
                disabled={busy}
                onChange={(event) => {
                  setOtpUrl(event.currentTarget.value);
                  setMessage(null);
                }}
              />
              <div className="url-form-actions">
                <button className="url-submit" type="submit" disabled={busy}>
                  {busy ? "Adding..." : "Add accounts"}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>

      {message ? (
        <p className={`import-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

export const ImportApp = ImportSection;
