import { PGlite } from '@electric-sql/pglite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  normalizeCustomHtml,
  normalizeOffer,
  normalizeQuestions,
  normalizeTheme,
  type AppStatus,
  type Answers,
  type Application,
  type Channel,
  type CustomHtml,
  type FormMode,
  type FormRecord,
  type FormStatus,
  type Item,
  type MessageLog,
  type Method,
  type Offer,
  type Questions,
  type Theme,
  type Trigger,
} from './types'

export type Q = { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }

const SCHEMA = `
create table if not exists settings (key text primary key, value text not null);
create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists users (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists workspace_settings (
  workspace_id text not null references workspaces(id) on delete cascade,
  key text not null,
  value text not null,
  primary key (workspace_id, key)
);
create table if not exists forms (
  id text primary key,
  slug text unique not null,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  offer jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists items (
  id text primary key,
  form_id text not null references forms(id) on delete cascade,
  label text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  price int not null default 0,
  capacity int,
  position int not null default 0
);
create table if not exists applications (
  id text primary key,
  seq serial,
  form_id text not null references forms(id) on delete cascade,
  item_id text not null references items(id),
  name text not null,
  phone text not null,
  party int not null,
  amount int not null,
  method text not null,
  status text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null
);
create index if not exists applications_item_status on applications(item_id, status);
create table if not exists messages (
  id serial primary key,
  form_id text not null references forms(id) on delete cascade,
  application_id text,
  trigger text not null,
  channel text not null,
  to_phone text not null,
  body text not null,
  status text not null,
  send_at timestamptz not null,
  created_at timestamptz not null
);

alter table items alter column capacity drop not null;
alter table forms add column if not exists questions jsonb not null default '{}'::jsonb;
alter table forms add column if not exists theme jsonb not null default '{}'::jsonb;
alter table applications add column if not exists answers jsonb not null default '{}'::jsonb;
alter table applications add column if not exists companions jsonb not null default '[]'::jsonb;
alter table applications add column if not exists marketing boolean not null default false;
alter table applications add column if not exists memo text not null default '';
alter table applications add column if not exists source text not null default 'online';
alter table applications add column if not exists checked_in_at timestamptz;
alter table applications add column if not exists refund_due int;
create index if not exists applications_phone on applications(phone);
alter table forms add column if not exists workspace_id text references workspaces(id);
create index if not exists forms_workspace on forms(workspace_id);
create index if not exists sessions_expires on sessions(expires_at);
alter table forms add column if not exists mode text not null default 'structured';
alter table forms add column if not exists custom_html jsonb not null default '{"source":"paste","html":"","lastScannedAt":null}'::jsonb;
`

const g = globalThis as unknown as { __nodaDb?: Promise<PGlite> }

async function open() {
  const dir = path.join(process.cwd(), '.data', 'pglite')
  mkdirSync(dir, { recursive: true })
  const db = new PGlite(dir)
  await db.exec(SCHEMA)
  return db
}

// One PGlite instance per process: two instances on the same data dir corrupt it.
export function rawDb() {
  return (g.__nodaDb ??= open())
}

export async function getClock(q: Q, workspaceId: string) {
  const { rows } = await q.query<{ value: string }>(`select value from workspace_settings where workspace_id = $1 and key = 'clock_offset_ms'`, [workspaceId])
  const offsetMs = rows[0] ? Number(rows[0].value) : 0
  return { now: new Date(Date.now() + offsetMs), offsetMs }
}

const iso = (d: Date | string | null) => (d == null ? null : new Date(d).toISOString())

export type FormRow = {
  id: string
  workspace_id: string
  slug: string
  title: string
  description: string
  status: string
  offer: Offer
  questions: Questions
  theme: Theme
  mode: string
  custom_html: CustomHtml
}
export type ItemRow = {
  id: string
  form_id: string
  label: string
  starts_at: Date | null
  ends_at: Date | null
  price: number
  capacity: number | null
  position: number
}
export type AppRow = {
  id: string
  seq: number
  form_id: string
  item_id: string
  name: string
  phone: string
  party: number
  amount: number
  method: string
  status: string
  created_at: Date
  expires_at: Date | null
  answers: Answers
  companions: string[]
  marketing: boolean
  memo: string
  source: string
  checked_in_at: Date | null
  refund_due: number | null
}
export type MessageRow = {
  id: number
  application_id: string | null
  trigger: string
  channel: string
  to_phone: string
  body: string
  status: string
  send_at: Date
}

export const mapForm = (r: FormRow): FormRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  status: r.status as FormStatus,
  offer: normalizeOffer(r.offer),
  questions: normalizeQuestions(r.questions),
  theme: normalizeTheme(r.theme),
  mode: r.mode === 'custom_html' ? 'custom_html' : ('structured' as FormMode),
  customHtml: normalizeCustomHtml(r.custom_html),
})

export const mapItem = (r: ItemRow): Item => ({
  id: r.id,
  label: r.label,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  price: r.price,
  capacity: r.capacity,
  position: r.position,
})

export const mapApp = (r: AppRow): Application => ({
  id: r.id,
  seq: r.seq,
  itemId: r.item_id,
  name: r.name,
  phone: r.phone,
  party: r.party,
  amount: r.amount,
  method: r.method as Method,
  status: r.status as AppStatus,
  createdAt: iso(r.created_at)!,
  expiresAt: iso(r.expires_at),
  answers: r.answers ?? {},
  companions: r.companions ?? [],
  marketing: r.marketing,
  memo: r.memo,
  source: r.source === 'manual' ? 'manual' : 'online',
  checkedInAt: iso(r.checked_in_at),
  refundDue: r.refund_due,
})

export const mapMessage = (r: MessageRow): MessageLog => ({
  id: r.id,
  applicationId: r.application_id,
  trigger: r.trigger as Trigger,
  channel: r.channel as Channel,
  toPhone: r.to_phone,
  body: r.body,
  status: r.status as 'sent' | 'scheduled',
  sendAt: iso(r.send_at)!,
})
