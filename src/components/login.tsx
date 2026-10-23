"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ShieldCheck,
  Users,
  Wallet,
  Layers,
  ArrowLeft,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { Role } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { WorkspaceStore } from "@/lib/use-workspace";
const roles = [
  {
    id: "employee" as Role,
    title: "Employee",
    description: "Your next shift. Your workday, simplified.",
    icon: CalendarDays,
  },
  {
    id: "manager" as Role,
    title: "Manager",
    description: "Bring your people and plans together.",
    icon: Users,
  },
  {
    id: "accountant" as Role,
    title: "Accountant",
    description: "Clear hours. Confident payroll estimates.",
    icon: Wallet,
  },
];
export default function Login({
  store,
  dark,
  toggle,
}: {
  store: WorkspaceStore;
  dark: boolean;
  toggle: () => void;
}) {
  const [selected, setSelected] = useState<Role | null>(null),
    [mode, setMode] = useState<"login" | "signup" | "setup">("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [info, setInfo] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const f = new FormData(e.currentTarget);
    try {
      if (!supabase) return;
      const email = String(f.get("email")),
        password = String(f.get("password"));
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo(
          "Check your email to confirm your account, then sign in. Managers link employee records by verified email.",
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (mode === "setup") {
          const res = await fetch("/api/setup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + data.session!.access_token,
            },
            body: JSON.stringify({
              role: selected,
              code: f.get("code"),
              secret: f.get("secret"),
            }),
          });
          const result = await res.json();
          if (!res.ok) throw Error(result.error);
          await store.reload();
        } else await store.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={"login-page " + (dark ? "dark" : "")}>
      <header className="login-header">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          gather<span className="brand-dot">.</span>
        </a>
        <button
          className="icon-button"
          onClick={toggle}
          aria-label="Toggle color theme"
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>
      <main className="login-main">
        <section className="login-story">
          <span className="eyebrow">
            <span className="live-dot" /> A LITTLE MORE TOGETHER
          </span>
          <h1>
            Good work starts
            <br />
            with <em>your people.</em>
          </h1>
          <p>
            A calm, connected space for schedules, teams, and everything that
            makes the workday work.
          </p>
          <div className="story-checks">
            <span>
              <Check size={16} /> Plans everyone can count on
            </span>
            <span>
              <Check size={16} /> The right information, for the right people
            </span>
            <span>
              <Check size={16} /> Less admin. More room to do good work.
            </span>
          </div>
          <div className="story-card">
            <div className="story-avatar-row">
              {["AM", "OC", "JW", "SM"].map((s, i) => (
                <span
                  key={s}
                  style={{
                    background: ["#dddff7", "#f2dfc9", "#d7e8dc", "#e9d8eb"][i],
                  }}
                >
                  {s}
                </span>
              ))}
              <span className="story-online">A team in sync</span>
            </div>
            <div className="story-mini">
              <div>
                <small>THIS WEEK</small>
                <h3>Everything in its place.</h3>
              </div>
              <span className="mini-bars">
                {[35, 65, 45, 80, 60, 95, 70].map((h, i) => (
                  <i key={i} style={{ height: h + "%" }} />
                ))}
              </span>
            </div>
            <span className="story-card-footer">
              <span className="live-dot" /> A better rhythm for every workday{" "}
              <ShieldCheck size={17} />
            </span>
          </div>
        </section>
        <section className="login-panel">
          <span className="eyebrow">YOUR WORKSPACE, YOUR WAY</span>
          <h2>
            {selected && store.live
              ? "Welcome back."
              : "Let’s get you settled."}
          </h2>
          <p>
            {store.live
              ? "Choose your workspace and sign in with your account."
              : "Explore the sample workspace. Choose a perspective to begin."}
          </p>
          {selected && store.live ? (
            <form onSubmit={submit} className="auth-form">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setSelected(null);
                  setError("");
                }}
              >
                <ArrowLeft size={15} /> Change role
              </button>
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  required
                  minLength={12}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder="Your account password"
                />
              </label>
              {mode === "setup" && (
                <>
                  <label>
                    Private setup secret
                    <input
                      name="secret"
                      type="password"
                      minLength={32}
                      required
                    />
                  </label>
                  <label>
                    First-time role code
                    <input
                      name="code"
                      type="password"
                      inputMode="numeric"
                      required
                    />
                  </label>
                  <p className="fine-print">
                    Privileged enrollment requires a verified account and the
                    server administrator’s private setup secret.
                  </p>
                </>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {info && (
                <p role="status" className="notice">
                  {info}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "setup"
                      ? "Set up " + selected
                      : "Sign in"}
                <ArrowRight size={17} />
              </button>
              <div className="auth-links">
                <button
                  type="button"
                  onClick={() =>
                    setMode(mode === "signup" ? "login" : "signup")
                  }
                >
                  {mode === "signup"
                    ? "Already have an account?"
                    : "Create an employee account"}
                </button>
                {selected !== "employee" && (
                  <button
                    type="button"
                    onClick={() =>
                      setMode(mode === "setup" ? "login" : "setup")
                    }
                  >
                    {mode === "setup" ? "Back to sign in" : "First-time setup"}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="role-options">
              {roles.map(({ id, title, description, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() =>
                    store.live ? setSelected(id) : store.chooseRole(id)
                  }
                  className={"role-option " + id}
                >
                  <span className="role-icon">
                    <Icon size={23} />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          )}
          <div className="login-footnote">
            <ShieldCheck size={17} />
            <span>
              {store.live
                ? "Secure accounts. Permissions enforced in the database."
                : "LOCAL DEMO · Sample data saved only in this browser. Role switching is for exploration, not authentication."}
            </span>
          </div>
        </section>
      </main>
      <footer className="login-footer">
        <span>Gather · A better workday.</span>
        <span>People first. Always.</span>
      </footer>
    </div>
  );
}
