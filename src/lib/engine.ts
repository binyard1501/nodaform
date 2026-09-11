import { randomUUID } from 'node:crypto'
import { getClock, mapApp, mapForm, mapItem, mapMessage, rawDb, type AppRow, type FormRow, type ItemRow, type MessageRow, type Q } from './db'
import { formatDateTime, itemLabel } from './format'
import { sendMessage } from './messaging'
import { applicantCanChange, fits, isClosed, isOpen, priceOf, publishChecks, refundFor, remainingOf } from './rules'
import { ensureExamples } from './seed'
import {
  defaultOffer,
  defaultQuestions,
  defaultTheme,
  type Answers,
  type Application,
  type FieldDef,
  type FormRecord,
  type Item,
  type ItemStats,
  type Method,
  type Offer,
  type Questions,
  type Theme,
} from './types'

export class UserError extends Error {}

const g = globalThis as unknown as { __nodaReady?: Promise<void> }

async function db() {
  const d = await rawDb()
  await (g.__nodaReady ??= ensureExamples(d))
  return d
}

// Seats count while an application is confirmed, awaiting deposit, or holding a waitlist offer.
const OCCUPYING = `('confirmed', 'pending_deposit', 'offered')`
const ACTIVE = `('confirmed', 'pending_deposit', 'offered', 'waitlisted')`
const ACTIVE_LIST = ['confirmed', 'pending_deposit', 'offered', 'waitlisted']

const digits = (s: string) => s.replace(/\D/g, '')

async function loadForm(q: Q, id: string) {
  const { rows } = await q.query<FormRow>(`select * from forms where id = $1`, [id])
  return rows[0] ? mapForm(rows[0]) : null
}

async function loadFormBySlug(q: Q, slug: string) {
  const { rows } = await q.query<FormRow>(`select * from forms where slug = $1`, [slug])
  return rows[0] ? mapForm(rows[0]) : null
}

async function loadItems(q: Q, formId: string) {
  const { rows } = await q.query<ItemRow>(`select * from items where form_id = $1 order by position, starts_at`, [formId])
  return rows.map(mapItem)
}

async function loadApp(q: Q, id: string) {
  const { rows } = await q.query<AppRow>(`select * from applications where id = $1`, [id])
  return rows[0] ? mapApp(rows[0]) : null
}

async function seatsTaken(q: Q, itemId: string) {
  const { rows } = await q.query<{ n: number }>(
    `select coalesce(sum(party), 0)::int as n from applications where item_id = $1 and status in ${OCCUPYING}`,
    [itemId],
  )
  return rows[0].n
}

async function setStatus(q: Q, id: string, status: string, now: Date, expiresAt: Date | null = null) {
  const { rows } = await q.query<AppRow>(
    `update applications set status = $2, expires_at = $3::timestamptz, updated_at = $4::timestamptz,
       confirmed_at = case when $2 = 'confirmed' then $4::timestamptz else confirmed_at end
     where id = $1 returning *`,
    [id, status, expiresAt?.toISOString() ?? null, now.toISOString()],
  )
  return mapApp(rows[0])
}

async function confirmAndNotify(q: Q, form: FormRecord, item: Item, app: Application, now: Date) {
  await sendMessage(q, { form, item, app, trigger: 'confirmed', now })
  await sendMessage(q, { form, item, app, trigger: 'reminder', now })
}

async function promote(q: Q, form: FormRecord, item: Item, now: Date) {
  if (form.offer.overflow !== 'waitlist' || item.capacity === null || isClosed(form.offer, item, now)) return
  let remaining = item.capacity - (await seatsTaken(q, item.id))
  if (remaining <= 0) return
  const { rows } = await q.query<AppRow>(`select * from applications where item_id = $1 and status = 'waitlisted' order by seq`, [item.id])
  // First in line whose party fits the freed seats; those who don't fit keep their place.
  for (const row of rows) {
    if (remaining <= 0) break
    if (row.party > remaining) continue
    const app = await setStatus(q, row.id, 'offered', now, new Date(now.getTime() + form.offer.claimHours * 3600_000))
    await sendMessage(q, { form, item, app, trigger: 'waitlist_offer', now })
    remaining -= row.party
  }
}

