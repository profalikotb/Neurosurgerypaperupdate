import { after } from "next/server";
import { withUser, ok } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { runJobs } from "@/lib/jobs";
import { weekStartOf } from "@/lib/ai/weekly";

export const maxDuration = 300;

export const POST = withUser(async () => {
  const ws = weekStartOf();
  const jobId = await enqueue("weekly_report", { weekStart: ws }, { dedupe: `weekly:${ws}:manual`, priority: 8 });
  after(() => runJobs(270_000).catch(() => null));
  return ok({ jobId });
});
