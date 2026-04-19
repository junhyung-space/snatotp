const manifest = {
  manifest_version: 3,
  name: "Snap OTP",
  version: "0.1.0",
  description: "OTP authenticator for Chrome with QR import, capture, sync, and optional passphrase protection.",
  icons: {
    "16": "assets/snapotp-icon-16.png",
    "32": "assets/snapotp-icon-32.png",
    "48": "assets/snapotp-icon-48.png",
    "128": "assets/snapotp-icon-128.png"
  },
  action: {
    default_icon: {
      "16": "assets/snapotp-icon-16.png",
      "32": "assets/snapotp-icon-32.png"
    },
    default_title: "Snap OTP",
    default_popup: "src/popup/index.html"
  },
  options_ui: {
    page: "src/settings/index.html",
    open_in_tab: true
  },
  background: {
    service_worker: "background.js",
    type: "module" as const
  },
  permissions: ["storage", "clipboardWrite", "activeTab", "scripting", "alarms"]
};

export default manifest;
