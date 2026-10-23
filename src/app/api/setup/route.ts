import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
export const runtime = "nodejs";
const schema = z.object({
  role: z.enum(["manager", "accountant"]),
  code: z.string().min(4).max(128),
  secret: z.string().min(32).max(512),
});
export async function POST(request: NextRequest) {
  const secret = process.env.BOOTSTRAP_SECRET,
    url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32 || !url || !key)
    return NextResponse.json(
      {
        error:
          "Privileged setup is disabled. Ask your server administrator to configure enrollment.",
      },
      { status: 503 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 2048)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = schema.parse(JSON.parse(raw));
    const a = Buffer.from(body.secret),
      b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return NextResponse.json(
        { error: "Invalid setup credentials" },
        { status: 403 },
      );
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token)
      return NextResponse.json(
        { error: "Account authentication is required" },
        { status: 401 },
      );
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await admin.auth.getUser(token);
    if (error || !user?.email_confirmed_at)
      return NextResponse.json(
        { error: "Sign in to a verified account first" },
        { status: 401 },
      );
    const { error: setupError } = await admin.rpc("bootstrap_role", {
      p_user: user.id,
      p_role: body.role,
      p_code: body.code,
    });
    if (setupError)
      return NextResponse.json(
        { error: "Setup has already been claimed or the code is invalid." },
        { status: 403 },
      );
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid setup request" },
      { status: 400 },
    );
  }
}
