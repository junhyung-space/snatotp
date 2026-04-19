import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createChromeOtpRepository } from "../shared/storage";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Popup root not found");
}

createRoot(container).render(
  <StrictMode>
    <App repository={createChromeOtpRepository()} />
  </StrictMode>
);
