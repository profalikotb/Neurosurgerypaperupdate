import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/auth";
import { scheduleDaily, runJobs } from "@/lib/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scheduleDaily();
  const r = await runJobs(250_000);
  return NextResponse.json({ ok: true, ...r });
}
