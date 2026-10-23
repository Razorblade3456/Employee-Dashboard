"use client";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { WorkspaceStore } from "@/lib/use-workspace";
import { today, addMonths, addDays } from "@/lib/time";
import { Modal } from "./ui";
export default function ExportDialog({
  store,
  close,
}: {
  store: WorkspaceStore;
  close: () => void;
}) {
  const d = store.data!,
    first = today(d.settings.timezone).slice(0, 8) + "01",
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Save an Excel workbook" onClose={close}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const { downloadExcel } = await import("@/lib/excel-export");
            await downloadExcel(d, store.role!, {
              from: String(f.get("from")),
              to: String(f.get("to")),
              employeeIds:
                String(f.get("employee")) === "all"
                  ? undefined
                  : [String(f.get("employee"))],
            });
            store.notify("Excel workbook downloaded");
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="section-icon">
          <FileSpreadsheet size={25} />
        </span>
        <p className="muted">
          {store.role === "manager"
            ? "Save your team, schedules, publication dates, actual time entries, and management notes. Payroll rates are excluded."
            : "Save payroll estimates, actual time entries, effective pay rates, and the calculation policy."}
        </p>
        <div className="form-pair">
          <label>
            From
            <input type="date" name="from" defaultValue={first} required />
          </label>
          <label>
            Through
            <input
              type="date"
              name="to"
              defaultValue={addDays(addMonths(first, 1), -1)}
              required
            />
          </label>
        </div>
        <label>
          Team member
          <select name="employee">
            <option value="all">All team members</option>
            {d.employees.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">
          Downloads a real .xlsx file you can save and open in Microsoft Excel.
          This is a snapshot of the selected dates.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Download size={16} />
            {busy ? "Preparing…" : "Download Excel (.xlsx)"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
