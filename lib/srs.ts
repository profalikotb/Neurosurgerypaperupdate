// SM-2 spaced repetition. grade: 0 = forgot, 3 = hard, 4 = good, 5 = easy
export function sm2(card: { ease: number; interval_days: number; reps: number }, grade: 0 | 3 | 4 | 5) {
  let { ease, interval_days, reps } = card;
  if (grade < 3) { reps = 0; interval_days = 1; }
  else {
    reps += 1;
    interval_days = reps === 1 ? 1 : reps === 2 ? 4 : Math.round(interval_days * ease);
    if (grade === 3) interval_days = Math.max(1, Math.round(interval_days * 0.6));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  const due = new Date(Date.now() + interval_days * 864e5);
  return { ease: Math.round(ease * 100) / 100, interval_days, reps, due_at: due.toISOString(), last_reviewed: new Date().toISOString(), difficult: grade < 4 };
}
