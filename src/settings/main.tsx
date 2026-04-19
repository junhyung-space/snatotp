import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingsApp } from "./App";
import { createChromeAppPreferencesRepository } from "../shared/preferences";
import { createChromeOtpRepository } from "../shared/storage";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Settings root not found");
}

createRoot(container).render(
  <StrictMode>
    <SettingsApp
      preferencesRepository={createChromeAppPreferencesRepository()}
      repository={createChromeOtpRepository()}
    />
  </StrictMode>
);
