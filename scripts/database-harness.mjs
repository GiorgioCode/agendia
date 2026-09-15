import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createServer } from "node:net";
export async function startDatabase() {
  const dir = await mkdtemp(join(tmpdir(), "agendia-test-"));
  const port = await new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
  const server = new EmbeddedPostgres({
    databaseDir: join(dir, "pg"),
    user: "postgres",
    password: "local-test-only",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  let client;
  try {
    await server.initialise();
    await server.start();
    const connection = {
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "local-test-only",
      database: "postgres",
    };
    client = new pg.Client(connection);
    await client.connect();
    await client.query(await readFile("tests/embedded-bootstrap.sql", "utf8"));
    for (const f of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      try {
        await client.query(
          await readFile(join("supabase/migrations", f), "utf8"),
        );
      } catch (error) {
        throw new Error(`Migration ${f}: ${error.message}`, { cause: error });
      }
    }
    return {
      client,
      connection,
      async stop() {
        await client.end();
        await server.stop();
        await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await client?.end();
    try {
      await server.stop();
    } catch {
      /* startup may have failed */
    }
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