// Lazy expiry: runs before every read and write, so no background job is needed.
async function reconcile(q: Q, form: FormRecord, now: Date) {
  const items = await loadItems(q, form.id)
  const byId = new Map(items.map(i => [i.id, i]))

  const { rows: expired } = await q.query<AppRow>(
    `update applications set status = 'expired', updated_at = $2::timestamptz
     where form_id = $1 and status in ('pending_deposit', 'offered') and expires_at < $2::timestamptz
     returning *`,
    [form.id, now.toISOString()],
  )
  for (const row of expired) {
    const item = byId.get(row.item_id)
    if (item) await sendMessage(q, { form, item, app: mapApp(row), trigger: 'expired', now })
  }

  await q.query(`update messages set status = 'sent' where form_id = $1 and status = 'scheduled' and send_at <= $2::timestamptz`, [
    form.id,
    now.toISOString(),
  ])

  const { rows: waiting } = await q.query<{ item_id: string }>(
    `select distinct item_id from applications where form_id = $1 and status = 'waitlisted'`,
    [form.id],
  )
  for (const row of waiting) {
    const item = byId.get(row.item_id)
    if (item) await promote(q, form, item, now)
  }
  return items
}

async function statsFor(q: Q, form: FormRecord, items: Item[], now: Date): Promise<ItemStats[]> {
  const { rows } = await q.query<{ item_id: string; status: string; seats: number; n: number; checked: number }>(
    `select item_id, status, sum(party)::int as seats, count(*)::int as n,
       coalesce(sum(party) filter (where checked_in_at is not null), 0)::int as checked
     from applications where form_id = $1 group by item_id, status`,
    [form.id],
  )
  const get = (itemId: string, status: string) => rows.find(r => r.item_id === itemId && r.status === status)
  return items.map(item => {
    const confirmed = get(item.id, 'confirmed')?.seats ?? 0
    const pending = get(item.id, 'pending_deposit')?.seats ?? 0
    const offered = get(item.id, 'offered')?.seats ?? 0
    return {
      ...item,
      confirmed,
      pending,
      offered,
      waitlisted: get(item.id, 'waitlisted')?.n ?? 0,
      checkedIn: get(item.id, 'confirmed')?.checked ?? 0,
      remaining: remainingOf(item, confirmed + pending + offered),
      closed: isClosed(form.offer, item, now),
    }
  })
}

async function formOfApp(q: Q, appId: string) {
  const { rows } = await q.query<{ form_id: string }>(`select form_id from applications where id = $1`, [appId])
  if (!rows[0]) throw new UserError('신청 내역을 찾을 수 없습니다.')
  return (await loadForm(q, rows[0].form_id))!
}

async function withApp<T>(
  appId: string,
  fn: (tx: Q, ctx: { form: FormRecord; items: Item[]; item: Item; app: Application; now: Date }) => Promise<T>,
) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await formOfApp(tx, appId)
    const items = await reconcile(tx, form, now)
    const app = (await loadApp(tx, appId))!
    return fn(tx, { form, items, item: items.find(i => i.id === app.itemId)!, app, now })
  })
}

function validateAnswers(questions: Questions, raw: Record<string, unknown>): Answers {
  const out: Answers = {}
  for (const f of questions.fields) {
    const v = raw[f.id]
    if (f.type === 'consent') {
      const on = v === true || v === 'on'
      if (f.required && !on) throw new UserError(`'${f.label}'에 동의해 주세요.`)
      out[f.id] = on
    } else if (f.type === 'multi') {
      const list = (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(x => f.options.includes(x))
      if (f.required && list.length === 0) throw new UserError(`'${f.label}'에서 하나 이상 골라 주세요.`)
      out[f.id] = list
    } else {
      const s = typeof v === 'string' ? v.trim() : ''
      if (f.required && !s) throw new UserError(`'${f.label}'을(를) 입력해 주세요.`)
      if (s && f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new UserError(`'${f.label}'에 올바른 이메일 주소를 입력해 주세요.`)
      if (s && f.type === 'select' && !f.options.includes(s)) throw new UserError(`'${f.label}'에서 선택지 중 하나를 골라 주세요.`)
      out[f.id] = s.slice(0, 2000)
    }
  }
  return out
}

/* ---------- reads ---------- */

export async function listForms() {
  const d = await db()
  const { rows } = await d.query<FormRow & { capacity: number; unlimited: boolean; confirmed: number; waiting: number; items: number }>(
    `select f.*,
       (select coalesce(sum(capacity), 0)::int from items i where i.form_id = f.id) as capacity,
       (select bool_or(capacity is null) from items i where i.form_id = f.id) as unlimited,
       (select count(*)::int from items i where i.form_id = f.id) as items,
       (select coalesce(sum(party), 0)::int from applications a where a.form_id = f.id and a.status = 'confirmed') as confirmed,
       (select count(*)::int from applications a where a.form_id = f.id and a.status = 'waitlisted') as waiting
     from forms f order by f.created_at desc, f.title`,
  )
  return rows.map(r => ({ ...mapForm(r), capacity: r.capacity, unlimited: !!r.unlimited, confirmed: r.confirmed, waiting: r.waiting, items: r.items }))
}

export async function getDashboard(formId: string) {
  const d = await db()
  return d.transaction(async tx => {
    const { now, offsetMs } = await getClock(tx)
    const form = await loadForm(tx, formId)
    if (!form) return null
    const items = await reconcile(tx, form, now)
    const stats = await statsFor(tx, form, items, now)
    const { rows: apps } = await tx.query<AppRow>(`select * from applications where form_id = $1 order by seq desc`, [formId])
    const { rows: msgs } = await tx.query<MessageRow>(`select * from messages where form_id = $1 order by id desc limit 60`, [formId])
    return { form, stats, applications: apps.map(mapApp), messages: msgs.map(mapMessage), now: now.toISOString(), offsetMs }
  })
}

export async function getPublic(slug: string) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadFormBySlug(tx, slug)
    if (!form) return null
    const items = await reconcile(tx, form, now)
    return { form, stats: await statsFor(tx, form, items, now), now: now.toISOString() }
  })
}

