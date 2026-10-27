// Wraps a Cloudflare Durable Object's built-in SQLite so the app's
// database calls (prepare/get/all/run/exec/transaction) work unchanged.
export function wrapDurableSql(storage) {
  const sql = storage.sql;
  const clean = (params) =>
    params.map((p) => (p === undefined ? null : typeof p === "boolean" ? +p : p));
  return {
    exec: (text) => {
      sql.exec(text).toArray();
    },
    prepare: (text) => ({
      get: (...p) => sql.exec(text, ...clean(p)).toArray()[0],
      all: (...p) => sql.exec(text, ...clean(p)).toArray(),
      run: (...p) => {
        sql.exec(text, ...clean(p)).toArray();
        const lastInsertRowid = /^\s*insert/i.test(text)
          ? sql.exec("SELECT last_insert_rowid() AS id").one().id
          : 0;
        return { changes: 0, lastInsertRowid };
      },
    }),
    transactionSync: (fn) => storage.transactionSync(fn),
  };
}
