import { relayCaptureStatusToTab, startCaptureFlow } from "./capture";
import {
  CLEAR_SECURITY_SESSION_MESSAGE,
  RELAY_CAPTURE_STATUS_MESSAGE,
  SCHEDULE_SECURITY_AUTOLOCK_MESSAGE,
  START_CAPTURE_FLOW_MESSAGE,
  handleBackgroundMessage
} from "./messages";
import { createChromeOtpRepository } from "../shared/storage";
import { SECURITY_SESSION_KEY } from "../shared/security";
import type { OtpEntry } from "../shared/types";

const SECURITY_AUTOLOCK_ALARM = "snapotp-security-autolock";

async function saveEntry(entry: OtpEntry) {
  const repository = createChromeOtpRepository();
  return repository.save(entry);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Snap OTP installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== START_CAPTURE_FLOW_MESSAGE &&
    message?.type !== RELAY_CAPTURE_STATUS_MESSAGE &&
    message?.type !== SCHEDULE_SECURITY_AUTOLOCK_MESSAGE &&
    message?.type !== CLEAR_SECURITY_SESSION_MESSAGE
  ) {
    return undefined;
  }

  void handleBackgroundMessage(message, {
    startCaptureFlow: () => startCaptureFlow({ saveEntry }),
    relayCaptureStatus: ({ tabId, status, message, delayMs }) =>
      relayCaptureStatusToTab({ tabId, status, message, delayMs }),
    scheduleSecurityAutolock: async ({ expiresAt }) => {
      const delayInMinutes = Math.max(0.01, (expiresAt - Date.now()) / 60_000);
      await chrome.alarms.clear(SECURITY_AUTOLOCK_ALARM);
      await chrome.alarms.create(SECURITY_AUTOLOCK_ALARM, {
        delayInMinutes
      });
    },
    clearSecuritySession: async () => {
      await chrome.alarms.clear(SECURITY_AUTOLOCK_ALARM);
      await chrome.storage.session.remove(SECURITY_SESSION_KEY);
    }
  })
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      sendResponse({
        kind: "error",
        message: error instanceof Error ? error.message : "Capture failed"
      });
    });

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== SECURITY_AUTOLOCK_ALARM) {
    return;
  }

  void chrome.storage.session.remove(SECURITY_SESSION_KEY);
});
