// Existing services keep their transaction boundaries inside one webhook commit.
// Only this adapter owns SAVEPOINT names; no request values become SQL identifiers.
function createTransactionPool(client, { assertActive = () => {}, onBroken = () => {} } = {}) {
  let active = null, sequence = 0, broken = false;
  return {
    query: (...args) => { assertActive(); return client.query(...args); },
    async connect() {
      assertActive();
      if (active || broken) throw new Error('Telegram transaction scope unavailable');
      const name = 'telegram_service_' + ++sequence;
      let started = false, ended = false, released = false;
      active = name;
      return {
        async query(sql, args) {
          assertActive();
          if (active !== name || ended) throw new Error('Telegram transaction scope ended');
          if (sql === 'BEGIN') {
            if (started) throw new Error('Telegram transaction already started');
            await client.query('SAVEPOINT ' + name); started = true;
            return { rows: [], rowCount: 0 };
          }
          if (!started) throw new Error('Telegram transaction not started');
          if (sql === 'COMMIT') {
            const result = await client.query('RELEASE SAVEPOINT ' + name);
            ended = true; return result;
          }
          if (sql === 'ROLLBACK') {
            await client.query('ROLLBACK TO SAVEPOINT ' + name);
            const result = await client.query('RELEASE SAVEPOINT ' + name);
            ended = true; return result;
          }
          return client.query(sql, args);
        },
        release(destroy = false) {
          if (released) return;
          released = true;
          if (destroy || !ended) { broken = true; onBroken(); }
          if (active === name) active = null;
        },
      };
    },
    assertComplete() {
      assertActive();
      if (active || broken) throw new Error('Telegram transaction scope incomplete');
    },
  };
}
module.exports = { createTransactionPool };
