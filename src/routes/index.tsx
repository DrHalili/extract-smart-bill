import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractFaceSheet } from "@/lib/extract.functions";
import { TARGET_PROFILES } from "@/lib/target-profiles";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  address2: string;
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
  subscriberName: string;
  secondaryInsuranceName: string;
  secondaryInsuranceId: string;
  guarantorName: string;
  guarantorRelationship: string;
  handwrittenNotes: string;
};

const EMPTY: Fields = {
  firstName: "", lastName: "", dob: "", sex: "", phone: "", mrn: "",
  address: "", address2: "", city: "", state: "", zip: "",
  admissionDate: "", dischargeDate: "", admissionType: "", facilityName: "",
  attendingPhysician: "", primaryDiagnosis: "", icd10: "",
  insuranceName: "", memberId: "", groupNumber: "", priorAuthNumber: "",
  subscriberName: "", secondaryInsuranceName: "", secondaryInsuranceId: "",
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
  address2: "Address Line 2",
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
  subscriberName: "Subscriber / Insured",
  secondaryInsuranceName: "Secondary Insurance Name",
  secondaryInsuranceId: "Secondary Insurance ID",
  guarantorName: "Guarantor Name",
  guarantorRelationship: "Guarantor Relationship",
  handwrittenNotes: "Handwritten Notes on Sheet",
};

const ALL_KEYS = Object.keys(FIELD_LABELS) as (keyof Fields)[];

type Tab = { id: string; label: string; sections: { title: string; fields: (keyof Fields)[] }[] };

