import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
import { extractFaceSheet } from "@/lib/extract.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FaceSheet Extract — Batch Patient Data Extraction" },
      {
        name: "description",
        content:
          "Upload a stack of hospital face sheets and get clean, editable patient billing fields plus a spreadsheet export.",
      },
      { property: "og:title", content: "FaceSheet Extract — Batch Patient Data Extraction" },
      {
        property: "og:description",
        content:
          "Upload a stack of hospital face sheets and get clean, editable patient billing fields plus a spreadsheet export.",
      },
    ],
  }),
  component: Index,
});

type Fields = {
  firstName: string;
  lastName: string;
  dob: string;
  sex: string;
  phone: string;
  mrn: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  admissionDate: string;
  dischargeDate: string;
  admissionType: string;
  facilityName: string;
  attendingPhysician: string;
  primaryDiagnosis: string;
  icd10: string;
  insuranceName: string;
  memberId: string;
  groupNumber: string;
  priorAuthNumber: string;
  secondaryInsuranceName: string;
  secondaryInsuranceId: string;
  guarantorName: string;
  guarantorRelationship: string;
  handwrittenNotes: string;
};

const EMPTY: Fields = {
  firstName: "", lastName: "", dob: "", sex: "", phone: "", mrn: "",
  address: "", city: "", state: "", zip: "",
  admissionDate: "", dischargeDate: "", admissionType: "", facilityName: "",
  attendingPhysician: "", primaryDiagnosis: "", icd10: "",
  insuranceName: "", memberId: "", groupNumber: "", priorAuthNumber: "",
  secondaryInsuranceName: "", secondaryInsuranceId: "",
  guarantorName: "", guarantorRelationship: "", handwrittenNotes: "",
};

const FIELD_LABELS: Record<keyof Fields, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  dob: "Date of Birth",
  sex: "Sex",
  phone: "Phone",
  mrn: "MRN",
  address: "Street Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  admissionDate: "Admission Date",
  dischargeDate: "Discharge Date",
  admissionType: "Admission Type",
  facilityName: "Facility Name",
  attendingPhysician: "Attending Physician",
  primaryDiagnosis: "Primary Diagnosis",
  icd10: "ICD-10 Code",
  insuranceName: "Insurance Name",
  memberId: "Member ID",
  groupNumber: "Group Number",
  priorAuthNumber: "Prior Authorization #",
  secondaryInsuranceName: "Secondary Insurance Name",
  secondaryInsuranceId: "Secondary Insurance ID",
  guarantorName: "Guarantor Name",
  guarantorRelationship: "Guarantor Relationship",
  handwrittenNotes: "Handwritten Notes on Sheet",
};

const ALL_KEYS = Object.keys(FIELD_LABELS) as (keyof Fields)[];

const SECTIONS: { title: string; fields: (keyof Fields)[] }[] = [
  { title: "Patient", fields: ["firstName", "lastName", "dob", "sex", "phone", "mrn", "address", "city", "state", "zip"] },
  { title: "Encounter", fields: ["facilityName", "admissionDate", "dischargeDate", "admissionType", "attendingPhysician", "primaryDiagnosis", "icd10"] },
  { title: "Primary Insurance", fields: ["insuranceName", "memberId", "groupNumber", "priorAuthNumber"] },
  { title: "Secondary Insurance", fields: ["secondaryInsuranceName", "secondaryInsuranceId"] },
  { title: "Guarantor", fields: ["guarantorName", "guarantorRelationship"] },
  { title: "Handwritten Notes", fields: ["handwrittenNotes"] },
];

// Order matches the usual patient-intake tab order in billing software.
const INTAKE_KEYS: (keyof Fields)[] = [
  "firstName", "lastName", "dob", "sex", "address", "city", "state", "zip", "phone",
];



type JobStatus = "queued" | "working" | "done" | "error";

type Job = {
  id: string;
  fileName: string;
  status: JobStatus;
  error?: string;
  fields: Fields;
};

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

