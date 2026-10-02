import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type GlobalRef = typeof globalThis & {
  __lunaSqlPromise__?: Promise<Sql>;
  __lunaPgPool__?: Pool;
  __lunaPglite__?: PGlite;
  __lunaMigrated__?: boolean;
  __lunaMigratedVersion__?: number;
};

const CURRENT_SCHEMA_VERSION = 8;
const globalRef = globalThis as GlobalRef;

const LUNA_SCHEMA = `
create table if not exists stations (
  device_id    text primary key,
  callsign     text not null,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  typing_until timestamptz,
  ip           text,
  is_custom    boolean default false,
  public_key   text
);

alter table stations drop constraint if exists stations_callsign_key;
alter table stations drop constraint if exists stations_callsign_unique;
alter table stations add column if not exists typing_until timestamptz;
alter table stations add column if not exists ip text;
alter table stations add column if not exists is_custom boolean default false;
alter table stations add column if not exists public_key text;
alter table stations add column if not exists is_away boolean default false;

create table if not exists bans (
  device_id    text primary key,
  ip           text,
  reason       text not null,
  violation    text not null,
  banned_at    timestamptz not null default now()
);

create index if not exists bans_ip_idx on bans (ip);

create table if not exists violation_logs (
  id           text primary key,
  device_id    text not null,
  ip           text,
  violation    text not null,
  session_id   text,
  created_at   timestamptz not null default now()
);

create index if not exists violation_logs_device_idx on violation_logs (device_id, violation);
create index if not exists violation_logs_ip_idx on violation_logs (ip, violation);

create table if not exists queue (
  device_id  text primary key references stations(device_id) on delete cascade,
  interests  text not null default '[]',
  entered_at timestamptz not null default now(),
  last_beat  timestamptz not null default now()
);

create table if not exists sessions (
  id         text primary key,
  a_id       text not null,
  b_id       text not null,
  kind       text not null,
  interests  text not null default '[]',
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

create index if not exists sessions_open_a_idx on sessions (a_id) where closed_at is null;
create index if not exists sessions_open_b_idx on sessions (b_id) where closed_at is null;

create table if not exists messages (
  id         text primary key,
  session_id text not null references sessions(id) on delete cascade,
  from_id    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  copied_at  timestamptz
);

alter table messages add column if not exists copied_at timestamptz;
alter table messages add column if not exists edited_at timestamptz;
alter table messages add column if not exists seen_at timestamptz;

create index if not exists messages_session_idx on messages (session_id, created_at);

create table if not exists friend_requests (
  id         text primary key,
  from_id    text not null,
  to_id      text not null,
  session_id text,
  status     text not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index if not exists friend_requests_pair_idx
  on friend_requests (from_id, to_id)
  where status = 'pending';

create table if not exists friendships (
  user_a     text not null,
  user_b     text not null,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table if not exists void_letters (
  id           text primary key,
  device_id    text not null references stations(device_id) on delete cascade,
  callsign     text not null,
  text         text not null,
  stars        integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists void_letters_created_idx on void_letters (created_at desc);

create table if not exists void_stars (
  letter_id    text not null references void_letters(id) on delete cascade,
  device_id    text not null,
  created_at   timestamptz not null default now(),
  primary key (letter_id, device_id)
);
`;

type QueryRunner = <T>(text: string, params: unknown[]) => Promise<T[]>;

function createSqlInterface(run: QueryRunner): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1] ?? ""}`;
    }
    return run<T>(text, values);
  }) as Sql;

  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);

  return sql;
}

async function initNeon(databaseUrl: string): Promise<Sql> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(20, (v: string) => Number(v));
  types.setTypeParser(1082, (v: string) => v);
  types.setTypeParser(1186, (v: string) => v);

  const pool = globalRef.__lunaPgPool__ ?? new Pool({ connectionString: databaseUrl });
  globalRef.__lunaPgPool__ = pool;

  const run: QueryRunner = async <T>(text: string, params: unknown[]) => {
    const res = await pool.query(text, params);
    return res.rows as T[];
  };

  if (!globalRef.__lunaMigrated__) {
    await pool.query(LUNA_SCHEMA);
    try {
      await pool.query("alter table messages add column if not exists seen_at timestamptz;");
    } catch {}
    globalRef.__lunaMigrated__ = true;
  }

  return createSqlInterface(run);
}

async function initPglite(): Promise<Sql> {
  if (!globalRef.__lunaPglite__) {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        20: (v: string) => Number(v),
        1082: (v: string) => v,
        1186: (v: string) => v,
      },
    });
    await pg.waitReady;
    await pg.exec(LUNA_SCHEMA);
    globalRef.__lunaPglite__ = pg;
    globalRef.__lunaMigrated__ = true;
  }

  const pglite = globalRef.__lunaPglite__;

  const run: QueryRunner = async <T>(text: string, params: unknown[]) => {
    const result = await pglite.query<T>(text, params);
    return result.rows;
  };

  return createSqlInterface(run);
}

export async function getSql(): Promise<Sql> {
  if (!globalRef.__lunaSqlPromise__) {
    const databaseUrl =
      typeof process !== "undefined" ? process.env.DATABASE_URL?.trim() : undefined;

    const promise = databaseUrl ? initNeon(databaseUrl) : initPglite();

    globalRef.__lunaSqlPromise__ = promise.catch((err) => {
      globalRef.__lunaSqlPromise__ = undefined;
      throw err;
    });
  }

  const sql = await globalRef.__lunaSqlPromise__;

  if (globalRef.__lunaMigratedVersion__ !== CURRENT_SCHEMA_VERSION) {
    const migrationStatements = [
      "alter table stations drop constraint if exists stations_callsign_key;",
      "alter table stations drop constraint if exists stations_callsign_unique;",
      "alter table stations add column if not exists typing_until timestamptz;",
      "alter table stations add column if not exists ip text;",
      "alter table stations add column if not exists is_custom boolean default false;",
      "alter table stations add column if not exists public_key text;",
      "alter table stations add column if not exists is_away boolean default false;",
      "alter table messages add column if not exists copied_at timestamptz;",
      "alter table messages add column if not exists edited_at timestamptz;",
      "alter table messages add column if not exists seen_at timestamptz;",
      `create table if not exists bans (
        device_id    text primary key,
        ip           text,
        reason       text not null,
        violation    text not null,
        banned_at    timestamptz not null default now()
      );`,
      "create index if not exists bans_ip_idx on bans (ip);",
      `create table if not exists violation_logs (
        id           text primary key,
        device_id    text not null,
        ip           text,
        violation    text not null,
        session_id   text,
        created_at   timestamptz not null default now()
      );`,
      "create index if not exists violation_logs_device_idx on violation_logs (device_id, violation);",
      "create index if not exists violation_logs_ip_idx on violation_logs (ip, violation);",
      `create table if not exists void_letters (
        id           text primary key,
        device_id    text not null,
        callsign     text not null,
        text         text not null,
        stars        integer not null default 0,
        created_at   timestamptz not null default now()
      );`,
      "create index if not exists void_letters_created_idx on void_letters (created_at desc);",
      `create table if not exists void_stars (
        letter_id    text not null,
        device_id    text not null,
        created_at   timestamptz not null default now(),
        primary key (letter_id, device_id)
      );`,
    ];

    for (const stmt of migrationStatements) {
      try {
        await sql.query(stmt);
      } catch {}
    }
    globalRef.__lunaMigratedVersion__ = CURRENT_SCHEMA_VERSION;
  }

  return sql;
}
