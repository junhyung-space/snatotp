import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  clearCaptureSession,
  readCaptureSession,
  type CaptureSession
} from "../background/capture";
import { parseOtpUri } from "../shared/otp";
import { decodeOtpUriFromImageData } from "../shared/qr";
import type { OtpRepository } from "../shared/storage";
import "./styles.css";

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DisplaySize = {
  width: number;
  height: number;
};

type CaptureAppProps = {
  captureId: string;
  repository: OtpRepository;
  loadSession?: (captureId: string) => Promise<CaptureSession>;
  clearSession?: (captureId: string) => Promise<void>;
  decodeSelection?: (
    session: CaptureSession,
    selection: SelectionRect,
    displaySize: DisplaySize
  ) => Promise<string>;
  closeWindow?: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeSelection(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

export async function decodeOtpUriFromSelection(
  session: CaptureSession,
  selection: SelectionRect,
  displaySize: DisplaySize
) {
  const response = await fetch(session.dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scaleX = bitmap.width / displaySize.width;
  const scaleY = bitmap.height / displaySize.height;
  const sx = Math.round(selection.x * scaleX);
  const sy = Math.round(selection.y * scaleY);
  const sw = Math.max(1, Math.round(selection.width * scaleX));
  const sh = Math.max(1, Math.round(selection.height * scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Capture canvas is unavailable");
  }

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return decodeOtpUriFromImageData(context.getImageData(0, 0, sw, sh));
}

export function CaptureApp({
  captureId,
  repository,
  loadSession = readCaptureSession,
  clearSession = clearCaptureSession,
  decodeSelection = decodeOtpUriFromSelection,
  closeWindow = () => window.close()
}: CaptureAppProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [session, setSession] = useState<CaptureSession | null>(null);
  const [displaySize, setDisplaySize] = useState<DisplaySize | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    loadSession(captureId)
      .then((nextSession) => {
        if (active) {
          setSession(nextSession);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [captureId, loadSession]);

  function getStagePoint(event: PointerEvent<HTMLDivElement>) {
    const rect = stageRef.current?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height)
    };
  }

  async function handleSubmit() {
    if (!session || !selection || !displaySize || busy) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const otpUri = await decodeSelection(session, selection, displaySize);
      await repository.save(parseOtpUri(otpUri, "capture"));
      await clearSession(captureId);
      closeWindow();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to add account. Please try again.");
      setBusy(false);
    }
  }

  async function handleCancel() {
    await clearSession(captureId).catch(() => undefined);
    closeWindow();
  }

  return (
    <main className="capture-shell">
      <header className="capture-header">
        <p className="capture-eyebrow">Add account</p>
        <div className="capture-heading">
          <h1>Select the QR code</h1>
          <p>Drag to select the QR code on the page, then add the account.</p>
        </div>
      </header>

      <section className="capture-stage-panel">
        {loading ? (
          <div className="capture-placeholder">Loading...</div>
        ) : session ? (
          <div
            ref={stageRef}
            className="capture-stage"
            onPointerDown={(event) => {
              const point = getStagePoint(event);

              if (!point) {
                return;
              }

              event.currentTarget.setPointerCapture(event.pointerId);
              dragStartRef.current = point;
              setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
              setMessage(null);
            }}
            onPointerMove={(event) => {
              if (!dragStartRef.current) {
                return;
              }

              const point = getStagePoint(event);

              if (!point) {
                return;
              }

              setSelection(normalizeSelection(dragStartRef.current, point));
            }}
            onPointerUp={(event) => {
              if (!dragStartRef.current) {
                return;
              }

              const point = getStagePoint(event);
              const startPoint = dragStartRef.current;
              event.currentTarget.releasePointerCapture(event.pointerId);
              dragStartRef.current = null;

              if (!point) {
                return;
              }

              const nextSelection = normalizeSelection(startPoint, point);

              if (nextSelection.width < 8 || nextSelection.height < 8) {
                setSelection(null);
                return;
              }

              setSelection(nextSelection);
            }}
          >
            <img
              alt="Captured browser view"
              className="capture-image"
              draggable={false}
              src={session.dataUrl}
              onLoad={(event) => {
                setDisplaySize({
                  width: event.currentTarget.clientWidth,
                  height: event.currentTarget.clientHeight
                });
              }}
            />
            {selection ? (
              <div
                className="capture-selection"
                style={{
                  left: selection.x,
                  top: selection.y,
                  width: selection.width,
                  height: selection.height
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="capture-placeholder">Something went wrong. Please try again.</div>
        )}
      </section>

      <footer className="capture-footer">
        <div className="capture-meta">
          <strong>{selection ? "Ready to add" : "Drag to select the QR code"}</strong>
          <span>{message ?? "Works on all browsers and operating systems."}</span>
        </div>
        <div className="capture-actions">
          <button className="capture-secondary" type="button" onClick={() => void handleCancel()}>
            Cancel
          </button>
          <button
            className="capture-primary"
            type="button"
            disabled={!selection || busy || !session}
            onClick={() => void handleSubmit()}
          >
            {busy ? "Adding..." : "Add account"}
          </button>
        </div>
      </footer>
    </main>
  );
}