export async function getApplicationView(slug: string, appId: string) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadFormBySlug(tx, slug)
    if (!form) return null
    const items = await reconcile(tx, form, now)
    const app = await loadApp(tx, appId)
    if (!app || !items.some(i => i.id === app.itemId)) return null
    const item = items.find(i => i.id === app.itemId)!
    let position = 0
    if (app.status === 'waitlisted') {
      const { rows } = await tx.query<{ n: number }>(
        `select count(*)::int as n from applications where item_id = $1 and status = 'waitlisted' and seq <= $2`,
        [app.itemId, app.seq],
      )
      position = rows[0].n
    }
    const stats = await statsFor(tx, form, items, now)
    const canChange = ['confirmed', 'pending_deposit'].includes(app.status) && applicantCanChange(form.offer, item, now)
    const alternatives = canChange
      ? stats.filter(s => s.id !== item.id && !s.closed && priceOf(form.offer, s) === priceOf(form.offer, item) && fits(s.remaining, app.party))
      : []
    return {
      form,
      item,
      app,
      position,
      now: now.toISOString(),
      canCancel: ACTIVE_LIST.includes(app.status) && applicantCanChange(form.offer, item, now),
      alternatives,
      refund: refundFor(form.offer, item, app, now),
    }
  })
}

export async function getWizard(formId: string) {
  const d = await db()
  const form = await loadForm(d, formId)
  if (!form) return null
  const items = await loadItems(d, formId)
  const { rows } = await d.query<{ n: number }>(`select count(*)::int as n from applications where form_id = $1`, [formId])
  const { now } = await getClock(d)
  const defaultDate = new Date(now.getTime() + 14 * 86_400_000 + 9 * 3600_000).toISOString().slice(0, 10)
  return { form, items, hasApplications: rows[0].n > 0, defaultDate }
}

export async function getCheckin(formId: string) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadForm(tx, formId)
    if (!form) return null
    const items = await reconcile(tx, form, now)
    const { rows } = await tx.query<AppRow>(`select * from applications where form_id = $1 and status = 'confirmed' order by name`, [formId])
    return { form, stats: await statsFor(tx, form, items, now), applications: rows.map(mapApp), now: now.toISOString() }
  })
}

export async function getCheckinApp(appId: string) {
  const d = await db()
  const app = await loadApp(d, appId)
  if (!app) return null
  const form = await formOfApp(d, appId)
  const items = await loadItems(d, form.id)
  return { form, app, item: items.find(i => i.id === app.itemId)! }
}

export async function lookupApplications(slug: string, name: string, phone: string) {
  const d = await db()
  const form = await loadFormBySlug(d, slug)
  if (!form) throw new UserError('폼을 찾을 수 없습니다.')
  if (!name.trim() || digits(phone).length < 10) throw new UserError('신청할 때 쓴 이름과 휴대폰 번호를 입력해 주세요.')
  const { rows } = await d.query<AppRow>(
    `select * from applications where form_id = $1 and phone = $2 and name = $3 order by seq desc`,
    [form.id, digits(phone), name.trim()],
  )
  const items = await loadItems(d, form.id)
  return rows.map(mapApp).map(a => ({ id: a.id, status: a.status, party: a.party, item: itemLabel(items.find(i => i.id === a.itemId)!) }))
}

