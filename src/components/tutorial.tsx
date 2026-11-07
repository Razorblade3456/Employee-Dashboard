"use client";
import { useState } from "react";
import { Role } from "@/lib/types";
export type TutorialPage =
  | "overview"
  | "schedule"
  | "team"
  | "notes"
  | "timesheets"
  | "payroll"
  | "settings";
type Step = {
  title: string;
  page: TutorialPage;
  steps: string[];
  example: string;
};
export const tutorials: Record<Role, Step[]> = {
  employee: [
    {
      title: "Find your shifts",
      page: "schedule",
      steps: [
        "Open Schedule. Your own month is shown first.",
        "Use the arrows or Today to change dates. Choose Week or Day for more detail.",
        "Read each shift's start, end, and unpaid break.",
      ],
      example:
        "A published 09:00–17:30 shift with a 30-minute unpaid break is 8 scheduled hours.",
    },
    {
      title: "Understand pending dates",
      page: "schedule",
      steps: [
        "PENDING means your manager has not published that date.",
        "A published date without a shift is a confirmed day off.",
        "If a manager edits a shift, that date becomes pending until republished. Check again before your shift.",
      ],
      example:
        "A blank published Tuesday is a day off; a PENDING Wednesday is not yet confirmed.",
    },
    {
      title: "Keep your account private",
      page: "settings",
      steps: [
        "Open Settings to choose Day, Night, or System.",
        "On a live workspace, use your own verified account. Never share a manager's credentials.",
        "Sign out on shared devices. This tutorial stays available in Settings.",
      ],
      example:
        "Employees can see their own published shifts, but cannot open payroll or edit schedules.",
    },
  ],
  manager: [
    {
      title: "Maintain your team",
      page: "team",
      steps: [
        "Open People and choose Add employee.",
        "Use the employee's verified work email, department, and job title.",
        "When someone leaves, edit and deactivate them. Keep the record so timesheet history remains available.",
      ],
      example:
        "Deactivate a departing employee rather than deleting past payroll records.",
    },
    {
      title: "Plan once, reuse carefully",
      page: "schedule",
      steps: [
        "Open Schedule and choose a week, employee, or department.",
        "Add a shift or edit a shift card. Overnight end times belong to the next day.",
        "Use Copy week for a non-overlapping target week. Existing shifts are retained; review conflicts before publishing.",
      ],
      example:
        "22:00–06:00 ends the next morning. Overlap warnings also check the midnight boundary.",
    },
    {
      title: "Publish and handle changes",
      page: "schedule",
      steps: [
        "Review draft dates and highlighted conflicts, then Publish a date range.",
        "For sickness, record a Call-off in Team notes and edit or remove the affected shift.",
        "Republish changed dates so employees can see the final schedule.",
      ],
      example:
        "A changed Monday shift becomes draft. Employees see PENDING until you publish Monday again.",
    },
    {
      title: "Review actual time safely",
      page: "timesheets",
      steps: [
        "Open Timesheets to record actual work, breaks, and corrections.",
        "Enter a reason for adjustments; never use scheduled hours as a substitute for actual hours.",
        "If another manager edited the same record, close your form, review the current record, then retry.",
      ],
      example:
        "A missing clock entry needs review; no hours should be invented. Payroll rates belong to accountants.",
    },
  ],
  accountant: [
    {
      title: "Review actual work",
      page: "timesheets",
      steps: [
        "Open Timesheets and select a date range and employee.",
        "Check unapproved entries, breaks, and adjustment reasons.",
        "Correct mistakes before approval. Unapproved hours are shown separately and are not paid.",
      ],
      example:
        "A scheduled shift without a timesheet is a review item, not an automatic 8-hour payment.",
    },
    {
      title: "Keep wage history",
      page: "payroll",
      steps: [
        "Open Payroll and set an employee's effective-dated hourly rate.",
        "Add a new effective date for a raise rather than rewriting earlier rates.",
        "Resolve missing-rate warnings before using the report.",
      ],
      example:
        "A raise effective July 1 applies to July work; June work retains the earlier rate.",
    },
    {
      title: "Choose a pay period",
      page: "payroll",
      steps: [
        "Choose Week, Two weeks, Month, or a custom date range.",
        "Compare regular, overtime, and pending hours separately.",
        "Export CSV or Excel for the same range. All totals are gross estimates, not finalized payroll or tax calculations.",
      ],
      example:
        "A midweek report still includes earlier workweek hours when allocating weekly overtime.",
    },
    {
      title: "Configure the policy",
      page: "settings",
      steps: [
        "In Settings, set the workweek start, thresholds, and multipliers for your business.",
        "Review policy with your payroll specialist. Current policy changes recalculate historical estimates.",
        "Keep an exported reviewed snapshot and use your payroll provider to finalize payment.",
      ],
      example:
        "The dashboard does not lock finalized payroll. Historical wage rates are retained, but policy history requires a future extension.",
    },
  ],
};
export default function RoleTutorial({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate: (page: TutorialPage) => void;
}) {
  const [index, setIndex] = useState(0),
    [example, setExample] = useState(false);
  const steps = tutorials[role],
    step = steps[index];
  function move(next: number) {
    setIndex(next);
    setExample(false);
  }
  return (
    <div className="role-tutorial">
      <p className="fine-print">
        {role[0].toUpperCase() + role.slice(1)} guide · {index + 1} of{" "}
        {steps.length} · No records are changed by this tutorial.
      </p>
      <nav className="tutorial-progress" aria-label="Tutorial topics">
        {steps.map((s, i) => (
          <button
            key={s.title}
            className={i === index ? "active" : ""}
            aria-current={i === index ? "step" : undefined}
            onClick={() => move(i)}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>
      <h3>{step.title}</h3>
      <ol>
        {step.steps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      <button
        className="text-link"
        aria-expanded={example}
        onClick={() => setExample(!example)}
      >
        {example ? "Hide example" : "Show an example"}
      </button>
      {example && <p className="notice tutorial-example">{step.example}</p>}
      <div className="tutorial-actions">
        <button
          className="button"
          disabled={!index}
          onClick={() => move(index - 1)}
        >
          Back
        </button>
        <button className="button" onClick={() => onNavigate(step.page)}>
          Open{" "}
          {step.page === "team"
            ? "People"
            : step.page[0].toUpperCase() + step.page.slice(1)}
        </button>
        {index < steps.length - 1 && (
          <button className="button primary" onClick={() => move(index + 1)}>
            Next topic
          </button>
        )}
      </div>
      <p className="fine-print">
        Close with × or Escape at any time. Reopen this guide from Settings →
        How to Use This Dashboard.
      </p>
    </div>
  );
}
