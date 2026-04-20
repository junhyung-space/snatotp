# Popup OTP Card Density Design

- Date: 2026-04-21
- Scope: popup OTP entry card layout for long names and stronger timer visibility

## Goal

Keep the popup list compact while making long service names and account names feel less cramped.
The OTP code must remain fast to scan, and the remaining time must become easier to notice.

## Approved Direction

Use a compact split card layout with these rules:

- Service name stays on a single line.
- Account name stays on a single line.
- OTP code moves to a dedicated row below the identity block.
- Timer stays on the same lower row as the OTP code.
- The timer uses a progress rail plus color-based urgency states.

## Card Structure

### Top row

- Marker/avatar on the left
- Service name and account name stacked in the center
- Overflow menu button on the right

### Bottom row

- Large OTP code aligned to the left under the text block
- Remaining time aligned to the right
- Thin timer rail shown with the countdown state

## Typography and Density

- Keep the overall card compact; do not switch to a tall card style.
- Service name should not wrap to two lines.
- Account name should remain secondary and truncated if needed.
- OTP code should stay visually dominant even after moving to the lower row.

## Timer Behavior

The timer becomes more prominent than in the current design.

- `20s and above`: blue / calm state
- `10s to 19s`: amber / warning state
- `9s and below`: red / urgent state

The rail should shrink with time and change color by urgency band.

## Rationale

- Keeping the service name to one line preserves list rhythm and avoids over-tall cards.
- Moving the OTP code to the second row gives both identity lines more room without sacrificing code readability.
- A rail communicates refresh urgency faster than text alone.
- Color plus remaining width helps users spot codes that are about to expire.

## Non-Goals

- No tooltip-first or hover-only solution for long names.
- No two-line service name in the approved direction.
- No return to the original single-row code-and-timer layout.