export async function exportRows(formId: string) {
  const d = await db()
  const form = await loadForm(d, formId)
  if (!form) return null
  const items = await loadItems(d, formId)
  const { rows } = await d.query<AppRow>(`select * from applications where form_id = $1 order by seq`, [formId])
  return { form, items, applications: rows.map(mapApp) }
}

export type Customer = {
  phone: string
  name: string
  count: number
  forms: string[]
  marketing: boolean
  lastAt: string
}

export async function listCustomers(): Promise<Customer[]> {
  const d = await db()
  const { rows } = await d.query<{ phone: string; name: string; marketing: boolean; created_at: Date; title: string; status: string }>(
    `select a.phone, a.name, a.marketing, a.created_at, f.title, a.status
     from applications a join forms f on f.id = a.form_id order by a.created_at desc`,
  )
  const map = new Map<string, Customer>()
  for (const r of rows) {
    let c = map.get(r.phone)
    if (!c) {
      // Rows are newest first, so the first row carries the latest name and consent.
      c = { phone: r.phone, name: r.name, count: 0, forms: [], marketing: r.marketing, lastAt: new Date(r.created_at).toISOString() }
      map.set(r.phone, c)
    }
    if (['confirmed', 'pending_deposit', 'offered', 'waitlisted'].includes(r.status)) c.count++
    if (!c.forms.includes(r.title)) c.forms.push(r.title)
  }
  return [...map.values()]
}

/* ---------- applicant actions ---------- */

export type ApplyInput = {
  formSlug: string
  itemId: string
  name: string
  phone: string
  party: number
  method: Method
  answers: Record<string, unknown>
  companions: string[]
  marketing: boolean
}

async function insertApplication(
  q: Q,
  a: {
    formId: string
    itemId: string
    name: string
    phone: string
    party: number
    amount: number
    method: Method
    status: Application['status']
    now: Date
    expiresAt: Date | null
    answers?: Answers
    companions?: string[]
    marketing?: boolean
    memo?: string
    source?: 'online' | 'manual'
  },
) {
  const { rows } = await q.query<AppRow>(
    `insert into applications (id, form_id, item_id, name, phone, party, amount, method, status, created_at, expires_at, confirmed_at, updated_at,
       answers, companions, marketing, memo, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz,
             case when $9 = 'confirmed' then $10::timestamptz end, $10::timestamptz, $12::jsonb, $13::jsonb, $14, $15, $16)
     returning *`,
    [
      randomUUID(),
      a.formId,
      a.itemId,
      a.name,
      a.phone,
      a.party,
      a.amount,
      a.method,
      a.status,
      a.now.toISOString(),
      a.expiresAt?.toISOString() ?? null,
      JSON.stringify(a.answers ?? {}),
      JSON.stringify(a.companions ?? []),
      a.marketing ?? false,
      a.memo ?? '',
      a.source ?? 'online',
    ],
  )
  return mapApp(rows[0])
}

async function notifyNew(q: Q, form: FormRecord, item: Item, app: Application, now: Date) {
  if (app.status === 'confirmed') await confirmAndNotify(q, form, item, app, now)
  else if (app.status === 'pending_deposit') await sendMessage(q, { form, item, app, trigger: 'deposit_requested', now })
  else if (app.status === 'waitlisted') await sendMessage(q, { form, item, app, trigger: 'waitlisted', now })
}

