## Short answer on feasibility

A web app **cannot type into another desktop program**. The browser sandbox has no access to other windows, and that Registration screen is a native Windows app (possibly over Citrix), not a web page. So:

| Approach | Works from this web app? |
|---|---|
| Copy one field, user pastes | Yes (today) |
| Copy all fields tab-separated, user pastes once and tabs | Yes, but only if the target accepts tabbed paste — most legacy Windows forms do **not** (Tab moves focus, it doesn't split a pasted string) |
| App presses keys into the other window (true autofill) | **No** — impossible from a browser |
| True autofill | Only via a small desktop helper (AutoHotkey on Windows / Keyboard Maestro on Mac) or a browser extension if the app is actually web-based inside Citrix |

Looking at the General tab specifically: the tabbed-paste trick will likely fail there, because fields like Zip Code, St, Gender and Date of Birth are lookup/dropdown controls, not plain text boxes. So the reliable win is **making the one-at-a-time flow near-zero-effort and in the exact order of that screen**.

## What to build

### 1. Target screen profiles
Add a small profile concept that maps our extracted fields to the exact tab order of a real destination screen. Ship two profiles built from the screenshots:

**Registration — General**
Last Name → First → Address 1 → Address 2 → Zip Code → City → State → Date of Birth → Gender → SSN (blank) → Primary Phone

**Registration — Coverage/Case Info**
Facility → Insurance Company → Member No → Subscriber/Insured → Relationship → ICD-10 → Hosp-From date (admission) → To (discharge)

A dropdown at the top of the results panel picks the active profile. Profiles are data, so more can be added later without redesign.

### 2. Keyboard-driven sequential paste ("hands stay on the keyboard")
Replace clicking chips with a flow the biller can run without looking back at the browser:

- A "Start paste run" button copies field 1 and shows a compact heads-up strip: `1/11 · Last Name · SUGIMURA`.
- A global hotkey advances: press it → next value is on the clipboard, counter advances. Rhythm becomes: `Ctrl+V`, `Tab`, hotkey, `Ctrl+V`, `Tab`…
- Back/skip controls for fields the screen doesn't have, and auto-skip of empty values.
- Same keystrokes on Windows and Mac; nothing OS-specific.

Caveat worth stating plainly: the hotkey only fires while the browser window has focus, so the biller alternates windows anyway. A second, lower-friction variant is included: an "advance on copy" mode where clicking anywhere in the strip advances — one click instead of hunting for a chip.

### 3. Face sheet viewable side-by-side
Keep the uploaded page rendered next to the fields so the biller can eyeball anything the model got wrong (especially handwriting) without reopening the PDF. This is the "face sheet viewable?" ask and is cheap to add for images; PDFs render in an embedded frame.

### 4. Coverage/case tabs in the UI
Group the results panel into tabs that mirror the destination app — Patient/General, Coverage/Case — so the on-screen layout matches what the biller is looking at. Reduces eye travel and mis-pastes.

### 5. Fix the download behavior
The CSV path should download directly rather than opening a window that needs a second click. Verify the current download and email buttons trigger a real file save in one action on both desktop and mobile.

## Notes for later (not in this build)

- **True autofill** would be a ~100-line AutoHotkey script the biller runs on her Windows machine: the web app writes a payload to the clipboard in a known format, the script reads it and types field-by-field with Tabs into the focused window. This is the only realistic path to a single "fill the whole screen" button, and it's a separate deliverable from the web app.
- **If that Registration app is web-based inside Citrix**, a browser extension could autofill by CSS selector. Worth confirming — it changes what's possible substantially.
- Whether the target uses a Zip-code lookup that auto-populates City/State matters; if it does, the profile should skip City and State entirely.

## Technical details

- Profiles: a typed constant array in `src/routes/index.tsx` (or a small `src/lib/target-profiles.ts`) — `{ id, label, order: (keyof Fields)[] }`.
- Sequential paste: local component state for the active index plus a `keydown` listener on `window`; clipboard writes via `navigator.clipboard.writeText`, unchanged from today.
- Address 2, SSN and Subscriber/Insured aren't currently extracted — add `address2`, `subscriberName` to the extraction prompt and field set; SSN is deliberately left out (PHI risk, rarely on a face sheet).
- Face sheet preview needs the uploaded `File` retained per job as an object URL; today the file is discarded after base64 conversion.
- No backend changes beyond the extraction prompt.
