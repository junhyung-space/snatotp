const OPEN_CAPTURE_OVERLAY_MESSAGE = "open-capture-overlay";
const CAPTURE_SELECTION_RESULT_MESSAGE = "capture-selection-result";
const CAPTURE_STATUS_MESSAGE = "capture-status";

type CaptureSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

let captureOverlayRoot: HTMLDivElement | null = null;
let statusRoot: HTMLDivElement | null = null;

function cleanupCaptureOverlay() {
  captureOverlayRoot?.remove();
  captureOverlayRoot = null;
}

function sendSelection(selection?: CaptureSelection, cancelled = false) {
  void chrome.runtime.sendMessage({
    type: CAPTURE_SELECTION_RESULT_MESSAGE,
    selection,
    cancelled
  });
}

function showCaptureStatus(status: "info" | "success" | "warning" | "error", message: string) {
  statusRoot?.remove();

  const root = document.createElement("div");
  root.id = "snapotp-capture-status";
  root.textContent = message;
  root.style.position = "fixed";
  root.style.left = "50%";
  root.style.top = "18px";
  root.style.transform = "translateX(-50%)";
  root.style.zIndex = "2147483647";
  root.style.maxWidth = "min(520px, calc(100vw - 32px))";
  root.style.padding = "11px 15px";
  root.style.borderRadius = "999px";
  root.style.background =
    status === "info"
      ? "rgba(29, 78, 216, 0.96)"
      : status === "success"
        ? "rgba(20, 108, 67, 0.96)"
        : status === "warning"
          ? "rgba(180, 83, 9, 0.96)"
          : "rgba(193, 75, 73, 0.96)";
  root.style.color = "#fff";
  root.style.font = "700 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  root.style.boxShadow = "0 18px 42px rgba(15, 23, 42, 0.22)";
  root.style.pointerEvents = "none";

  document.documentElement.append(root);
  statusRoot = root;

  window.setTimeout(() => {
    if (statusRoot === root) {
      statusRoot.remove();
      statusRoot = null;
    }
  }, 3200);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && captureOverlayRoot) {
    cleanupCaptureOverlay();
    sendSelection(undefined, true);
  }
});

function openCaptureOverlay() {
  cleanupCaptureOverlay();

  const root = document.createElement("div");
  const backdrop = document.createElement("div");
  const box = document.createElement("div");
  const hint = document.createElement("div");
  root.id = "snapotp-capture-overlay";
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483647";
  root.style.cursor = "crosshair";
  root.style.userSelect = "none";
  root.style.touchAction = "none";

  backdrop.style.position = "absolute";
  backdrop.style.inset = "0";
  backdrop.style.background = "rgba(15, 23, 42, 0.34)";

  box.style.position = "absolute";
  box.style.border = "2px solid #f8fbff";
  box.style.borderRadius = "16px";
  box.style.background = "rgba(58, 120, 255, 0.22)";
  box.style.boxShadow = "0 0 0 2px #3a78ff, 0 0 0 9999px rgba(15, 23, 42, 0.18)";
  box.style.display = "none";
  box.style.pointerEvents = "none";

  hint.textContent = "Drag around the QR code";
  hint.style.position = "fixed";
  hint.style.left = "50%";
  hint.style.top = "18px";
  hint.style.transform = "translateX(-50%)";
  hint.style.padding = "10px 14px";
  hint.style.borderRadius = "999px";
  hint.style.background = "rgba(255, 255, 255, 0.94)";
  hint.style.color = "#132033";
  hint.style.font = "600 13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  hint.style.boxShadow = "0 16px 36px rgba(15, 23, 42, 0.18)";
  hint.style.pointerEvents = "none";

  root.append(backdrop, box, hint);
  document.documentElement.append(root);
  captureOverlayRoot = root;

  let startX = 0;
  let startY = 0;
  let dragging = false;

  function draw(currentX: number, currentY: number) {
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    box.style.display = "block";
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
  }

  root.addEventListener("pointerdown", (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    root.setPointerCapture(event.pointerId);
    draw(startX, startY);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    draw(event.clientX, event.clientY);
  });

  root.addEventListener("pointerup", (event) => {
    if (!dragging) {
      return;
    }

    dragging = false;
    root.releasePointerCapture(event.pointerId);
    const left = Math.min(startX, event.clientX);
    const top = Math.min(startY, event.clientY);
    const width = Math.abs(event.clientX - startX);
    const height = Math.abs(event.clientY - startY);

    cleanupCaptureOverlay();

    if (width < 8 || height < 8) {
      sendSelection(undefined, true);
      return;
    }

    sendSelection({
      x: left,
      y: top,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === OPEN_CAPTURE_OVERLAY_MESSAGE) {
    openCaptureOverlay();
  }

  if (message?.type === CAPTURE_STATUS_MESSAGE) {
    const status =
      message.status === "info" || message.status === "success" || message.status === "warning"
        ? message.status
        : "error";
    showCaptureStatus(status, String(message.message ?? "Capture failed"));
  }

  return undefined;
});