export async function applyToForm(input: ApplyInput) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadFormBySlug(tx, input.formSlug)
    if (!form || form.status !== 'published') throw new UserError('지금은 신청을 받지 않는 폼입니다.')
    if (!isOpen(form.offer, now)) throw new UserError(`${formatDateTime(form.offer.openAt!)}부터 신청할 수 있습니다.`)
    await reconcile(tx, form, now)

    const { rows } = await tx.query<ItemRow>(`select * from items where id = $1 and form_id = $2 for update`, [input.itemId, form.id])
    if (!rows[0]) throw new UserError('신청할 항목을 골라 주세요.')
    const item = mapItem(rows[0])
    if (isClosed(form.offer, item, now)) throw new UserError(`${itemLabel(item)} 신청이 마감되었습니다.`)

    const name = input.name.trim()
    const phone = digits(input.phone)
    if (!name) throw new UserError('이름을 입력해 주세요.')
    if (!/^01\d{8,9}$/.test(phone)) throw new UserError('휴대폰 번호를 010으로 시작하는 숫자로 입력해 주세요.')
    const max = form.offer.party.mode === 'solo' ? 1 : form.offer.party.max
    const party = Math.trunc(input.party)
    if (party < 1 || party > max) throw new UserError(`한 번에 ${max}명까지 신청할 수 있습니다.`)

    const companions = form.questions.companions ? input.companions.slice(0, party - 1).map(s => s.trim()) : []
    if (form.questions.companions && (companions.length < party - 1 || companions.some(c => !c))) {
      throw new UserError('함께 오는 분의 이름을 모두 입력해 주세요.')
    }
    const answers = validateAnswers(form.questions, input.answers)

    const { rows: dup } = await tx.query<{ n: number }>(
      `select count(*)::int as n from applications where item_id = $1 and phone = $2 and status in ${ACTIVE}`,
      [item.id, phone],
    )
    if (dup[0].n > 0) throw new UserError('이 번호로 같은 항목에 이미 신청하셨습니다.')
    if (form.offer.limitPerPerson) {
      const { rows: mine } = await tx.query<{ n: number }>(
        `select count(*)::int as n from applications where form_id = $1 and phone = $2 and status in ${ACTIVE}`,
        [form.id, phone],
      )
      if (mine[0].n >= form.offer.limitPerPerson) {
        throw new UserError(`한 사람당 ${form.offer.limitPerPerson}번까지 신청할 수 있습니다. 이미 한 신청은 '내 신청 조회'에서 확인하거나 시간을 바꿀 수 있습니다.`)
      }
    }

    const amount = priceOf(form.offer, item) * party
    let method: Method = 'free'
    if (amount > 0) {
      if (input.method === 'deposit' && form.offer.deposit.enabled) method = 'deposit'
      else if (input.method === 'onsite' && form.offer.onsite) method = 'onsite'
      else throw new UserError('결제 방법을 골라 주세요.')
    }

    const remaining = remainingOf(item, await seatsTaken(tx, item.id))
    let status: Application['status']
    let expiresAt: Date | null = null
    if (fits(remaining, party)) {
      status = method === 'deposit' ? 'pending_deposit' : 'confirmed'
      if (method === 'deposit') expiresAt = new Date(now.getTime() + form.offer.deposit.deadlineHours * 3600_000)
    } else if (form.offer.overflow === 'waitlist') {
      status = 'waitlisted'
    } else if (remaining && remaining > 0) {
      throw new UserError(`남은 자리가 ${remaining}석이라 ${party}명은 신청할 수 없습니다.`)
    } else {
      throw new UserError('정원이 마감되었습니다.')
    }

    const app = await insertApplication(tx, {
      formId: form.id,
      itemId: item.id,
      name,
      phone,
      party,
      amount,
      method,
      status,
      now,
      expiresAt,
      answers,
      companions,
      marketing: form.questions.marketing.enabled && input.marketing,
    })
    await notifyNew(tx, form, item, app, now)
    return app.id
  })
}

export async function claimOffer(appId: string) {
  return withApp(appId, async (tx, { form, item, app, now }) => {
    if (app.status === 'expired') throw new UserError('확정 기한이 지나 자리가 다음 분께 넘어갔습니다.')
    if (app.status !== 'offered') throw new UserError('지금 확정할 수 있는 신청이 아닙니다.')
    if (app.method === 'deposit') {
      const next = await setStatus(tx, app.id, 'pending_deposit', now, new Date(now.getTime() + form.offer.deposit.deadlineHours * 3600_000))
      await sendMessage(tx, { form, item, app: next, trigger: 'deposit_requested', now })
    } else {
      await confirmAndNotify(tx, form, item, await setStatus(tx, app.id, 'confirmed', now), now)
    }
  })
}

