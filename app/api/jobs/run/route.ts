import { NextResponse } from "next/server";
import { isCronRequest, getUser } from "@/lib/auth";
import { runJobs } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isCronRequest(req) && !(await getUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runJobs(250_000);
  return NextResponse.json({ ok: true, ...r });
}
export const GET = POST;
