import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
import { extractFaceSheet } from "@/lib/extract.functions";

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
  const extract = useServerFn(extractFaceSheet);
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
    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const mediaType = isPdf ? "application/pdf" : (file.type || "image/jpeg");
      const parsed = await extract({
        data: { base64, mediaType, kind: isPdf ? "pdf" : "image" },
      });
      setFields({ ...EMPTY, ...parsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [extract]);

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
    </div>
  );
}
