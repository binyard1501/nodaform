import type { Item, RefundRule } from './types'

const TZ = 'Asia/Seoul'

function parts(iso: string) {
  const f = new Intl.DateTimeFormat('ko-KR', {
    timeZone: TZ,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => f.find(p => p.type === t)?.value ?? ''
  return { month: get('month'), day: get('day'), weekday: get('weekday'), hour: get('hour'), minute: get('minute') }
}

export function formatDate(iso: string) {
  const p = parts(iso)
  return `${p.month}/${p.day}(${p.weekday})`
}

export function formatTime(iso: string) {
  const p = parts(iso)
  return `${p.hour}:${p.minute}`
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export function itemLabel(item: Pick<Item, 'label' | 'startsAt' | 'endsAt'>) {
  if (item.startsAt && item.endsAt) return `${formatDate(item.startsAt)} ${formatTime(item.startsAt)}–${formatTime(item.endsAt)}`
  if (item.startsAt) return `${item.label} · ${formatDateTime(item.startsAt)}`
  return item.label
}

export function krw(n: number) {
  return `${n.toLocaleString('ko-KR')}원`
}

export function refundText(rule: RefundRule) {
  const when = rule.daysBefore === 0 ? '그 이후' : `입장 ${rule.daysBefore}일 전까지`
  const what = rule.percent === 0 ? '환불 불가' : `${rule.percent}% 환불`
  return `${when} ${what}`
}

// "2026-09-27" + "11:00" in KST -> ISO
export function kstIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}

export function toKstInput(iso: string | null) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString()
  return { date: d.slice(0, 10), time: d.slice(11, 16) }
}

export function relative(fromIso: string, nowIso: string) {
  const diff = new Date(fromIso).getTime() - new Date(nowIso).getTime()
  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3600_000)
  const m = Math.floor((abs % 3600_000) / 60_000)
  const span = h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`
  return diff >= 0 ? `${span} 남음` : `${span} 지남`
}
