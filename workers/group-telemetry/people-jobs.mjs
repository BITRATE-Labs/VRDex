const USER_ID = /^usr_[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export async function resolvePersonName(userId, provider) {
  if (!USER_ID.test(userId)) return { status: "unavailable" };
  try {
    const user = await provider.request(`/users/${userId}`, { maxResponseBytes: 256 * 1024 });
    if (typeof user?.id !== "string" || user.id.toLowerCase() !== userId || typeof user.displayName !== "string" ||
        !user.displayName.trim() || user.displayName.length > 256 || /[\u0000-\u001f\u007f]/u.test(user.displayName)) return { status: "transient" };
    return { status: "resolved", userId, displayName: user.displayName.trim() };
  } catch (error) {
    if (["authentication", "rate_limit"].includes(error?.category) || [401, 429].includes(error?.status)) throw error;
    if ([403, 404, 410].includes(error?.status)) return { status: "unavailable" };
    return { status: "transient", ...(Number.isFinite(error?.retryAfterMs) ? { retryAfterMs: Math.max(0, error.retryAfterMs) } : {}) };
  }
}

/** Claim reserves exactly one GET in the shared budgets after source authorization. */
export async function checkPeople({ control, provider, accountBudget, heartbeat, isStopping, reportDeadSession, pauseWithHeartbeats, clock = Date.now }) {
  if (isStopping() || accountBudget.retryAfterMs(1, clock()) > 0) return 0;
  await heartbeat();
  if (isStopping()) return 0;
  const { jobs = [] } = await control.send("people_claim", { limit: 1 }, { requirePayload: true });
  const job = jobs[0];
  if (!job) return 0;
  const lease = { personId: job.personId, leaseToken: job.leaseToken };
  if (isStopping()) {
    await control.send("people_release", lease, { requirePayload: true });
    return 0;
  }
  accountBudget.tryConsume(1, clock());
  let result;
  try {
    result = await resolvePersonName(job.userId, provider);
  } catch (error) {
    if (error?.category === "authentication" || error?.status === 401) {
      try { await control.send("people_result", { ...lease, result: { status: "transient" } }, { requirePayload: true }); }
      finally { await reportDeadSession(); }
      return 1;
    }
    if (error?.category === "rate_limit" || error?.status === 429) {
      const retryAfterMs = Math.max(Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : 60_000, 1_000);
      const recorded = await control.send("people_result", { ...lease, result: { status: "transient", retryAfterMs, rateLimited: true } }, { requirePayload: true });
      if (recorded.cooldownRecorded !== true) throw new Error("People request cooldown was not recorded.");
      await pauseWithHeartbeats(retryAfterMs);
      return 1;
    }
    throw error;
  }
  await control.send("people_result", { ...lease, result }, { requirePayload: true });
  return 1;
}
