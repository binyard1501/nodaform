import type { Q } from './db'
import { formatDateTime, itemLabel, krw, toKstInput } from './format'
import type { Application, FormRecord, Item, Trigger } from './types'

// Prototype: nothing is actually sent. Every message is rendered and written to the log.
export async function sendMessage(
  q: Q,
  { form, item, app, trigger, now }: { form: FormRecord; item: Item; app: Application; trigger: Trigger; now: Date },
) {
  const rule = form.offer.messages.find(m => m.trigger === trigger)
  if (!rule || !rule.enabled) return

  let sendAt = now
  let status: 'sent' | 'scheduled' = 'sent'
  if (trigger === 'reminder') {
    if (!item.startsAt) return
    const { date } = toKstInput(item.startsAt)
    sendAt = new Date(new Date(`${date}T10:00:00+09:00`).getTime() - 86_400_000)
    if (sendAt <= now) return
    status = 'scheduled'
  }

  let position = ''
  if (app.status === 'waitlisted') {
    const { rows } = await q.query<{ n: number }>(
      `select count(*)::int as n from applications where item_id = $1 and status = 'waitlisted' and seq <= $2`,
      [app.itemId, app.seq],
    )
    position = String(rows[0].n)
  }

  const d = form.offer.deposit
  const vars: Record<string, string> = {
    이름: app.name,
    행사: form.title,
    시간대: itemLabel(item),
    인원: String(app.party),
    금액: krw(app.amount),
    계좌: `${d.bank} ${d.account} (${d.holder})`,
    입금기한: app.expiresAt ? formatDateTime(app.expiresAt) : '',
    확정기한: app.expiresAt ? formatDateTime(app.expiresAt) : '',
    대기순번: position,
    링크: `/f/${form.slug}/a/${app.id}`,
    환불금액: app.refundDue ? krw(app.refundDue) : '없음',
  }
  const body = rule.template.replace(/#\{([^}]+)\}/g, (m, key: string) => vars[key] ?? m)

  await q.query(
    `insert into messages (form_id, application_id, trigger, channel, to_phone, body, status, send_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
    [form.id, app.id, trigger, rule.channel, app.phone, body, status, sendAt.toISOString(), now.toISOString()],
  )
}
