// What the issuer's tests share: the schema Better Auth's own migrations make for the issuer's
// configuration, which scripts/schema.ts writes to src/schema.ts and a test holds the two to.

import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from '../src/auth.ts';

/** Better Auth's migrations for an empty database, with every plugin the issuer can turn on. */
export async function schemaFor(): Promise<string[]> {
  const auth = createAuth({
    issuer: 'https://auth.example',
    audience: 'https://content.example/mcp',
    secret: 'a'.repeat(32),
    database: new DatabaseSync(':memory:'),
    providers: {
      google: { id: 'g', secret: 'g' },
      github: { id: 'h', secret: 'h' },
      facebook: { id: 'f', secret: 'f' },
      instagram: { id: 'i', secret: 'i', config: 'c' },
    },
    mail: { sendCode: async () => {} },
  });
  const sql = await (await getMigrations(auth.options)).compileMigrations();
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .map((statement) => statement
      .replace(/^create table /i, 'CREATE TABLE IF NOT EXISTS ')
      .replace(/^create (unique )?index /i, (_, unique) => `CREATE ${unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS `));
}
