import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_SELECTION_RESULT_MESSAGE,
  CAPTURE_STATUS_MESSAGE,
  CLEAR_SECURITY_SESSION_MESSAGE,
  RELAY_CAPTURE_STATUS_MESSAGE,
  SCHEDULE_SECURITY_AUTOLOCK_MESSAGE,
  handleBackgroundMessage,
  START_CAPTURE_FLOW_MESSAGE
} from "../../src/background/messages";
import { relayCaptureStatusToTab, startCaptureFlow } from "../../src/background/capture";
import { parseOtpUri } from "../../src/shared/otp";

describe("background capture", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a started response when the popup starts direct drag capture", async () => {
    const start = vi.fn().mockResolvedValue({ mode: "inline" });

    const result = await handleBackgroundMessage(
      { type: START_CAPTURE_FLOW_MESSAGE },
      {
        startCaptureFlow: start
      }
    );

    expect(start).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: "started",
      mode: "inline"
    });
  });

  it("schedules and clears the security autolock session from background messages", async () => {
    const scheduleSecurityAutolock = vi.fn().mockResolvedValue(undefined);
    const clearSecuritySession = vi.fn().mockResolvedValue(undefined);

    await expect(
      handleBackgroundMessage(
        {
          type: SCHEDULE_SECURITY_AUTOLOCK_MESSAGE,
          expiresAt: 123_456
        },
        {
          scheduleSecurityAutolock,
          clearSecuritySession
        }
      )
    ).resolves.toEqual({ kind: "scheduled" });

    await expect(
      handleBackgroundMessage(
        {
          type: CLEAR_SECURITY_SESSION_MESSAGE
        },
        {
          scheduleSecurityAutolock,
          clearSecuritySession
        }
      )
    ).resolves.toEqual({ kind: "cleared" });

    expect(scheduleSecurityAutolock).toHaveBeenCalledWith({
      type: SCHEDULE_SECURITY_AUTOLOCK_MESSAGE,
      expiresAt: 123_456
    });
    expect(clearSecuritySession).toHaveBeenCalledTimes(1);
  });

  it("relays a delayed status toast to a tab when asked by another extension surface", async () => {
    vi.useFakeTimers();
    const executeScript = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    const relayPromise = handleBackgroundMessage(
      {
        type: RELAY_CAPTURE_STATUS_MESSAGE,
        tabId: 7,
        status: "success",
        message: "Added: Example",
        delayMs: 120
      },
      {
        startCaptureFlow: vi.fn(),
        relayCaptureStatus: (message) =>
          relayCaptureStatusToTab({
            ...message,
            chromeApi: {
              runtime: {
                getURL: vi.fn(),
                onMessage: {
                  addListener: vi.fn(),
                  removeListener: vi.fn()
                }
              },
              scripting: {
                executeScript
              },
              storage: {
                session: {
                  get: vi.fn(),
                  remove: vi.fn(),
                  set: vi.fn()
                }
              },
              tabs: {
                captureVisibleTab: vi.fn(),
                query: vi.fn(),
                sendMessage
              },
              windows: {
                create: vi.fn()
              }
            }
          })
      }
    );

    await expect(relayPromise).resolves.toEqual({ kind: "relayed" });
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);

    expect(executeScript).toHaveBeenCalledWith({
      files: ["content.js"],
      target: { tabId: 7 }
    });
    expect(sendMessage).toHaveBeenCalledWith(7, {
      type: CAPTURE_STATUS_MESSAGE,
      status: "success",
      message: "Added: Example"
    });
    vi.useRealTimers();
  });

  it("starts an inline page overlay on injectable tabs without opening the fallback window", async () => {
    const query = vi.fn().mockResolvedValue([{ id: 7, windowId: 11, url: "https://example.com/login" }]);
    const executeScript = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const addListener = vi.fn();
    const removeListener = vi.fn();

    const result = await startCaptureFlow({
      chromeApi: {
        runtime: {
          getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path}`),
          onMessage: {
            addListener,
            removeListener
          }
        },
        scripting: {
          executeScript
        },
        storage: {
          session: {
            get: vi.fn(),
            remove: vi.fn(),
            set: vi.fn()
          }
        },
        tabs: {
          captureVisibleTab: vi.fn(),
          query,
          sendMessage
        },
        windows: {
          create
        }
      },
      saveEntry: vi.fn()
    });

    expect(result).toEqual({ mode: "inline" });
    expect(executeScript).toHaveBeenCalledWith({
      files: ["content.js"],
      target: { tabId: 7 }
    });
    expect(sendMessage).toHaveBeenCalledWith(7, { type: "open-capture-overlay" });
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not open a fallback capture window when direct drag capture is unavailable", async () => {
    const create = vi.fn().mockResolvedValue(undefined);

    await expect(
      startCaptureFlow({
        chromeApi: {
          runtime: {
            getURL: vi.fn((path: string) => `chrome-extension://test-extension/${path}`),
            onMessage: {
              addListener: vi.fn(),
              removeListener: vi.fn()
            }
          },
          scripting: {
            executeScript: vi.fn()
          },
          storage: {
            session: {
              get: vi.fn(),
              remove: vi.fn(),
              set: vi.fn()
            }
          },
          tabs: {
            captureVisibleTab: vi.fn(),
            query: vi.fn().mockResolvedValue([{ id: 7, windowId: 11, url: "chrome://extensions/" }]),
            sendMessage: vi.fn()
          },
          windows: {
            create
          }
        },
        saveEntry: vi.fn()
      })
    ).rejects.toThrow("Direct QR selection is unavailable on this page");

    expect(create).not.toHaveBeenCalled();
  });

  it("notifies the page when direct drag capture saves an OTP", async () => {
    let selectionListener:
      | ((message: unknown, sender: chrome.runtime.MessageSender) => void)
      | undefined;
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const saveEntry = vi.fn().mockResolvedValue(undefined);

    await startCaptureFlow({
      chromeApi: {
        runtime: {
          getURL: vi.fn(),
          onMessage: {
            addListener: vi.fn((listener) => {
              selectionListener = listener;
            }),
            removeListener: vi.fn()
          }
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue(undefined)
        },
        storage: {
          session: {
            get: vi.fn(),
            remove: vi.fn(),
            set: vi.fn()
          }
        },
        tabs: {
          captureVisibleTab: vi.fn().mockResolvedValue("data:image/png;base64,abc123"),
          query: vi.fn().mockResolvedValue([{ id: 7, windowId: 11, url: "https://example.com/login" }]),
          sendMessage
        },
        windows: {
          create: vi.fn()
        }
      },
      decodeSelection: vi.fn().mockResolvedValue(
        "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
      ),
      saveEntry
    });

    selectionListener?.(
      {
        type: CAPTURE_SELECTION_RESULT_MESSAGE,
        selection: {
          x: 10,
          y: 20,
          width: 120,
          height: 120,
          viewportWidth: 800,
          viewportHeight: 600
        }
      },
      { tab: { id: 7 } } as chrome.runtime.MessageSender
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenLastCalledWith(7, {
      type: CAPTURE_STATUS_MESSAGE,
      status: "success",
      message: "Added: Example"
    });
  });

  it("notifies the page with the failure reason when direct drag capture fails", async () => {
    let selectionListener:
      | ((message: unknown, sender: chrome.runtime.MessageSender) => void)
      | undefined;
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await startCaptureFlow({
      chromeApi: {
        runtime: {
          getURL: vi.fn(),
          onMessage: {
            addListener: vi.fn((listener) => {
              selectionListener = listener;
            }),
            removeListener: vi.fn()
          }
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue(undefined)
        },
        storage: {
          session: {
            get: vi.fn(),
            remove: vi.fn(),
            set: vi.fn()
          }
        },
        tabs: {
          captureVisibleTab: vi.fn().mockResolvedValue("data:image/png;base64,abc123"),
          query: vi.fn().mockResolvedValue([{ id: 7, windowId: 11, url: "https://example.com/login" }]),
          sendMessage
        },
        windows: {
          create: vi.fn()
        }
      },
      decodeSelection: vi.fn().mockRejectedValue(new Error("QR payload is not a valid OTP URI")),
      saveEntry: vi.fn()
    });

    selectionListener?.(
      {
        type: CAPTURE_SELECTION_RESULT_MESSAGE,
        selection: {
          x: 10,
          y: 20,
          width: 120,
          height: 120,
          viewportWidth: 800,
          viewportHeight: 600
        }
      },
      { tab: { id: 7 } } as chrome.runtime.MessageSender
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenLastCalledWith(7, {
      type: CAPTURE_STATUS_MESSAGE,
      status: "error",
      message: "QR payload is not a valid OTP URI"
    });
  });

  it("notifies the page when direct drag capture finds a duplicate OTP", async () => {
    let selectionListener:
      | ((message: unknown, sender: chrome.runtime.MessageSender) => void)
      | undefined;
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const duplicateEntry = parseOtpUri(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example",
      "capture"
    );

    await startCaptureFlow({
      chromeApi: {
        runtime: {
          getURL: vi.fn(),
          onMessage: {
            addListener: vi.fn((listener) => {
              selectionListener = listener;
            }),
            removeListener: vi.fn()
          }
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue(undefined)
        },
        storage: {
          session: {
            get: vi.fn(),
            remove: vi.fn(),
            set: vi.fn()
          }
        },
        tabs: {
          captureVisibleTab: vi.fn().mockResolvedValue("data:image/png;base64,abc123"),
          query: vi.fn().mockResolvedValue([{ id: 7, windowId: 11, url: "https://example.com/login" }]),
          sendMessage
        },
        windows: {
          create: vi.fn()
        }
      },
      decodeSelection: vi.fn().mockResolvedValue(
        "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
      ),
      saveEntry: vi.fn().mockResolvedValue({
        entry: duplicateEntry,
        status: "duplicate"
      })
    });

    selectionListener?.(
      {
        type: CAPTURE_SELECTION_RESULT_MESSAGE,
        selection: {
          x: 10,
          y: 20,
          width: 120,
          height: 120,
          viewportWidth: 800,
          viewportHeight: 600
        }
      },
      { tab: { id: 7 } } as chrome.runtime.MessageSender
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendMessage).toHaveBeenLastCalledWith(7, {
      type: CAPTURE_STATUS_MESSAGE,
      status: "warning",
      message: "Already added: Example"
    });
  });
});
