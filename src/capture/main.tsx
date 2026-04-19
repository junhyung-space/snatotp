import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CaptureApp } from "./App";
import { createChromeOtpRepository } from "../shared/storage";

const container = document.getElementById("root");
const captureId = new URLSearchParams(window.location.search).get("captureId");

if (!container) {
  throw new Error("Capture root not found");
}

if (!captureId) {
  throw new Error("Capture session id is missing");
}

createRoot(container).render(
  <StrictMode>
    <CaptureApp captureId={captureId} repository={createChromeOtpRepository()} />
  </StrictMode>
);
