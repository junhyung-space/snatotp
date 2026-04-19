import {
  createAddedMessage,
  createDuplicateMessage,
  createErrorMessage
} from "../shared/feedback";
import { parseOtpUri } from "../shared/otp";
import { scanImageData } from "../shared/qr";
import type { OtpSaveResult } from "../shared/storage";
import type { OtpEntry } from "../shared/types";
import {
  CAPTURE_SELECTION_RESULT_MESSAGE,
  CAPTURE_STATUS_MESSAGE,
  OPEN_CAPTURE_OVERLAY_MESSAGE,
  type CaptureSelection,
  type CaptureSelectionResultMessage,
  type StartCaptureResult
} from "./messages";

export const CAPTURE_SESSION_PREFIX = "capture-session:";

export type CaptureSession = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

export class DirectCaptureUnavailableError extends Error {
  constructor() {
    super("Direct QR selection is unavailable on this page");
  }
}

type SessionAreaLike = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

type CaptureChromeApi = {
  runtime: {
    getURL(path: string): string;
    onMessage: {
      addListener(callback: (message: CaptureSelectionResultMessage, sender: chrome.runtime.MessageSender) => void): void;
      removeListener(callback: (message: CaptureSelectionResultMessage, sender: chrome.runtime.MessageSender) => void): void;
    };
  };
  scripting: {
    executeScript(injection: chrome.scripting.ScriptInjection): Promise<chrome.scripting.InjectionResult[] | void>;
  };
  tabs: {
    query(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]>;
    captureVisibleTab(
      windowId?: number,
      options?: chrome.tabs.ImageDetails
    ): Promise<string>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  windows: {
    create(createData: chrome.windows.CreateData): Promise<chrome.windows.Window | undefined>;
  };
  storage: {
    session: SessionAreaLike;
  };
};

type StartCaptureSessionOptions = {
  chromeApi?: CaptureChromeApi;
  idFactory?: () => string;
  now?: () => number;
};

type DecodeSelection = (dataUrl: string, selection: CaptureSelection) => Promise<string>;
type SaveEntryResult = OtpEntry | OtpSaveResult | void;
function getDefaultChromeApi(): CaptureChromeApi {
  return {
    runtime: chrome.runtime,
    scripting: chrome.scripting,
    tabs: chrome.tabs,
    windows: chrome.windows,
    storage: {
      session: chrome.storage.session as unknown as SessionAreaLike
    }
  };
}

function createCaptureSessionKey(captureId: string) {
  return `${CAPTURE_SESSION_PREFIX}${captureId}`;
}

async function getActiveTab(chromeApi: CaptureChromeApi) {
  const [tab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab || tab.windowId == null) {
    throw new Error("No active browser tab is available");
  }

  return tab;
}

function isInlineCaptureSupported(tab: chrome.tabs.Tab) {
  if (tab.id == null || tab.windowId == null) return false;
  // tab.url is only present when the tabs permission is granted or activeTab exposes it.
  // If present, reject non-http(s) origins (e.g. chrome://) which block script injection.
  if (tab.url !== undefined && !/^https?:\/\//.test(tab.url)) return false;
  return true;
}

async function ensureCaptureOverlay(tabId: number, chromeApi: CaptureChromeApi) {
  await chromeApi.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

function waitForSelection(tabId: number, chromeApi: CaptureChromeApi) {
  return new Promise<CaptureSelection>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chromeApi.runtime.onMessage.removeListener(listener);
      reject(new Error("Capture timed out"));
    }, 30_000);

    function listener(message: CaptureSelectionResultMessage, sender: chrome.runtime.MessageSender) {
      if (sender.tab?.id !== tabId || message?.type !== CAPTURE_SELECTION_RESULT_MESSAGE) {
        return;
      }

      clearTimeout(timeout);
      chromeApi.runtime.onMessage.removeListener(listener);

      if (message.cancelled || !message.selection) {
        reject(new Error("Capture cancelled"));
        return;
      }

      resolve(message.selection);
    }

    chromeApi.runtime.onMessage.addListener(listener);
  });
}

function cropImageData(bitmap: ImageBitmap, selection: CaptureSelection): ImageData {
  const scaleX = bitmap.width / selection.viewportWidth;
  const scaleY = bitmap.height / selection.viewportHeight;
  const sx = Math.round(selection.x * scaleX);
  const sy = Math.round(selection.y * scaleY);
  const sw = Math.max(1, Math.round(selection.width * scaleX));
  const sh = Math.max(1, Math.round(selection.height * scaleY));
  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Capture canvas is unavailable");
  }

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return context.getImageData(0, 0, sw, sh);
}

function expandSelection(sel: CaptureSelection, factor: number): CaptureSelection {
  const dx = sel.width * factor;
  const dy = sel.height * factor;
  const x = Math.max(0, sel.x - dx);
  const y = Math.max(0, sel.y - dy);
  return {
    x,
    y,
    width: Math.min(sel.viewportWidth - x, sel.width + dx * 2),
    height: Math.min(sel.viewportHeight - y, sel.height + dy * 2),
    viewportWidth: sel.viewportWidth,
    viewportHeight: sel.viewportHeight
  };
}

async function cropAndDecode(dataUrl: string, selection: CaptureSelection) {
  const [, base64] = dataUrl.split(",");
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const bitmap = await createImageBitmap(blob);

  let qrData = scanImageData(cropImageData(bitmap, selection));

  if (qrData === null) {
    qrData = scanImageData(cropImageData(bitmap, expandSelection(selection, 0.15)));
  }

  if (qrData === null) {
    throw new Error("QR code not detected. Try selecting a slightly larger area.");
  }

  if (!qrData.startsWith("otpauth://")) {
    throw new Error("QR payload is not a valid OTP URI");
  }

  return qrData;
}

