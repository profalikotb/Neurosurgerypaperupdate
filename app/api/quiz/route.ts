import { withUser, ok, bad } from "@/lib/api";
import { generateQuiz } from "@/lib/ai/quiz";
import { hasLLM } from "@/lib/env";

export const maxDuration = 300;

export const POST = withUser(async (req, u) => {
  if (!hasLLM()) return bad("No AI provider configured.");
  const b = await req.json();
  if (!b.paperId && !b.topic) return bad("paperId or topic required");
  const id = await generateQuiz(u.id, { paperId: b.paperId ? Number(b.paperId) : undefined, topic: b.topic });
  return ok({ quizId: id });
});
