import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { AwsClient } from "aws4fetch";

export const Route = createFileRoute("/")({
  component: Index,
});

type Fields = {
  firstName: string;
  lastName: string;
  dob: string;
  mrn: string;
  admissionDate: string;
  dischargeDate: string;
  attendingPhysician: string;
  primaryDiagnosis: string;
  icd10: string;
  insuranceName: string;
  memberId: string;
  groupNumber: string;
  secondaryInsuranceName: string;
  secondaryInsuranceId: string;
  guarantorName: string;
  guarantorRelationship: string;
};

const EMPTY: Fields = {
  firstName: "", lastName: "", dob: "", mrn: "",
  admissionDate: "", dischargeDate: "", attendingPhysician: "",
  primaryDiagnosis: "", icd10: "",
  insuranceName: "", memberId: "", groupNumber: "",
  secondaryInsuranceName: "", secondaryInsuranceId: "",
  guarantorName: "", guarantorRelationship: "",
};

const FIELD_LABELS: Record<keyof Fields, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  dob: "Date of Birth",
  mrn: "MRN",
  admissionDate: "Admission Date",
  dischargeDate: "Discharge Date",
  attendingPhysician: "Attending Physician",
  primaryDiagnosis: "Primary Diagnosis",
  icd10: "ICD-10 Code",
  insuranceName: "Insurance Name",
  memberId: "Member ID",
  groupNumber: "Group Number",
  secondaryInsuranceName: "Secondary Insurance Name",
  secondaryInsuranceId: "Secondary Insurance ID",
  guarantorName: "Guarantor Name",
  guarantorRelationship: "Guarantor Relationship",
};

const SECTIONS: { title: string; fields: (keyof Fields)[] }[] = [
  { title: "Patient", fields: ["firstName", "lastName", "dob", "mrn"] },
  { title: "Encounter", fields: ["admissionDate", "dischargeDate", "attendingPhysician", "primaryDiagnosis", "icd10"] },
  { title: "Primary Insurance", fields: ["insuranceName", "memberId", "groupNumber"] },
  { title: "Secondary Insurance", fields: ["secondaryInsuranceName", "secondaryInsuranceId"] },
  { title: "Guarantor", fields: ["guarantorName", "guarantorRelationship"] },
];

type Creds = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  region: string;
  modelId: string;
};

const DEFAULT_CREDS: Creds = {
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  region: "us-east-1",
  modelId: "anthropic.claude-sonnet-4-6-20250514-v1:0",
};

const EXTRACTION_PROMPT = `You are extracting patient billing information from a hospital face sheet. Return ONLY a JSON object with these exact keys (use empty string "" if a field is not present, do not guess):

{
  "firstName": "", "lastName": "", "dob": "", "mrn": "",
  "admissionDate": "", "dischargeDate": "", "attendingPhysician": "",
  "primaryDiagnosis": "", "icd10": "",
  "insuranceName": "", "memberId": "", "groupNumber": "",
  "secondaryInsuranceName": "", "secondaryInsuranceId": "",
  "guarantorName": "", "guarantorRelationship": ""
}

Format dates as MM/DD/YYYY. Return JSON only, no markdown, no commentary.`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Index() {
  const [creds, setCreds] = useState<Creds>(DEFAULT_CREDS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
  };

  const copyAll = async () => {
    const text = SECTIONS.map((s) => {
      const lines = s.fields.map((f) => `${FIELD_LABELS[f]}: ${fields[f]}`).join("\n");
      return `${s.title}\n${lines}`;
    }).join("\n\n");
    await copy("__all__", text);
  };

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    if (!creds.accessKeyId || !creds.secretAccessKey) {
      setError("Please add AWS credentials in Settings first.");
      setSettingsOpen(true);
      return;
    }
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const mediaType = isPdf
        ? "application/pdf"
        : file.type || "image/jpeg";

      const contentBlock = isPdf
        ? { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } }
        : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };

      const body = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: EXTRACTION_PROMPT }],
          },
        ],
      };

      const client = new AwsClient({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken || undefined,
        region: creds.region,
        service: "bedrock",
      });

      const url = `https://bedrock-runtime.${creds.region}.amazonaws.com/model/${encodeURIComponent(creds.modelId)}/invoke`;
      const res = await client.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Bedrock ${res.status}: ${txt.slice(0, 300)}`);
      }
      const json = await res.json();
      const text: string = json?.content?.[0]?.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Model did not return JSON.");
      const parsed = JSON.parse(match[0]);
      setFields({ ...EMPTY, ...parsed });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Failed to fetch") || msg.includes("CORS")
          ? "Network/CORS error calling Bedrock. Browsers may be blocked by AWS CORS. Consider a proxy for production."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [creds]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary" />
            <h1 className="text-lg font-semibold tracking-tight">FaceSheet Extract</h1>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            aria-label="Settings"
          >
            ⚙ Settings
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <section
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void processFile(f);
            }}
          />
          <p className="text-base font-medium">
            {loading ? "Extracting…" : "Drop face sheet PDF or image here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName ? fileName : "or click to browse"}
          </p>
        </section>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Extracted fields</h2>
            <button
              onClick={copyAll}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {copiedKey === "__all__" ? "Copied!" : "Copy All"}
            </button>
          </div>

          <div className="space-y-6">
            {SECTIONS.map((section) => (
              <div key={section.title} className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {section.fields.map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        {FIELD_LABELS[key]}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={fields[key]}
                          onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                        <button
                          onClick={() => copy(key, fields[key])}
                          className="shrink-0 rounded-md border border-border px-2.5 text-xs hover:bg-muted"
                          title="Copy"
                        >
                          {copiedKey === key ? "✓" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">AWS Credentials</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored in memory only. Cleared on page refresh.
            </p>
            <div className="mt-4 space-y-3">
              {([
                ["accessKeyId", "Access Key ID"],
                ["secretAccessKey", "Secret Access Key"],
                ["sessionToken", "Session Token (optional)"],
                ["region", "Region"],
                ["modelId", "Bedrock Model ID"],
              ] as [keyof Creds, string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                  <input
                    type={k === "secretAccessKey" || k === "sessionToken" ? "password" : "text"}
                    value={creds[k]}
                    onChange={(e) => setCreds((c) => ({ ...c, [k]: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setSettingsOpen(false)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
