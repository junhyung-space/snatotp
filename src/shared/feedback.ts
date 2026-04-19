export type FeedbackKind = "info" | "success" | "warning" | "error";

export type FeedbackMessage = {
  kind: FeedbackKind;
  text: string;
};

export function createAddedMessage(serviceName: string): FeedbackMessage {
  return {
    kind: "success",
    text: `Added: ${serviceName}`
  };
}

export function createProgressMessage(text: string): FeedbackMessage {
  return {
    kind: "info",
    text
  };
}

export function createDuplicateMessage(serviceName: string): FeedbackMessage {
  return {
    kind: "warning",
    text: `Already added: ${serviceName}`
  };
}

export function createErrorMessage(error: unknown, fallback: string): FeedbackMessage {
  return {
    kind: "error",
    text: error instanceof Error ? error.message : fallback
  };
}
