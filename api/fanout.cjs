/* ============================================================================
 * api/fanout.cjs — emergency notification FAN-OUT engine (the one genuinely
 *   scale-sensitive op: blasting ~92k families across sms/voice/email/app).
 *
 * Real mechanics, simulated providers (no Twilio/SES):
 *   • in-process job queue + a pool of concurrent workers draining it
 *   • per-channel token-bucket rate limits (windowed, refilled each tick)
 *   • exponential-backoff retry on a simulated ~2% transient failure rate,
 *     capped at MAX_RETRIES then marked failed
 *   • batching + backpressure: a worker only pulls what its bucket allows,
 *     so a flooded channel naturally throttles without blocking the others
 *   • per-recipient status queued→sent→delivered|failed, aggregated live
 *
 * Mount contract: module.exports = (sqlite) => ({ routes: { 'POST /api/blast', 'GET /api/blast' } })
 *   POST returns immediately { blastId, recipients, channels, accepted } and
 *   sending continues async on a timer. GET reports live per-channel metrics.
 *
 * ---- configured provider rates (tunable) ----------------------------------
 * A token bucket enforces a per-second ceiling on each channel, exactly,
 * regardless of tick cadence. Two rate profiles:
 *   • DEMO_RATES (active): throttled so a ~1k sms+email blast takes a couple
 *     seconds with visible, granular per-poll progress — the mechanics
 *     (throttling, retries, backoff, live metrics) are observable.
 *   • PROD_RATES: real-world provider ceilings. Set FANOUT_PROD=1 to switch,
 *     e.g. for a true ~92k-family load test where the queue/backpressure is the
 *     interesting behavior. At prod rates a 1k blast clears almost instantly.
 * Per-second value == token-bucket capacity == tokens refilled per full second.
 * ==========================================================================*/
const PROD_RATES = {
  sms: 2000,    // Twilio short-code / messaging-service tier
  email: 5000,  // SES default sustained
  voice: 300,   // concurrent-call ceiling
  app: 10000,   // FCM/APNs push
};
const DEMO_RATES = { sms: 400, email: 700, voice: 120, app: 1500 };
const RATES = process.env.FANOUT_PROD ? PROD_RATES : DEMO_RATES;
const CHANNELS = Object.keys(RATES);

const TICK_MS = 50;             // scheduler granularity → buckets refill RATE*TICK_MS/1000 per tick
const WORKERS = 8;              // concurrent workers draining the queue
const BATCH = 500;              // max recipients a single worker claims per tick (backpressure unit)
const FAIL_RATE = 0.02;         // simulated transient send-failure probability
const DELIVERY_FAIL_RATE = 0.01;// of those "sent", a few never confirm delivery (hard fail)
const MAX_RETRIES = 4;          // cap, then mark failed
const BACKOFF_BASE_MS = 100;    // retry delay = BACKOFF_BASE_MS * 2^attempt (exponential)

