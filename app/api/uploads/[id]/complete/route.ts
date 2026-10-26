import { after } from "next/server";
import { withUser, ok, idOf } from "@/lib/api";
import { enqueue } from "@/lib/queue";
import { runJobs } from "@/lib/jobs";

export const maxDuration = 300;

/** Step 2: file is in storage → queue background extraction. */
export const POST = withUser<{ params: Promise<{ id: string }> }>(async (_req, _u, ctx) => {
  const id = await idOf(ctx);
  const jobId = await enqueue("extract_document", { documentId: id, from: 1 }, { dedupe: `doc:${id}:1`, priority: 7 });
  after(() => runJobs(270_000).catch(() => null));
  return ok({ jobId });
});
