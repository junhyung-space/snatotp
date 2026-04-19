# Security Policy

If you discover a security issue, please do not open a public issue with exploit
details.

For clarity, Snap OTP currently has two storage modes:

- Standard mode: OTP entries are stored in `chrome.storage.sync` without a user passphrase.
- Passphrase protection mode: OTP entries are encrypted before being written to sync storage, and the popup stays locked until the user enters the configured passphrase.

Reports are especially helpful when they describe which mode was active and whether the issue affects standard mode, protected mode, or both.

Public product pages:

- Homepage: `https://junhyung-space.github.io/snatotp/`
- Privacy Policy: `https://junhyung-space.github.io/snatotp/privacy/`

Instead, report it privately to the maintainer with:

- A short description of the issue
- Steps to reproduce it
- Expected impact
- Any suggested mitigation

Until a dedicated security contact is published, use the repository owner's
GitHub profile contact options for private disclosure.