async function notifyCaptureStatus(
  tabId: number | undefined,
  chromeApi: CaptureChromeApi,
  status: "success" | "warning" | "error",
  message: string
) {
  if (!tabId) {
    return;
  }

  await chromeApi.tabs.sendMessage(tabId, {
    type: CAPTURE_STATUS_MESSAGE,
    status,
    message
  }).catch(() => undefined);
}

export async function relayCaptureStatusToTab({
  tabId,
  status,
  message,
  delayMs = 0,
  chromeApi = getDefaultChromeApi()
}: {
  tabId: number;
  status: "info" | "success" | "warning" | "error";
  message: string;
  delayMs?: number;
  chromeApi?: CaptureChromeApi;
}) {
  const sendStatus = async () => {
    await ensureCaptureOverlay(tabId, chromeApi).catch(() => undefined);
    await chromeApi.tabs.sendMessage(tabId, {
      type: CAPTURE_STATUS_MESSAGE,
      status,
      message
    }).catch(() => undefined);
  };

  if (delayMs > 0) {
    setTimeout(() => {
      void sendStatus();
    }, delayMs);
    return;
  }

  await sendStatus();
}

function normalizeSaveResult(result: SaveEntryResult, entry: OtpEntry): OtpSaveResult {
  if (typeof result === "object" && result !== null && "status" in result) {
    return result;
  }

  return {
    entry,
    status: "created"
  };
}

async function completeInlineCapture(
  tab: chrome.tabs.Tab,
  selectionPromise: Promise<CaptureSelection>,
  chromeApi: CaptureChromeApi,
  saveEntry: (entry: OtpEntry) => Promise<SaveEntryResult>,
  decodeSelection: DecodeSelection
) {
  const selection = await selectionPromise;
  const dataUrl = await chromeApi.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });
  const otpUri = await decodeSelection(dataUrl, selection);
  const entry = parseOtpUri(otpUri, "capture");
  const result = await saveEntry(entry);
  return normalizeSaveResult(result, entry);
}

async function startInlineCapture(
  tab: chrome.tabs.Tab,
  chromeApi: CaptureChromeApi,
  saveEntry: (entry: OtpEntry) => Promise<SaveEntryResult>,
  decodeSelection: DecodeSelection
) {
  if (!tab.id) {
    throw new Error("No active browser tab is available");
  }

  const selectionPromise = waitForSelection(tab.id, chromeApi);
  await ensureCaptureOverlay(tab.id, chromeApi);
  await chromeApi.tabs.sendMessage(tab.id, {
    type: OPEN_CAPTURE_OVERLAY_MESSAGE
  });

  void completeInlineCapture(tab, selectionPromise, chromeApi, saveEntry, decodeSelection)
    .then((result) => {
      const message =
        result.status === "duplicate"
          ? createDuplicateMessage(result.entry.serviceName)
          : createAddedMessage(result.entry.serviceName);

      return notifyCaptureStatus(tab.id, chromeApi, message.kind, message.text);
    })
    .catch((error: unknown) => {
      const message = createErrorMessage(error, "Capture failed");
      void notifyCaptureStatus(tab.id, chromeApi, message.kind, message.text);
    });
}

export async function startCaptureSession({
  chromeApi = getDefaultChromeApi(),
  idFactory = () => crypto.randomUUID(),
  now = () => Date.now()
}: StartCaptureSessionOptions = {}) {
  const tab = await getActiveTab(chromeApi);
  const captureId = idFactory();
  const dataUrl = await chromeApi.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });

  await chromeApi.storage.session.set({
    [createCaptureSessionKey(captureId)]: {
      id: captureId,
      dataUrl,
      createdAt: now()
    } satisfies CaptureSession
  });

  await chromeApi.windows.create({
    url: chromeApi.runtime.getURL(`src/capture/index.html?captureId=${encodeURIComponent(captureId)}`),
    type: "popup",
    focused: true,
    width: 1180,
    height: 820
  });

  return captureId;
}

export async function startCaptureFlow({
  chromeApi = getDefaultChromeApi(),
  decodeSelection = cropAndDecode,
  saveEntry
}: StartCaptureSessionOptions & {
  decodeSelection?: DecodeSelection;
  saveEntry: (entry: OtpEntry) => Promise<SaveEntryResult>;
}): Promise<StartCaptureResult> {
  const tab = await getActiveTab(chromeApi);

  if (!isInlineCaptureSupported(tab)) {
    throw new DirectCaptureUnavailableError();
  }

  await startInlineCapture(tab, chromeApi, saveEntry, decodeSelection);

  return {
    mode: "inline"
  };
}

export async function readCaptureSession(
  captureId: string,
  sessionArea: SessionAreaLike = chrome.storage.session as unknown as SessionAreaLike
) {
  const key = createCaptureSessionKey(captureId);
  const result = await sessionArea.get(key);
  const session = result[key];

  if (
    typeof session !== "object" ||
    session === null ||
    !("id" in session) ||
    !("dataUrl" in session) ||
    !("createdAt" in session)
  ) {
    throw new Error("Capture session expired");
  }

  return session as CaptureSession;
}

export async function clearCaptureSession(
  captureId: string,
  sessionArea: SessionAreaLike = chrome.storage.session as unknown as SessionAreaLike
) {
  await sessionArea.remove(createCaptureSessionKey(captureId));
}
