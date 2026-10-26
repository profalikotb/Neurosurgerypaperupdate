import { after } from "next/server";
import { withUser, ok } from "@/lib/api";
import { scheduleDaily, runJobs } from "@/lib/jobs";

export const maxDuration = 300;

export const POST = withUser(async () => {
  await scheduleDaily();
  after(() => runJobs(270_000).catch(() => null));
  return ok({ queued: true });
});
