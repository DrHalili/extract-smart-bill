# BillEasy Forms

Lovable prompt:

Build a web app for medical billers that extracts patient data from hospital face sheet PDFs.

Core flow: User uploads a PDF or image → app calls AWS Bedrock (Claude) to extract structured fields → fields display in a clean editable form → user copies fields into their billing software.

Fields to extract: patient first/last name, date of birth, MRN, admission date, discharge date, attending physician, primary diagnosis, ICD-10 code, insurance name, member ID, group number, secondary insurance name, secondary insurance ID, guarantor name, guarantor relationship.

UI: Single page. Upload area top (drag and drop or browse). Extracted fields below in a clean two-column grid grouped by section: Patient, Encounter, Primary Insurance, Secondary Insurance, Guarantor. Each field has a copy button. One "Copy All" button at the top of results. Fields are editable. Settings icon for AWS credentials input.

Auth: Simple API key input stored in browser memory. No login required for MVP.

Stack: React, single file, no backend. AWS Bedrock API called client-side for MVP. Use Claude claude-sonnet-4-6 model via Bedrock.

Design: Clean, minimal, professional. Primary color #0f4c81. Non-technical users. No unnecessary features.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://extract-smart-bill.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/98cc6a9b-8111-4c65-aef2-0c7ebc5e7df7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
