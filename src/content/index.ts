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

function getCaptureStatusTitle(status: "info" | "success" | "warning" | "error") {
  if (status === "success") {
    return "Account added";
  }

  if (status === "warning") {
    return "Already added";
  }

  if (status === "error") {
    return "Capture failed";
  }

  return "Capture";
}

export function createCaptureStatusToast(
  status: "info" | "success" | "warning" | "error",
  message: string
) {
  const root = document.createElement("div");
  const badge = document.createElement("span");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const body = document.createElement("p");

  root.id = "snapotp-capture-status";
  root.setAttribute("role", status === "error" ? "alert" : "status");
  root.style.position = "fixed";
  root.style.left = "50%";
  root.style.bottom = "24px";
  root.style.transform = "translateX(-50%)";
  root.style.zIndex = "2147483647";
  root.style.maxWidth = "min(420px, calc(100vw - 32px))";
  root.style.width = "max-content";
  root.style.display = "grid";
  root.style.gridTemplateColumns = "auto minmax(0, 1fr)";
  root.style.alignItems = "start";
  root.style.gap = "12px";
  root.style.padding = "14px 16px";
  root.style.borderRadius = "18px";
  root.style.background =
    status === "info"
      ? "rgba(232, 240, 255, 0.98)"
      : status === "success"
        ? "rgba(232, 247, 239, 0.98)"
        : status === "warning"
          ? "rgba(255, 244, 223, 0.98)"
          : "rgba(254, 242, 242, 0.99)";
  root.style.border =
    status === "info"
      ? "1px solid rgba(30, 78, 168, 0.12)"
      : status === "success"
        ? "1px solid rgba(20, 108, 67, 0.12)"
        : status === "warning"
          ? "1px solid rgba(154, 91, 16, 0.14)"
          : "1px solid rgba(153, 27, 27, 0.12)";
  root.style.boxShadow = "0 20px 44px rgba(15, 23, 42, 0.16)";
  root.style.pointerEvents = "none";
  root.style.boxSizing = "border-box";

  badge.setAttribute("aria-hidden", "true");
  badge.style.width = "10px";
  badge.style.height = "10px";
  badge.style.marginTop = "5px";
  badge.style.borderRadius = "999px";
  badge.style.background =
    status === "info"
      ? "#1e4ea8"
      : status === "success"
        ? "#146c43"
        : status === "warning"
          ? "#9a5b10"
          : "#991b1b";
  badge.style.boxShadow = "0 0 0 4px rgba(255, 255, 255, 0.7)";

  copy.style.display = "grid";
  copy.style.gap = "3px";

  title.textContent = getCaptureStatusTitle(status);
  title.style.margin = "0";
  title.style.color =
    status === "info"
      ? "#173b7a"
      : status === "success"
        ? "#175c3d"
        : status === "warning"
          ? "#8a5514"
          : "#8f2626";
  title.style.font = "700 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  title.style.letterSpacing = "-0.01em";

  body.textContent = message;
  body.style.margin = "0";
  body.style.color = "#45566f";
  body.style.font = "600 13px/1.45 -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

  copy.append(title, body);
  root.append(badge, copy);

  return root;
}

function showCaptureStatus(status: "info" | "success" | "warning" | "error", message: string) {
  statusRoot?.remove();

  const root = createCaptureStatusToast(status, message);

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

  hint.textContent = "Drag to select the QR code";
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
    hint.style.display = "none";
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

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
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
}