export async function changeItem(appId: string, targetId: string) {
  return withApp(appId, async (tx, { form, items, item, app, now }) => {
    if (!['confirmed', 'pending_deposit'].includes(app.status)) throw new UserError('확정되었거나 입금을 기다리는 신청만 바꿀 수 있습니다.')
    if (!applicantCanChange(form.offer, item, now)) throw new UserError('신청 마감 이후에는 바꿀 수 없습니다. 운영자에게 문의해 주세요.')
    const { rows } = await tx.query<ItemRow>(`select * from items where id = $1 and form_id = $2 for update`, [targetId, form.id])
    if (!rows[0] || targetId === item.id) throw new UserError('바꿀 항목을 골라 주세요.')
    const target = mapItem(rows[0])
    if (isClosed(form.offer, target, now)) throw new UserError(`${itemLabel(target)} 신청이 마감되었습니다.`)
    if (priceOf(form.offer, target) !== priceOf(form.offer, item)) throw new UserError('가격이 같은 항목으로만 바꿀 수 있습니다.')
    if (!fits(remainingOf(target, await seatsTaken(tx, target.id)), app.party)) throw new UserError('바꾸려는 시간에 남은 자리가 부족합니다.')

    const { rows: moved } = await tx.query<AppRow>(
      `update applications set item_id = $2, updated_at = $3::timestamptz where id = $1 returning *`,
      [app.id, target.id, now.toISOString()],
    )
    const next = mapApp(moved[0])
    await tx.query(`delete from messages where application_id = $1 and status = 'scheduled'`, [app.id])
    await sendMessage(tx, { form, item: target, app: next, trigger: 'changed', now })
    if (next.status === 'confirmed') await sendMessage(tx, { form, item: target, app: next, trigger: 'reminder', now })
    await promote(tx, form, items.find(i => i.id === item.id)!, now)
  })
}

async function cancelCore(tx: Q, ctx: { form: FormRecord; item: Item; app: Application; now: Date }, by: 'applicant' | 'operator') {
  const { form, item, app, now } = ctx
  if (!ACTIVE_LIST.includes(app.status)) throw new UserError('이미 취소되었거나 만료된 신청입니다.')
  if (by === 'applicant' && !applicantCanChange(form.offer, item, now)) {
    throw new UserError('신청 마감 이후에는 직접 취소할 수 없습니다. 운영자에게 문의해 주세요.')
  }
  const refund = refundFor(form.offer, item, app, now)
  await setStatus(tx, app.id, 'canceled', now)
  const { rows } = await tx.query<AppRow>(`update applications set refund_due = $2 where id = $1 returning *`, [app.id, refund?.amount ?? null])
  await tx.query(`delete from messages where application_id = $1 and status = 'scheduled'`, [app.id])
  await sendMessage(tx, { form, item, app: mapApp(rows[0]), trigger: 'canceled', now })
  await promote(tx, form, item, now)
}

export async function applicantCancel(appId: string) {
  return withApp(appId, (tx, ctx) => cancelCore(tx, ctx, 'applicant'))
}

/* ---------- operator actions ---------- */

export async function operatorCancel(appId: string) {
  return withApp(appId, (tx, ctx) => cancelCore(tx, ctx, 'operator'))
}

export async function confirmDeposit(appId: string) {
  return withApp(appId, async (tx, { form, item, app, now }) => {
    if (app.status !== 'pending_deposit') throw new UserError('입금 대기 중인 신청이 아닙니다.')
    await confirmAndNotify(tx, form, item, await setStatus(tx, app.id, 'confirmed', now), now)
  })
}

export async function confirmDeposits(ids: string[]) {
  let done = 0
  for (const id of ids) {
    try {
      await confirmDeposit(id)
      done++
    } catch (e) {
      if (!(e instanceof UserError)) throw e
    }
  }
  return done
}

// Applicants normally get their check-in QR link once, at confirmation. This resends the
// same notification (with the link to their status page and QR) on demand, e.g. if it never arrived.
export async function resendCheckinLink(appId: string) {
  return withApp(appId, async (tx, { form, item, app, now }) => {
    if (app.status !== 'confirmed') throw new UserError('확정된 신청만 입장 QR을 다시 보낼 수 있습니다.')
    await sendMessage(tx, { form, item, app, trigger: 'confirmed', now })
  })
}

export async function setCheckIn(appId: string, checked: boolean) {
  return withApp(appId, async (tx, { app, now }) => {
    if (checked && app.status !== 'confirmed') throw new UserError('확정된 신청만 입장 처리할 수 있습니다.')
    await tx.query(`update applications set checked_in_at = $2::timestamptz where id = $1`, [app.id, checked ? now.toISOString() : null])
  })
}

export type ManualInput = {
  formId: string
  itemId: string
  name: string
  phone: string
  party: number
  status: 'confirmed' | 'pending_deposit'
  method: Method
  memo: string
  allowOver: boolean
}