const rid = (p) => `${p}_${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;
const now = () => Date.now();

// blastId -> live state (kept in-module, the spec's Map)
const BLASTS = new Map();

function emptyMetrics() {
  const m = {};
  for (const c of CHANNELS) m[c] = { queued: 0, sent: 0, delivered: 0, failed: 0, retried: 0 };
  return m;
}

// ---- recipient resolution -------------------------------------------------
// audience: { recipientIds:[...] }  OR  { role, schoolId }  (parameterized SQL)
// An explicit recipientIds array always wins — even when empty — so a caller
// who passes [] gets zero recipients, NOT an accidental blast to every parent.
function resolveRecipients(sqlite, audience = {}) {
  if (Array.isArray(audience.recipientIds)) {
    return audience.recipientIds.slice();
  }
  const role = audience.role || 'parent';
  const rows = audience.schoolId
    ? sqlite.prepare('SELECT id FROM users WHERE role=? AND school_id=?').all(role, audience.schoolId)
    : sqlite.prepare('SELECT id FROM users WHERE role=?').all(role);
  return rows.map((r) => r.id);
}

// ---- the engine -----------------------------------------------------------
// Each (recipient,channel) is one job. Jobs live on per-channel queues so a
// channel's token bucket throttles only its own work (backpressure isolation).
function startBlast(sqlite, { audience, channels, title, body }) {
  const recipientIds = resolveRecipients(sqlite, audience);
  const chans = (Array.isArray(channels) ? channels : []).filter((c) => RATES[c]);
  const useChannels = chans.length ? chans : ['app']; // default to push if none valid

  const blastId = rid('blast');
  const state = {
    blastId, title: title || '(untitled alert)', body: body || '',
    recipients: recipientIds.length,
    channels: useChannels,
    metrics: emptyMetrics(),
    startedAt: now(),
    endedAt: null,
    done: recipientIds.length === 0,
    // per-channel work. `queue` is drained with a head index (O(1) dequeue —
    // never Array.shift, which would make each tick O(n) and a 92k blast O(n²)).
    // `retry` is a SEPARATE small list of backed-off jobs so the hot path never
    // rescans them; it stays tiny because retries are ~2% and capped.
    queue: {},                  // channel -> { jobs:[], head:int }
    retry: {},                  // channel -> [ jobs awaiting their backoff ]
    delivering: [],             // [{deliverAt, channel}] accepted msgs awaiting receipt
    pending: {},                // channel -> jobs not yet delivered/failed (O(1) done check)
    buckets: {},                // channel -> remaining tokens this window
    timer: null,
  };

  for (const c of useChannels) {
    state.queue[c] = { jobs: recipientIds.map((id) => ({ id, attempt: 0, readyAt: 0 })), head: 0 };
    state.retry[c] = [];
    state.pending[c] = recipientIds.length;
    state.buckets[c] = 0;
    state.metrics[c].queued = recipientIds.length;
  }
  BLASTS.set(blastId, state);

  if (state.done) return state;   // nothing to send

  // refill buckets + run the worker pool every tick until every queue is empty
  state.timer = setInterval(() => tick(state), TICK_MS);
  state.timer.unref?.();          // don't keep the process alive just for a blast
  return state;
}

function tick(state) {
  const tNow = now();
  for (const c of state.channels) {
    // 1) refill this channel's token bucket for the window (cap == per-sec rate)
    const refill = (RATES[c] * TICK_MS) / 1000;
    state.buckets[c] = Math.min(RATES[c], state.buckets[c] + refill);

    // 2) move any retry jobs whose backoff has elapsed back to the live queue.
    //    Scan the small retry list once; keep the not-yet-ready ones.
    const rq = state.retry[c];
    if (rq.length) {
      const q = state.queue[c];
      const stillWaiting = [];
      for (const job of rq) {
        if (job.readyAt <= tNow) q.jobs.push(job);  // ready → back of live queue
        else stillWaiting.push(job);
      }
      state.retry[c] = stillWaiting;
    }
  }

  // 3) worker pool: WORKERS workers each claim up to BATCH ready jobs, bounded
  //    by the channel's available tokens (backpressure). Head-index dequeue.
  for (let w = 0; w < WORKERS; w++) {
    for (const c of state.channels) {
      const q = state.queue[c];
      let budget = Math.min(BATCH, Math.floor(state.buckets[c]));
      while (budget > 0 && q.head < q.jobs.length) {
        const job = q.jobs[q.head++];
        state.buckets[c] -= 1;
        budget -= 1;
        sendOne(state, c, job);
      }
      // compact the queue once it's fully drained so memory doesn't grow
      if (q.head >= q.jobs.length && q.jobs.length) { q.jobs.length = 0; q.head = 0; }
    }
  }

  // 4) delivery sweep — reconcile accepted msgs whose receipt time has elapsed.
  //    Done in ONE batched pass per tick (NOT a setTimeout per message, which
  //    at 17k/s would spawn thousands of concurrent timers and stall the loop).
  //    `delivering` stays small: bounded by accept-rate × latency-window.
  const del = state.delivering;
  if (del.length) {
    const keep = [];
    for (const d of del) {
      if (d.deliverAt > tNow) { keep.push(d); continue; }
      const m = state.metrics[d.channel];
      if (Math.random() < DELIVERY_FAIL_RATE) m.failed += 1;  // never confirmed
      else m.delivered += 1;
      state.pending[d.channel] -= 1;                          // terminal either way
    }
    state.delivering = keep;
  }

  maybeFinish(state);
}

// O(channels) completion check: every channel has 0 pending (covers queued,
// in-backoff, and awaiting-delivery — pending only drops on a terminal outcome)
function maybeFinish(state) {
  if (state.done) return;
  for (const c of state.channels) if (state.pending[c] > 0) return;
  finish(state);
}

// simulate a provider round-trip for one message
function sendOne(state, channel, job) {
  const m = state.metrics[channel];

  if (Math.random() < FAIL_RATE) {
    // transient failure → exponential backoff retry on the separate retry list,
    // capped at MAX_RETRIES. `pending` only drops on a terminal outcome.
    if (job.attempt < MAX_RETRIES) {
      job.attempt += 1;
      m.retried += 1;
      job.readyAt = now() + BACKOFF_BASE_MS * Math.pow(2, job.attempt - 1);
      state.retry[channel].push(job);
    } else {
      m.failed += 1;              // exhausted retries → terminal
      state.pending[channel] -= 1;
    }
    return;
  }

  m.sent += 1;                    // accepted by provider
  // delivery receipt comes back asynchronously a beat later — recorded for the
  // next delivery sweep instead of its own timer (see tick step 4).
  state.delivering.push({ deliverAt: now() + 20 + Math.random() * 60, channel });
}

function finish(state) {
  if (state.done) return;
  state.done = true;
  state.endedAt = now();
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

// ---- live report ----------------------------------------------------------
function report(state) {
  const tNow = state.endedAt || now();
  const elapsedMs = tNow - state.startedAt;

  // jobs still in flight = sum of per-channel pending (O(channels), exact)
  let remaining = 0, reconciled = 0;
  for (const c of state.channels) {
    remaining += state.pending[c];
    const m = state.metrics[c];
    reconciled += m.delivered + m.failed;
  }

  // throughputPerSec: average reconciled-jobs/sec over the whole run (the number
  // you'd quote). ETA uses a RECENT rate so it tracks current speed — a
  // cumulative average would keep ETA high after an early burst even when the
  // run has slowed (or vice-versa).
  const throughputPerSec = elapsedMs > 0 ? +((reconciled / (elapsedMs / 1000)).toFixed(1)) : 0;
  const sample = state._rate; // { atMs, reconciled } snapshot from a prior report
  let recentRate = throughputPerSec;
  if (sample && tNow > sample.atMs) {
    const dr = reconciled - sample.reconciled, dt = (tNow - sample.atMs) / 1000;
    if (dt > 0) recentRate = dr / dt;
  }
  if (!state.done) state._rate = { atMs: tNow, reconciled };
  const etaSeconds = state.done ? 0 : (recentRate > 0 ? +((remaining / recentRate).toFixed(1)) : null);

  return {
    blastId: state.blastId,
    recipients: state.recipients,
    channels: state.channels,
    perChannel: state.metrics,
    throughputPerSec,
    elapsedMs,
    etaSeconds,
    done: state.done,
  };
}

// ---- routes ---------------------------------------------------------------
module.exports = (sqlite) => ({
  routes: {
    // fire-and-forget: resolve recipients, enqueue, return immediately
    'POST /api/blast': ({ body }) => {
      const { audience, channels, title, body: msg } = body || {};
      const state = startBlast(sqlite, { audience: audience || {}, channels, title, body: msg });
      return { blastId: state.blastId, recipients: state.recipients, channels: state.channels, accepted: true };
    },
    // live status/metrics for a blast
    'GET /api/blast': ({ params }) => {
      const id = params && params.get ? params.get('id') : null;
      const state = id && BLASTS.get(id);
      if (!state) throw new Error(`unknown blastId: ${id}`);
      return report(state);
    },
  },
});

// exported for self-test harnesses (not part of the HTTP surface)
module.exports._internals = { startBlast, report, BLASTS, RATES, resolveRecipients };
