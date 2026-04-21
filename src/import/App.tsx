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
                void importOtpUri(otpUrl, "url");
              }}
            >
              <label className="url-label" htmlFor="otp-url-input">
                Authentication link
              </label>
              <textarea
                aria-label="Authentication link"
                className="url-input"
                id="otp-url-input"
                placeholder="Paste your authentication link here"
                value={otpUrl}
                disabled={busy}
                onChange={(event) => {
                  setOtpUrl(event.currentTarget.value);
                  setMessage(null);
                }}
              />
              <div className="url-form-actions">
                <button className="url-submit" type="submit" disabled={busy}>
                  {busy ? "Adding…" : "Add account"}
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
