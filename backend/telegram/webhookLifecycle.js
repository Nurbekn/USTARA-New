const DEFAULT_DEADLINES = Object.freeze({ connectMs: 2000, queryMs: 5000, rollbackMs: 1000, processingMs: 30000 });

function webhookPoolOptions(source) {
  // pg-pool hides password as a non-enumerable property. A spread would lose it.
  const options = Object.defineProperties({}, Object.getOwnPropertyDescriptors(source));
  return Object.assign(options, { max: 2, pipeline: false,
    connectionTimeoutMillis: DEFAULT_DEADLINES.connectMs, query_timeout: 0 });
}

// The deadline owns cancellation: it destroys the physical session, not just the
// promise waiting for a query. No timed-out client can be reused for later SQL.
function createWebhookLifecycle(overrides = {}) {
  const deadlines = { ...DEFAULT_DEADLINES, ...overrides };
  for (const value of Object.values(deadlines)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid webhook deadline');
  }
  const controller = new AbortController();
  const destroyed = new WeakSet();
  let client, disposed = false, loss = false;
  const requestListeners = [];
  const failure = code => Object.assign(new Error('Telegram webhook unavailable'), { code });

  function destroyPhysical(target) {
    if (!target || destroyed.has(target)) return;
    destroyed.add(target);
    // pg-pool reinstalls its own error listener in release(true). Keep a guard
    // during destruction as well, including for a late pool checkout.
    const ignore = () => {};
    target.on('error', ignore);
    try { target.release(true); }
    catch { /* Still force-close the socket; never attempt a healthy release. */ }
    finally {
      try {
        const stream = target.connection?.stream;
        if (stream && !stream.destroyed) stream.destroy();
      } catch { /* Already closed. */ }
      target.removeListener('error', ignore);
    }
  }
  function stop(code) {
    if (disposed || controller.signal.aborted) return;
    controller.abort(failure(code));
    destroyPhysical(client);
  }
  const onError = () => {
    if (disposed || destroyed.has(client)) return;
    loss = true; stop('webhook_connection_lost');
  };
  const onEnd = onError;
  const processingTimer = setTimeout(() => stop('webhook_processing_timeout'), deadlines.processingMs);

  function assertActive() {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (disposed) throw failure('webhook_scope_closed');
  }
  function bounded(work, milliseconds, code) {
    assertActive();
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', aborted); };
      const aborted = () => { cleanup(); reject(controller.signal.reason); };
      controller.signal.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => stop(code), milliseconds);
      // Attach both handlers even if the deadline fires first. Late rejections
      // are observed and a late pool client is destroyed by acquire below.
      Promise.resolve().then(() => { assertActive(); return work(); }).then(
        value => { cleanup(); if (controller.signal.aborted) reject(controller.signal.reason); else resolve(value); },
        error => { cleanup(); reject(error); },
      );
    });
  }
  return {
    deadlines, signal: controller.signal, assertActive,
    get connectionLost() { return loss; },
    abort: stop,
    watchRequest(req, res) {
      const listen = (emitter, event, handler) => {
        if (!emitter.on || !emitter.removeListener) return;
        emitter.on(event, handler); requestListeners.push(() => emitter.removeListener(event, handler));
      };
      listen(req, 'aborted', () => stop('webhook_request_aborted'));
      listen(res, 'close', () => { if (!res.writableEnded) stop('webhook_request_aborted'); });
      if (req.aborted) stop('webhook_request_aborted');
    },
    async acquire(pool) {
      // Real pg pools must have their own cancellable checkout/connection timer.
      // The request watchdog additionally owns late-client cleanup.
      if (pool.options && (!Number.isSafeInteger(pool.options.connectionTimeoutMillis)
        || pool.options.connectionTimeoutMillis <= 0)) throw failure('webhook_pool_timeout_missing');
      return bounded(() => Promise.resolve(pool.connect()).then(acquired => {
        if (disposed || controller.signal.aborted) { destroyPhysical(acquired); throw failure('webhook_connect_timeout'); }
        client = acquired;
        client.on('error', onError); client.on('end', onEnd);
        return acquired;
      }), deadlines.connectMs, 'webhook_connect_timeout');
    },
    query(sql, args, timeoutMs = deadlines.queryMs) {
      return bounded(() => {
        if (!client) throw failure('webhook_client_missing');
        return client.query(sql, args);
      }, timeoutMs, 'webhook_query_timeout');
    },
    run(work) { return bounded(work, deadlines.processingMs, 'webhook_processing_timeout'); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(processingTimer);
      // Abort remaining guarded work, including an in-flight Telegram fetch.
      if (!controller.signal.aborted) controller.abort(failure('webhook_scope_closed'));
      destroyPhysical(client);
      client?.removeListener('error', onError); client?.removeListener('end', onEnd);
      for (const remove of requestListeners) remove();
    },
  };
}
module.exports = { createWebhookLifecycle, DEFAULT_DEADLINES, webhookPoolOptions };
