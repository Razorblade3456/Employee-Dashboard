"use client";
import { useState, useCallback } from "react";
import { KeyRound, ArrowRight } from "lucide-react";
import { WorkspaceStore } from "@/lib/use-workspace";
import { Modal } from "./ui";
export default function PasscodeDialog({ store }: { store: WorkspaceStore }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const close = useCallback(() => store.cancelRole(), [store.cancelRole]);
  if (!store.requestedRole) return null;
  const label = store.requestedRole === "manager" ? "Manager" : "Accountant";
  return (
    <Modal title={label + " access"} onClose={close}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const code = String(new FormData(e.currentTarget).get("passcode"));
          try {
            await store.unlockRole(code);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="section-icon">
          <KeyRound size={24} />
        </span>
        <p className="muted">
          Enter the {label.toLowerCase()} passcode to open this workspace.
        </p>
        <label>
          Passcode
          <input
            autoFocus
            name="passcode"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p className="fine-print">
          Local demo access. You can change this role’s passcode in Settings.
          Live workspaces require a verified account.
        </p>
        <div className="modal-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Checking…" : "Unlock " + label}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