export async function manualRegister(input: ManualInput) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadForm(tx, input.formId)
    if (!form) throw new UserError('폼을 찾을 수 없습니다.')
    await reconcile(tx, form, now)
    const { rows } = await tx.query<ItemRow>(`select * from items where id = $1 and form_id = $2 for update`, [input.itemId, form.id])
    if (!rows[0]) throw new UserError('항목을 골라 주세요.')
    const item = mapItem(rows[0])
    const name = input.name.trim()
    const phone = digits(input.phone)
    if (!name) throw new UserError('이름을 입력해 주세요.')
    if (!/^0\d{8,10}$/.test(phone)) throw new UserError('연락처를 숫자로 입력해 주세요.')
    const party = Math.max(1, Math.trunc(input.party) || 1)
    if (!input.allowOver && !fits(remainingOf(item, await seatsTaken(tx, item.id)), party)) {
      throw new UserError('남은 자리가 부족합니다. 정원을 넘겨 등록하려면 "정원 초과 허용"을 켜 주세요.')
    }
    const amount = priceOf(form.offer, item) * party
    const method: Method = amount === 0 ? 'free' : input.method === 'onsite' ? 'onsite' : 'deposit'
    const status = amount === 0 || method === 'onsite' ? 'confirmed' : input.status
    const expiresAt = status === 'pending_deposit' ? new Date(now.getTime() + form.offer.deposit.deadlineHours * 3600_000) : null
    const app = await insertApplication(tx, {
      formId: form.id,
      itemId: item.id,
      name,
      phone,
      party,
      amount,
      method,
      status,
      now,
      expiresAt,
      memo: input.memo.trim(),
      source: 'manual',
    })
    await notifyNew(tx, form, item, app, now)
  })
}

export async function shiftClock(ms: number | null) {
  const d = await db()
  const { offsetMs } = await getClock(d)
  const next = ms === null ? 0 : offsetMs + ms
  await d.query(`insert into settings (key, value) values ('clock_offset_ms', $1) on conflict (key) do update set value = excluded.value`, [String(next)])
}

/* ---------- wizard ---------- */

export async function createDraft() {
  const d = await db()
  const id = randomUUID()
  await d.query(`insert into forms (id, slug, title, status, offer, questions, theme) values ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6::jsonb)`, [
    id,
    `form-${id.slice(0, 6)}`,
    '새 신청 폼',
    JSON.stringify(defaultOffer()),
    JSON.stringify(defaultQuestions()),
    JSON.stringify(defaultTheme()),
  ])
  return id
}

export async function duplicateForm(formId: string) {
  const d = await db()
  return d.transaction(async tx => {
    const form = await loadForm(tx, formId)
    if (!form) throw new UserError('폼을 찾을 수 없습니다.')
    const id = randomUUID()
    await tx.query(`insert into forms (id, slug, title, description, status, offer, questions, theme) values ($1, $2, $3, $4, 'draft', $5::jsonb, $6::jsonb, $7::jsonb)`, [
      id,
      `${form.slug.slice(0, 32)}-${id.slice(0, 4)}`,
      `${form.title} (복사본)`,
      form.description,
      JSON.stringify(form.offer),
      JSON.stringify(form.questions),
      JSON.stringify(form.theme),
    ])
    for (const item of await loadItems(tx, formId)) {
      await tx.query(
        `insert into items (id, form_id, label, starts_at, ends_at, price, capacity, position) values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8)`,
        [randomUUID(), id, item.label, item.startsAt, item.endsAt, item.price, item.capacity, item.position],
      )
    }
    return id
  })
}

export type WizardPayload = {
  title: string
  slug: string
  description: string
  offer: Offer
  items: Item[]
  questions: Questions
  theme: Theme
}

const FIELD_TYPES = new Set(['text', 'textarea', 'email', 'select', 'multi', 'consent'])

function cleanQuestions(q: Questions): Questions {
  const seen = new Set<string>()
  const fields: FieldDef[] = []
  for (const f of q.fields) {
    if (!f.id || seen.has(f.id) || !FIELD_TYPES.has(f.type)) throw new UserError('입력 항목 설정이 올바르지 않습니다.')
    seen.add(f.id)
    fields.push({ ...f, label: f.label.trim().slice(0, 100), help: (f.help ?? '').trim().slice(0, 200), options: (f.options ?? []).map(o => o.trim()).filter(Boolean) })
  }
  return { fields, companions: !!q.companions, marketing: { enabled: !!q.marketing.enabled, text: q.marketing.text.trim() || '소식을 문자로 받겠습니다 (선택)' } }
}

