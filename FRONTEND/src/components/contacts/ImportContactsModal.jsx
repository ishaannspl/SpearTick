import { useState } from "react";
import { AlertTriangle, CheckCircle, Download, FileText, UploadCloud, X } from "lucide-react";
import { importContacts } from "../../services/api";
import { Button } from "../ui";
import {
  EMPTY_SHEET,
  parseSheet,
  phoneColumn,
  setColumnRole,
  sheetToCsvFile,
  validateSheet,
} from "../../utils/contactSheet";

const SAMPLE_CSV = "Name,Phone,Tags\nRavi Kumar,9876543210,\"vip,delhi\"\nPriya Shah,+91 91234 56789,new\n";

function downloadSample() {
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "contacts-sample.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function ImportContactsModal({ isOpen, onClose, onImported, segmentId, title, description }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  // The file parsed the same way the campaign page does it, so both screens
  // agree on which column is the phone number and which rows are valid.
  const [sheet, setSheet] = useState(EMPTY_SHEET);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [invalidRows, setInvalidRows] = useState([]);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const phoneCol = phoneColumn(sheet);
  const { counts } = validateSheet(sheet);
  const badNumbers = counts.invalid;

  const reset = () => {
    setFile(null);
    setSheet(EMPTY_SHEET);
    setSummary(null);
    setInvalidRows([]);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  async function selectFile(f) {
    if (!f) return;
    reset();
    if (!/\.csv$/i.test(f.name)) {
      setError("Please choose a .csv file. In Excel or Google Sheets, use File → Download / Save as → CSV.");
      return;
    }
    setFile(f);
    try {
      setSheet(parseSheet(await f.text()));
    } catch {
      setSheet(EMPTY_SHEET);
    }
  }

  function handleDragOver(e) { e.preventDefault(); e.stopPropagation(); setDragActive(true); }
  function handleDragLeave(e) { e.preventDefault(); e.stopPropagation(); setDragActive(false); }
  function handleDrop(e) {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    selectFile(e.dataTransfer.files?.[0]);
  }

  async function handleImport() {
    if (!file || !phoneCol) return;
    try {
      setSubmitting(true);
      setError("");
      // Sent with standard "phone" / "name" headers and cleaned-up numbers.
      const res = await importContacts(sheetToCsvFile(sheet, file.name), segmentId);
      setSummary(res.summary);
      setInvalidRows(res.invalidRows || []);
      onImported();
    } catch (err) {
      setError(err?.response?.data?.message || "The import didn't finish. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/40 sm:items-center sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-contacts-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface shadow-[var(--shadow-pop)] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 id="import-contacts-title" className="text-[18px] font-semibold text-ink">
              {title || "Import contacts"}
            </h2>
            <p className="mt-0.5 text-[14px] text-ink-muted">
              {description || "Upload a CSV file with a phone number column. Name and tags columns are optional."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!file ? (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("import-contacts-file")?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragActive
                    ? "border-brand-600 bg-brand-50"
                    : "border-line-strong bg-canvas hover:border-ink-subtle"
                }`}
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[var(--shadow-card)] ${
                    dragActive ? "text-brand-700" : "text-ink-muted"
                  }`}
                >
                  <UploadCloud size={20} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-ink">
                    {dragActive ? "Drop file here" : "Drag & drop a CSV file"}
                  </p>
                  <p className="mt-1 text-[14px] text-ink-muted">
                    or <span className="font-semibold text-brand-700">browse</span> your computer
                  </p>
                </div>
                <input
                  id="import-contacts-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => selectFile(e.target.files?.[0])}
                  className="hidden"
                />
              </div>

              <div className="mt-4 rounded-xl border border-line px-4 py-3.5 text-[14px]">
                <p className="font-medium text-ink">Not sure how to format your file?</p>
                <p className="mt-1 text-ink-muted">
                  Indian numbers can be written with or without 91 (9876543210 or +91 98765 43210). Other countries need their country code.
                </p>
                <Button variant="ghost" size="sm" leftIcon={Download} onClick={downloadSample} className="mt-2 -ml-2">
                  Download a sample file
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand-700">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-ink">{file.name}</p>
                    <p className="text-[13px] text-ink-muted">
                      <span className="tabular-nums">{plural(counts.total, "contact")}</span> in this file
                    </p>
                  </div>
                </div>
                {!summary && (
                  <button
                    type="button"
                    onClick={reset}
                    aria-label="Remove file"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface hover:text-ink"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Before import: what will happen */}
              {!summary && sheet.columns.length > 0 && !phoneCol && (
                <div className="mt-3 rounded-xl border border-warning/20 bg-warning-soft px-4 py-3.5 text-[14px] text-warning">
                  <p className="font-semibold">Which column has the phone numbers?</p>
                  <select
                    className="mt-2 h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[14px] text-ink"
                    defaultValue=""
                    onChange={(e) => e.target.value && setSheet(setColumnRole(sheet, e.target.value, "phone"))}
                  >
                    <option value="">Choose a column…</option>
                    {sheet.columns.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {!summary && phoneCol && counts.total > 0 && (
                <div className="mt-3 space-y-1.5 rounded-xl bg-canvas px-4 py-3.5 text-[14px]">
                  <p className="flex items-center gap-2 text-ink">
                    <CheckCircle size={16} className="shrink-0 text-brand-600" />
                    <span><strong className="font-semibold tabular-nums">{plural(counts.total - badNumbers - counts.duplicates, "contact")}</strong> ready to import</span>
                  </p>
                  {badNumbers > 0 && (
                    <p className="flex items-center gap-2 text-warning">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{plural(badNumbers, "number")} look wrong or empty and will be skipped</span>
                    </p>
                  )}
                  {counts.duplicates > 0 && (
                    <p className="text-ink-muted">{plural(counts.duplicates, "duplicate")} in the file will be added only once</p>
                  )}
                  <p className="pt-1 text-[13px] text-ink-muted">
                    Phone numbers are read from the &ldquo;{phoneCol.label}&rdquo; column.
                  </p>
                </div>
              )}

              {!summary && sheet.columns.length > 0 && counts.total === 0 && (
                <p className="mt-3 rounded-lg bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
                  This file has column headers but no contacts under them.
                </p>
              )}

              {/* After import: what happened */}
              {summary && (
                <div className="mt-3 rounded-xl bg-canvas px-4 py-3.5 text-[14px]">
                  <p className="font-semibold text-ink">Import complete</p>
                  <ul className="mt-1.5 space-y-0.5 text-ink-muted">
                    <li><strong className="font-semibold text-ink tabular-nums">{summary.created}</strong> new contacts added</li>
                    {summary.updated > 0 && <li>{summary.updated} existing contacts updated (name or tags)</li>}
                    {summary.skipped > 0 && <li>{summary.skipped} already in your contacts, left unchanged</li>}
                    {summary.invalid > 0 && <li className="text-warning">{summary.invalid} skipped because the phone number was wrong or empty</li>}
                  </ul>
                  {invalidRows.length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-[13px] font-medium text-ink">Rows to fix in your file</p>
                      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-[13px] text-ink-muted">
                        {invalidRows.slice(0, 50).map((r) => (
                          <li key={r.row}>
                            Row {r.row}{r.phone ? ` (${r.phone})` : ""}: {r.reason}
                          </li>
                        ))}
                        {invalidRows.length > 50 && <li>…and {invalidRows.length - 50} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <p className="mt-3 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="secondary" onClick={handleClose}>
            {summary ? "Done" : "Cancel"}
          </Button>
          {!summary && (
            <Button
              onClick={handleImport}
              disabled={!file || !phoneCol || counts.total === 0 || submitting}
              leftIcon={UploadCloud}
              className="disabled:cursor-not-allowed"
            >
              {submitting ? "Importing…" : "Import"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
