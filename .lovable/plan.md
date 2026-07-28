# Fax / email / photo input — exploration plan

## What the user is asking
A way for face sheets to arrive in the app without the user manually downloading and uploading files. The three main flavors are:

1. **Real e-fax receiving** — app owns a fax number; inbound faxes become extraction jobs.
2. **Email forwarding** — faxes (or any scanned/photo attachment) are emailed to a dedicated app address; attachments become extraction jobs.
3. **In-app camera capture** — user snaps a photo on their phone and it uploads straight into the queue.

## Current app state
- Single-page batch uploader: drag/drop or browse PDFs/images.
- Server function extracts fields with AI and returns structured data.
- Jobs queue processes up to 3 files at once.
- Results are editable per file and exportable as CSV.
- No auth, no storage, no inbound webhooks/email.

## Option comparison

### Option A: Real e-fax receiving
- **How it works:** Subscribe to a fax API (Twilio Fax, RingCentral, SRFax, HelloFax, etc.), get a phone number, configure the provider to POST inbound fax PDFs to a public webhook route.
- **App changes needed:**
  - Public webhook route under `/api/public/fax-inbound` to receive the PDF.
  - File storage to persist the fax PDF (Lovable Cloud storage or provider-hosted URL).
  - Create a job from the fax and run the existing extraction server function.
  - Show fax metadata (sender number, pages, received at) in the queue.
- **Pros:** True "fax to data" workflow; billers love it.
- **Cons:** Requires paid third-party account + phone number; needs webhook security; not demo-friendly because you can't test it without a real fax line.
- **Verdict:** Production feature, not MVP demo.

### Option B: Email-to-app (forwarded faxes or scanned attachments)
- **How it works:** Most e-fax services email the PDF. App gets a dedicated inbound address (e.g. `sheets@yourdomain.com`) and parses attachments from incoming email.
- **App changes needed:**
  - Email domain set up in Lovable Cloud.
  - Public webhook route under `/api/public/email-inbound` using Lovable email events/webhooks.
  - Extract PDF/image attachments from the email.
  - Create a job and run extraction.
- **Pros:** Works with existing fax services; no phone number needed; users can also forward photos/scans from their phone email.
- **Cons:** Requires domain ownership and DNS setup; still real infrastructure.
- **Verdict:** Good production path, slightly easier than direct fax.

### Option C: In-app camera capture
- **How it works:** Add a "Take photo" button on the upload area that opens the device camera, then uploads the photo into the same batch queue.
- **App changes needed:**
  - New file input with `capture="environment"` (or user-facing camera button).
  - Minor UI polish for mobile: larger tap targets, confirm/crop hint.
  - No new backend integration — uses existing `extractFaceSheet` server function.
- **Pros:** Zero third-party accounts; demo-ready today; directly addresses the "pile of face sheets" workflow for mobile users.
- **Cons:** Still manual per sheet; not truly "fax".
- **Verdict:** Best for the current demo.

## Recommended scope

### For this demo
Add **Option C (camera capture)** only. It keeps the app self-contained and gives the mobile "photo of a paper face sheet" workflow without building fax/email infrastructure.

Changes:
- Split upload area into two visible actions: "Drop files or browse" and "Take photo".
- Camera input uses `accept="image/*" capture="environment"` for mobile browsers.
- Uploaded photo joins the same job queue and gets extracted like any other image.

### For a future production build
Add **Option B (email forwarding)** first because it piggybacks on existing e-fax services and is cheaper to operate than owning fax numbers. Add **Option A (direct fax number)** only if users demand a dedicated inbound fax line.

## What we would not build
- A full fax-sending outbound feature.
- A separate "loading account" or customer-specific routing workflow (already flagged as out of scope by the user).
- Phone/SMS-based submission.

## Next step
Confirm whether to implement Option C (camera capture) in the current demo, or keep the demo as-is and only document the production options.