function cleanTheme(t: Theme): Theme {
  const img = (v: string | null) => {
    if (!v) return null
    if (!v.startsWith('data:image/') || v.length > 1_500_000) throw new UserError('이미지는 1MB 이하의 그림 파일만 올릴 수 있습니다.')
    return v
  }
  return { color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : defaultTheme().color, logo: img(t.logo), cover: img(t.cover) }
}

export async function saveForm(formId: string, p: WizardPayload) {
  const d = await db()
  return d.transaction(async tx => {
    const { now } = await getClock(tx)
    const form = await loadForm(tx, formId)
    if (!form) throw new UserError('폼을 찾을 수 없습니다.')

    const title = p.title.trim()
    const slug = p.slug.trim().toLowerCase()
    if (!title) throw new UserError('폼 이름을 입력해 주세요.')
    if (!/^[a-z0-9-]{3,40}$/.test(slug)) throw new UserError('주소는 영문 소문자, 숫자, 하이픈으로 3~40자여야 합니다.')
    const { rows: taken } = await tx.query<{ n: number }>(`select count(*)::int as n from forms where slug = $1 and id <> $2`, [slug, formId])
    if (taken[0].n > 0) throw new UserError('이미 쓰고 있는 주소입니다. 다른 주소를 입력해 주세요.')

    const { rows: used } = await tx.query<{ item_id: string }>(`select distinct item_id from applications where form_id = $1`, [formId])
    const usedIds = new Set(used.map(r => r.item_id))
    if (usedIds.size > 0 && p.offer.structure !== form.offer.structure) {
      throw new UserError('신청이 들어온 뒤에는 신청 방식을 바꿀 수 없습니다. 폼을 복제해서 새로 만들어 주세요.')
    }
    if (p.offer.structure === 'simple' && p.items.length !== 1) throw new UserError('단순 신청은 항목이 하나여야 합니다.')
    // A published form goes live on every save, so it must stay publishable while being edited.
    if (form.status === 'published') {
      const broken = publishChecks(p.offer, p.items, p.questions).find(c => c.level === 'error')
      if (broken) throw new UserError(`게시 중인 폼이라 바로 반영됩니다. 먼저 고쳐 주세요: ${broken.text}`)
    }

    for (const item of p.items) {
      if (item.capacity !== null && (!Number.isInteger(item.capacity) || item.capacity < 1)) throw new UserError(`${itemLabel(item)}: 정원은 1명 이상이어야 합니다.`)
      if (!Number.isInteger(item.price) || item.price < 0) throw new UserError(`${itemLabel(item)}: 가격을 0원 이상으로 입력해 주세요.`)
    }

    const existing = await loadItems(tx, formId)
    const keep = new Set(p.items.map(i => i.id))
    const removed = existing.filter(i => !keep.has(i.id))
    const blocked = removed.filter(i => usedIds.has(i.id))
    if (blocked.length > 0) throw new UserError(`신청이 있는 항목은 삭제할 수 없습니다: ${blocked.map(itemLabel).join(', ')}`)
    for (const i of removed) await tx.query(`delete from items where id = $1`, [i.id])

    for (const [position, item] of p.items.entries()) {
      await tx.query(
        `insert into items (id, form_id, label, starts_at, ends_at, price, capacity, position)
         values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8)
         on conflict (id) do update set label = excluded.label, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           price = excluded.price, capacity = excluded.capacity, position = excluded.position`,
        [item.id, formId, item.label, item.startsAt, item.endsAt, item.price, item.capacity, position],
      )
    }

    await tx.query(`update forms set title = $2, slug = $3, description = $4, offer = $5::jsonb, questions = $6::jsonb, theme = $7::jsonb where id = $1`, [
      formId,
      title,
      slug,
      p.description,
      JSON.stringify(p.offer),
      JSON.stringify(cleanQuestions(p.questions)),
      JSON.stringify(cleanTheme(p.theme)),
    ])
    await reconcile(tx, (await loadForm(tx, formId))!, now)
  })
}

export async function publishForm(formId: string) {
  const d = await db()
  const form = await loadForm(d, formId)
  if (!form) throw new UserError('폼을 찾을 수 없습니다.')
  const errors = publishChecks(form.offer, await loadItems(d, formId), form.questions).filter(c => c.level === 'error')
  if (errors.length > 0) throw new UserError(errors[0].text)
  await d.query(`update forms set status = 'published' where id = $1`, [formId])
}

export async function setFormStatus(formId: string, status: 'published' | 'closed') {
  const d = await db()
  await d.query(`update forms set status = $2 where id = $1`, [formId, status])
}
