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
};

const globalRef = globalThis as GlobalRef;

const BASE_SCHEMA = `
create table if not exists stations (
  device_id    text primary key,
  callsign     text not null,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  typing_until timestamptz,
  ip           text,
  is_custom    boolean default false,
  public_key   text,
  is_away      boolean default false,
  secret_hash  text
);

create table if not exists queue (
  device_id  text primary key references stations(device_id) on delete cascade,
  interests  text not null default '[]',
  entered_at timestamptz not null default now(),
  last_beat  timestamptz not null default now()
);

create table if not exists sessions (
  id          text primary key,
  a_id        text not null,
  b_id        text not null,
  kind        text not null,
  interests   text not null default '[]',
  created_at  timestamptz not null default now(),
  closed_at   timestamptz,
  reconnect_a boolean default false,
  reconnect_b boolean default false
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
  copied_at  timestamptz,
  edited_at  timestamptz,
  seen_at    timestamptz
);

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

create table if not exists blocks (
  blocker_id  text not null,
  blocked_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create index if not exists blocks_blocker_idx on blocks (blocker_id);
create index if not exists blocks_blocked_idx on blocks (blocked_id);

create table if not exists abuse_reports (
  id          text primary key,
  reporter_id text not null,
  reported_id text not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists device_events (
  id          bigserial primary key,
  device_id   text not null,
  type        text not null,
  data        text not null,
  instance_id text,
  created_at  timestamptz not null default now()
);

create index if not exists device_events_device_idx on device_events (device_id, id);

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

create table if not exists _migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
`;

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: "001_initial_base",
    sql: BASE_SCHEMA,
  },
  {
    name: "002_station_columns",
    sql: `
      alter table stations add column if not exists typing_until timestamptz;
      alter table stations add column if not exists ip text;
      alter table stations add column if not exists is_custom boolean default false;
      alter table stations add column if not exists public_key text;
      alter table stations add column if not exists is_away boolean default false;
      alter table stations drop constraint if exists stations_callsign_key;
      alter table stations drop constraint if exists stations_callsign_unique;
    `,
  },
  {
    name: "003_message_status_columns",
    sql: `
      alter table messages add column if not exists copied_at timestamptz;
      alter table messages add column if not exists edited_at timestamptz;
      alter table messages add column if not exists seen_at timestamptz;
    `,
  },
  {
    name: "004_device_events_instance_id",
    sql: `
      alter table device_events add column if not exists instance_id text;
      create index if not exists device_events_device_idx on device_events (device_id, id);
    `,
  },
  {
    name: "005_session_reconnect",
    sql: `
      alter table sessions add column if not exists reconnect_a boolean default false;
      alter table sessions add column if not exists reconnect_b boolean default false;
    `,
  },
  {
    name: "006_station_secret_and_event_retention",
    sql: `
      alter table stations add column if not exists secret_hash text;
      create index if not exists device_events_created_idx on device_events (created_at);
    `,
  },
];

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

async function runMigrationsOnEngine(
  execMulti: (sql: string) => Promise<void>,
  query: QueryRunner,
): Promise<void> {
  await execMulti(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
  const appliedRows = await query<{ name: string }>(`select name from _migrations`, []);
  const applied = new Set(appliedRows.map((r) => r.name));

  for (const m of MIGRATIONS) {
    if (!applied.has(m.name)) {
      await execMulti(m.sql);
      await query(`insert into _migrations (name) values ($1) on conflict do nothing`, [m.name]);
    }
  }
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
    await runMigrationsOnEngine(async (s) => {
      await pool.query(s);
    }, run);
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
    globalRef.__lunaPglite__ = pg;
    const run: QueryRunner = async <T>(text: string, params: unknown[]) => {
      const result = await pg.query<T>(text, params);
      return result.rows;
    };
    await runMigrationsOnEngine(async (s) => {
      await pg.exec(s);
    }, run);
    globalRef.__lunaMigrated__ = true;
  }

  const pglite = globalRef.__lunaPglite__;
  const run: QueryRunner = async <T>(text: string, params: unknown[]) => {
    const result = await pglite.query<T>(text, params);
    return result.rows;
  };

  return createSqlInterface(run);
}

function resolveDatabaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const direct =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL;
  if (direct?.trim()) {
    return direct.trim();
  }
  const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const pass = PGPASSWORD ? `:${encodeURIComponent(PGPASSWORD)}` : "";
    return `postgres://${encodeURIComponent(PGUSER)}${pass}@${PGHOST}/${encodeURIComponent(PGDATABASE)}?sslmode=require`;
  }
  return undefined;
}

export async function getSql(): Promise<Sql> {
  if (!globalRef.__lunaSqlPromise__) {
    const databaseUrl = resolveDatabaseUrl();
    const isProduction =
      typeof process !== "undefined" && process.env.NODE_ENV === "production";

    if (isProduction && !databaseUrl) {
      throw new Error("DATABASE_URL or POSTGRES_URL environment variable is required in production.");
    }

    const promise = databaseUrl ? initNeon(databaseUrl) : initPglite();

    globalRef.__lunaSqlPromise__ = promise.catch((err) => {
      globalRef.__lunaSqlPromise__ = undefined;
      throw err;
    });
  }

  return globalRef.__lunaSqlPromise__;
}