function csvEscape(value: string) {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

function Index() {
  const extract = useServerFn(extractFaceSheet);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "table">("form");
  const [dragging, setDragging] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const doneJobs = jobs.filter((j) => j.status === "done");
  const remaining = jobs.filter((j) => j.status === "queued" || j.status === "working").length;

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
  };

  const copyAll = async () => {
    if (!selected) return;
    const text = SECTIONS.map((s) => {
      const lines = s.fields.map((f) => `${FIELD_LABELS[f]}: ${selected.fields[f]}`).join("\n");
      return `${s.title}\n${lines}`;
    }).join("\n\n");
    await copy("__all__", text);
  };

  // One clipboard payload with tabs between values: paste into the first box and
  // most billing apps / spreadsheets fill the rest as you tab across.
  const copyIntakeTabbed = async () => {
    if (!selected) return;
    await copy("__intake__", INTAKE_KEYS.map((k) => selected.fields[k] ?? "").join("\t"));
  };

  const copyStep = async (index: number) => {
    if (!selected) return;
    const key = INTAKE_KEYS[index];
    await copy(`step-${key}`, selected.fields[key] ?? "");
    setStep(Math.min(index + 1, INTAKE_KEYS.length - 1));
  };


  const updateField = (key: keyof Fields, value: string) => {
    if (!selected) return;
    setJobs((prev) =>
      prev.map((j) => (j.id === selected.id ? { ...j, fields: { ...j.fields, [key]: value } } : j)),
    );
  };

  const buildCsv = () => {
    const rows = [
      ["File", ...ALL_KEYS.map((k) => FIELD_LABELS[k])],
      ...doneJobs.map((j) => [j.fileName, ...ALL_KEYS.map((k) => j.fields[k])]),
    ];
    return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  };

  const csvFileName = () => `face-sheets-${new Date().toISOString().slice(0, 10)}.csv`;

  const downloadCsv = () => {
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${buildCsv()}`], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName();
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailCsv = async () => {
    const name = csvFileName();
    const file = new File([`\uFEFF${buildCsv()}`], name, { type: "text/csv" });
    const nav = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: unknown) => Promise<void>;
    };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({
          files: [file],
          title: "Face sheet data",
          text: `${doneJobs.length} face sheet${doneJobs.length === 1 ? "" : "s"} extracted.`,
        });
        return;
      } catch {
        // user cancelled or sharing unavailable — fall through
      }
    }
    // Fallback: download the file and open a pre-filled email draft to attach it.
    downloadCsv();
    const body = encodeURIComponent(
      `Attached: ${name} — ${doneJobs.length} face sheet${doneJobs.length === 1 ? "" : "s"}.\n\n(The spreadsheet was just downloaded to this device; attach it to this email.)`,
    );
    window.location.href = `mailto:?subject=${encodeURIComponent("Face sheet data")}&body=${body}`;
  };


  const runJob = useCallback(
    async (id: string, file: File) => {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: "working" } : j)));
      try {
        const base64 = await fileToBase64(file);
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const mediaType = isPdf ? "application/pdf" : file.type || "image/jpeg";
        const parsed = await extract({ data: { base64, mediaType, kind: isPdf ? "pdf" : "image" } });
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id ? { ...j, status: "done", fields: { ...EMPTY, ...parsed } } : j,
          ),
        );
      } catch (e) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === id
              ? { ...j, status: "error", error: e instanceof Error ? e.message : String(e) }
              : j,
          ),
        );
      }
    },
    [extract],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const entries = files.map((file) => ({
        file,
        job: {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          fileName: file.name,
          status: "queued" as JobStatus,
          fields: { ...EMPTY },
        },
      }));
      setJobs((prev) => [...prev, ...entries.map((e) => e.job)]);
      setSelectedId((prev) => prev ?? entries[0].job.id);

      // Process up to 3 at a time so a big pile doesn't stall.
      const queue = [...entries];
      const worker = async () => {
        while (queue.length) {
          const next = queue.shift();
          if (!next) return;
          await runJob(next.job.id, next.file);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    },
    [runJob],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void addFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const statusChip = (job: Job) => {
    const map: Record<JobStatus, string> = {
      queued: "bg-muted text-muted-foreground",
      working: "bg-primary/10 text-primary",
      done: "bg-primary text-primary-foreground",
      error: "bg-destructive/15 text-destructive",
    };
    const label = { queued: "Queued", working: "Scanning…", done: "Ready", error: "Failed" }[job.status];
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[job.status]}`}>{label}</span>;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded bg-primary" />
            <h1 className="text-lg font-semibold tracking-tight">FaceSheet Extract</h1>
          </div>
          {doneJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void emailCsv()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Email spreadsheet
              </button>
              <button
                onClick={downloadCsv}
                className="hidden rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted sm:block"
              >
                Download spreadsheet ({doneJobs.length})
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-10 ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              void addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <p className="text-base font-medium">Drop face sheets here — one or a whole pile</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {remaining > 0 ? `${remaining} still scanning…` : "PDFs or images · click to browse"}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Browse files
            </button>
          </div>
        </section>

        {jobs.length > 0 && (
          <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Queue ({jobs.length})
                </h2>
                <button
                  onClick={() => { setJobs([]); setSelectedId(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <ul className="space-y-1">
                {jobs.map((job) => {
                  const name = [job.fields.lastName, job.fields.firstName].filter(Boolean).join(", ");
                  return (
                    <li key={job.id}>
                      <button
                        onClick={() => { setSelectedId(job.id); setView("form"); }}
                        className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                          selectedId === job.id && view === "form" ? "bg-primary/10" : "hover:bg-muted"
                        }`}
                      >
                        <div className="truncate text-sm font-medium">{name || job.fileName}</div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-muted-foreground">{job.fileName}</span>
                          {statusChip(job)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {doneJobs.length > 0 && (
                <button
                  onClick={() => setView("table")}
                  className={`mt-3 w-full rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                    view === "table" ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  View all as table
                </button>
              )}
            </aside>

            <section>
              {view === "table" ? (
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <h2 className="text-base font-semibold">All extracted sheets</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void emailCsv()}
                        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                      >
                        Email
                      </button>
                      <button
                        onClick={downloadCsv}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        Download CSV
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          {ALL_KEYS.map((k) => (
                            <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">
                              {FIELD_LABELS[k]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {doneJobs.map((job) => (
                          <tr key={job.id} className="border-b border-border last:border-0">
                            {ALL_KEYS.map((k) => (
                              <td key={k} className="whitespace-nowrap px-3 py-2">
                                {job.fields[k] || <span className="text-muted-foreground">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : selected ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold">
                        {[selected.fields.lastName, selected.fields.firstName].filter(Boolean).join(", ") ||
                          selected.fileName}
                      </h2>
                      <p className="text-xs text-muted-foreground">{selected.fileName}</p>
                    </div>
                    <button
                      onClick={copyAll}
                      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      {copiedKey === "__all__" ? "Copied!" : "Copy All"}
                    </button>
                  </div>

                  {selected.status === "error" && (
                    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {selected.error}
                    </div>
                  )}

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
                                  value={selected.fields[key]}
                                  onChange={(e) => updateField(key, e.target.value)}
                                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                />
                                <button
                                  onClick={() => copy(key, selected.fields[key])}
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
                </>
              ) : null}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