// Tabs mirror the destination registration screen so the biller's eyes stay put.
const TABS: Tab[] = [
  {
    id: "general",
    label: "Patient / General",
    sections: [
      {
        title: "Patient",
        fields: ["lastName", "firstName", "dob", "sex", "phone", "mrn"],
      },
      { title: "Address", fields: ["address", "address2", "zip", "city", "state"] },
    ],
  },
  {
    id: "coverage",
    label: "Coverage / Case",
    sections: [
      {
        title: "Encounter",
        fields: [
          "facilityName",
          "admissionDate",
          "dischargeDate",
          "admissionType",
          "attendingPhysician",
          "primaryDiagnosis",
          "icd10",
        ],
      },
      {
        title: "Primary Insurance",
        fields: ["insuranceName", "memberId", "groupNumber", "subscriberName", "priorAuthNumber"],
      },
      { title: "Secondary Insurance", fields: ["secondaryInsuranceName", "secondaryInsuranceId"] },
      { title: "Guarantor", fields: ["guarantorName", "guarantorRelationship"] },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    sections: [{ title: "Handwritten Notes", fields: ["handwrittenNotes"] }],
  },
];

type JobStatus = "queued" | "working" | "done" | "error";

type Job = {
  id: string;
  fileName: string;
  status: JobStatus;
  error?: string;
  fields: Fields;
  previewUrl: string;
  isPdf: boolean;
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
  const [tabId, setTabId] = useState(TABS[0].id);
  const [profileId, setProfileId] = useState(TARGET_PROFILES[0].id);
  const [runIndex, setRunIndex] = useState<number | null>(null);
  const [showSheet, setShowSheet] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const doneJobs = jobs.filter((j) => j.status === "done");
  const remaining = jobs.filter((j) => j.status === "queued" || j.status === "working").length;
  const profile = TARGET_PROFILES.find((p) => p.id === profileId) ?? TARGET_PROFILES[0];
  const activeTab = TABS.find((t) => t.id === tabId) ?? TABS[0];

  // Only step through fields that actually have a value.
  const runKeys = (profile.order as (keyof Fields)[]).filter(
    (k) => selected && (selected.fields[k] ?? "").trim() !== "",
  );

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
  };

  const copyAll = async () => {
    if (!selected) return;
    const text = TABS.flatMap((t) => t.sections)
      .map((s) => {
        const lines = s.fields.map((f) => `${FIELD_LABELS[f]}: ${selected.fields[f]}`).join("\n");
        return `${s.title}\n${lines}`;
      })
      .join("\n\n");
    await copy("__all__", text);
  };

  const copyTabbed = async () => {
    if (!selected) return;
    await copy(
      "__tabbed__",
      (profile.order as (keyof Fields)[]).map((k) => selected.fields[k] ?? "").join("\t"),
    );
  };

  const goToStep = useCallback(
    async (index: number) => {
      if (!selected || runKeys.length === 0) return;
      const clamped = Math.max(0, Math.min(index, runKeys.length - 1));
      setRunIndex(clamped);
      await navigator.clipboard.writeText(selected.fields[runKeys[clamped]] ?? "");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, runKeys.join("|")],
  );

  // Hotkeys drive the paste run so the biller's hands stay on the keyboard.
  useEffect(() => {
    if (runIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "Escape") {
        setRunIndex(null);
        return;
      }
      if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (runIndex >= runKeys.length - 1) setRunIndex(null);
        else void goToStep(runIndex + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void goToStep(runIndex - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runIndex, runKeys.length, goToStep]);

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
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
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
          previewUrl: URL.createObjectURL(file),
          isPdf: file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
        },
      }));
      setJobs((prev) => [...prev, ...entries.map((e) => e.job)]);
      setSelectedId((prev) => prev ?? entries[0].job.id);

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

  const clearAll = () => {
    jobs.forEach((j) => URL.revokeObjectURL(j.previewUrl));
    setJobs([]);
    setSelectedId(null);
    setRunIndex(null);
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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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

      <main className="mx-auto max-w-7xl px-6 py-8 pb-28">
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
          <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Queue ({jobs.length})
                </h2>
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
              <ul className="space-y-1">
                {jobs.map((job) => {
                  const name = [job.fields.lastName, job.fields.firstName].filter(Boolean).join(", ");
                  return (
                    <li key={job.id}>
                      <button
                        onClick={() => { setSelectedId(job.id); setView("form"); setRunIndex(null); }}
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
                  onClick={() => { setView("table"); setRunIndex(null); }}
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
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        {[selected.fields.lastName, selected.fields.firstName].filter(Boolean).join(", ") ||
                          selected.fileName}
                      </h2>
                      <p className="text-xs text-muted-foreground">{selected.fileName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSheet((s) => !s)}
                        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                      >
                        {showSheet ? "Hide face sheet" : "Show face sheet"}
                      </button>
                      <button
                        onClick={copyAll}
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                      >
                        {copiedKey === "__all__" ? "Copied!" : "Copy All"}
                      </button>
                    </div>
                  </div>

                  {selected.status === "error" && (
                    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {selected.error}
                    </div>
                  )}

                  {selected.status === "done" && (
                    <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
                      <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold">Paste run — match your billing screen</h3>
                          <label className="mt-2 block text-[11px] uppercase tracking-wide text-muted-foreground">
                            Destination screen
                          </label>
                          <select
                            value={profileId}
                            onChange={(e) => { setProfileId(e.target.value); setRunIndex(null); }}
                            className="mt-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          >
                            {TARGET_PROFILES.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                          <p className="mt-1.5 text-xs text-muted-foreground">{profile.hint}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void copyTabbed()}
                            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
                          >
                            {copiedKey === "__tabbed__" ? "Copied!" : "Copy all (tab-separated)"}
                          </button>
                          <button
                            onClick={() => void goToStep(0)}
                            disabled={runKeys.length === 0}
                            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                          >
                            Start paste run
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {runKeys.map((key, i) => (
                          <button
                            key={key}
                            onClick={() => void goToStep(i)}
                            className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                              i === runIndex
                                ? "border-primary bg-background ring-1 ring-primary"
                                : "border-border bg-background hover:bg-muted"
                            }`}
                          >
                            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                              {i + 1}. {FIELD_LABELS[key]}
                            </span>
                            <span className="block max-w-[160px] truncate font-medium">
                              {selected.fields[key] || "—"}
                            </span>
                          </button>
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        Rhythm: <strong>Ctrl/Cmd+V</strong> → <strong>Tab</strong> → click back here (or press{" "}
                        <strong>Enter</strong>) to load the next field. Empty fields are skipped automatically.
                      </p>
                    </div>
                  )}

                  <div className={showSheet ? "grid gap-6 xl:grid-cols-[1fr_minmax(280px,420px)]" : ""}>
                    <div>
                      <div className="mb-4 flex gap-1 border-b border-border">
                        {TABS.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setTabId(t.id)}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                              t.id === tabId
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-6">
                        {activeTab.sections.map((section) => (
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
                    </div>

                    {showSheet && (
                      <div className="rounded-lg border border-border bg-card p-3">
                        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Face sheet
                        </h3>
                        {selected.isPdf ? (
                          <object
                            data={selected.previewUrl}
                            type="application/pdf"
                            className="h-[70vh] w-full rounded-md border border-border"
                          >
                            <a href={selected.previewUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                              Open PDF
                            </a>
                          </object>
                        ) : (
                          <img
                            src={selected.previewUrl}
                            alt={`Uploaded face sheet ${selected.fileName}`}
                            className="max-h-[70vh] w-full rounded-md border border-border object-contain"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </section>
          </div>
        )}
      </main>

      {runIndex !== null && selected && runKeys[runIndex] && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card shadow-lg">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
            <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
              {runIndex + 1}/{runKeys.length}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {FIELD_LABELS[runKeys[runIndex]]} — on your clipboard
              </div>
              <div className="truncate text-sm font-medium">
                {selected.fields[runKeys[runIndex]]}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void goToStep(runIndex - 1)}
                disabled={runIndex === 0}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={() =>
                  runIndex >= runKeys.length - 1 ? setRunIndex(null) : void goToStep(runIndex + 1)
                }
                className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {runIndex >= runKeys.length - 1 ? "Finish" : "Next field →"}
              </button>
              <button
                onClick={() => setRunIndex(null)}
                className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Esc
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
