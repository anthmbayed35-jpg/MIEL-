"use client";

import { useState } from "react";
import { addMember } from "@/app/admin/(app)/settings/team/actions";
import { ActionForm, SubmitButton } from "./ActionForm";
import { Field } from "./ui";

/**
 * "Add member" (owner only; the team page itself is owner-only). Creates an active account with a generated temporary
 * password that is shown once. The owner never types or picks the password. A second owner needs a typed confirmation.
 */
export function AddMemberPanel() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("staff");
  return (
    <div className="mb-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="pill-btn pill-lime">
        {open ? "Close" : "Add member"}
      </button>
      {open && (
        <div className="admin-card mt-4">
          <h2 className="text-[18px] font-semibold text-fg">Add a team member</h2>
          <p className="mt-1 mb-4 text-[14px] text-body">
            Creates their account right away with a temporary password that you will see once. At first sign-in they must choose their own password and set up two-factor authentication.
          </p>
          <ActionForm action={addMember} resetOnSuccess className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><input name="name" required minLength={2} autoComplete="off" className="a-input" /></Field>
            <Field label="Email"><input name="email" type="email" required autoComplete="off" className="a-input" /></Field>
            <Field label="Role">
              <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="a-input">
                <option value="staff">staff</option>
                <option value="manager">manager</option>
                <option value="owner">owner (full access)</option>
              </select>
            </Field>
            {role === "owner" && (
              <Field label="Confirm: type CREATE OWNER" hint="An owner can change settings, manage the team, download backups and delete data.">
                <input name="confirm_owner" required autoComplete="off" placeholder="CREATE OWNER" className="a-input" />
              </Field>
            )}
            <div className="md:col-span-2">
              <SubmitButton variant="lime">Create member</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
