export const START_CAPTURE_FLOW_MESSAGE = "start-capture-flow";
export const OPEN_CAPTURE_OVERLAY_MESSAGE = "open-capture-overlay";
export const CAPTURE_SELECTION_RESULT_MESSAGE = "capture-selection-result";
export const CAPTURE_STATUS_MESSAGE = "capture-status";
export const RELAY_CAPTURE_STATUS_MESSAGE = "relay-capture-status";
export const SCHEDULE_SECURITY_AUTOLOCK_MESSAGE = "schedule-security-autolock";
export const CLEAR_SECURITY_SESSION_MESSAGE = "clear-security-session";

export type StartCaptureFlowMessage = {
  type: typeof START_CAPTURE_FLOW_MESSAGE;
};

export type CaptureSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type OpenCaptureOverlayMessage = {
  type: typeof OPEN_CAPTURE_OVERLAY_MESSAGE;
};

export type CaptureSelectionResultMessage = {
  type: typeof CAPTURE_SELECTION_RESULT_MESSAGE;
  selection?: CaptureSelection;
  cancelled?: boolean;
};

export type CaptureStatusMessage = {
  type: typeof CAPTURE_STATUS_MESSAGE;
  status: "info" | "success" | "warning" | "error";
  message: string;
};

export type RelayCaptureStatusMessage = {
  type: typeof RELAY_CAPTURE_STATUS_MESSAGE;
  tabId: number;
  status: CaptureStatusMessage["status"];
  message: string;
  delayMs?: number;
};

export type ScheduleSecurityAutolockMessage = {
  type: typeof SCHEDULE_SECURITY_AUTOLOCK_MESSAGE;
  expiresAt: number;
};

export type ClearSecuritySessionMessage = {
  type: typeof CLEAR_SECURITY_SESSION_MESSAGE;
};

export type StartCaptureResult =
  | {
      mode: "inline";
    }
  | {
      mode: "window";
      captureId?: string;
    };

export type CaptureHelpers = {
  startCaptureFlow(): Promise<StartCaptureResult>;
  relayCaptureStatus?(message: RelayCaptureStatusMessage): Promise<void>;
  scheduleSecurityAutolock?(message: ScheduleSecurityAutolockMessage): Promise<void>;
  clearSecuritySession?(): Promise<void>;
};

export async function handleBackgroundMessage(message: unknown, helpers: CaptureHelpers) {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === START_CAPTURE_FLOW_MESSAGE
  ) {
    const result = await helpers.startCaptureFlow();

    return {
      kind: "started" as const,
      ...result
    };
  }

  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === RELAY_CAPTURE_STATUS_MESSAGE &&
    typeof helpers.relayCaptureStatus === "function"
  ) {
    await helpers.relayCaptureStatus(message as RelayCaptureStatusMessage);

    return {
      kind: "relayed" as const
    };
  }

  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === SCHEDULE_SECURITY_AUTOLOCK_MESSAGE &&
    typeof helpers.scheduleSecurityAutolock === "function"
  ) {
    await helpers.scheduleSecurityAutolock(message as ScheduleSecurityAutolockMessage);

    return {
      kind: "scheduled" as const
    };
  }

  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === CLEAR_SECURITY_SESSION_MESSAGE &&
    typeof helpers.clearSecuritySession === "function"
  ) {
    await helpers.clearSecuritySession();

    return {
      kind: "cleared" as const
    };
  }

  return undefined;
}
