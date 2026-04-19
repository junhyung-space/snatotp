# Contributing

Snap OTP is a small Chrome extension project, so focused, incremental pull
requests work best.

## Development flow

1. Install dependencies with `pnpm install`.
2. Run tests with `pnpm test`.
3. Build the extension with `pnpm build`.
4. Open a pull request with a short summary of the change and any UI impact.

## Scope

- Keep the popup fast and predictable.
- Prefer small UX changes over broad refactors.
- Add or update tests when behavior changes.

## Before opening a PR

- Confirm the extension still loads from `dist`.
- Note any Chrome-specific behavior or permission changes.
- Include screenshots for visible UI changes when helpful.
