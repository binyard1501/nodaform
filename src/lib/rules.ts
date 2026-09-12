import type { Application, CustomHtml, FormMode, Item, Offer, Questions, RefundRule } from './types'

export type Check = { level: 'ok' | 'warn' | 'error'; text: string }

export function isPaid(offer: Offer, items: Pick<Item, 'price'>[]) {
  return !offer.free && items.some(i => i.price > 0)
}

export function priceOf(offer: Offer, item: Pick<Item, 'price'>) {
  return offer.free ? 0 : item.price
}

export function isOpen(offer: Offer, now: Date) {
  return !offer.openAt || now >= new Date(offer.openAt)
}

export function isClosed(offer: Offer, item: Pick<Item, 'startsAt'>, now: Date) {
  if (offer.close.mode === 'at' && offer.close.at) return now >= new Date(offer.close.at)
  if (offer.close.mode === 'before_start' && item.startsAt) {
    return now.getTime() >= new Date(item.startsAt).getTime() - offer.close.minutes * 60_000
  }
  return false
}

// Applicants may cancel or move a booking themselves only while the item is still taking applications.
export function applicantCanChange(offer: Offer, item: Pick<Item, 'startsAt'>, now: Date) {
  if (item.startsAt && now >= new Date(item.startsAt)) return false
  return !isClosed(offer, item, now)
}

export function remainingOf(item: Pick<Item, 'capacity'>, taken: number) {
  return item.capacity === null ? null : Math.max(0, item.capacity - taken)
}

export function fits(remaining: number | null, party: number) {
  return remaining === null || remaining >= party
}

export function sortedRefundRules(rules: RefundRule[]) {
  return [...rules].sort((a, b) => b.daysBefore - a.daysBefore)
}

// Only money already received (a confirmed bank deposit) is refundable.
export function refundFor(offer: Offer, item: Pick<Item, 'startsAt'>, app: Pick<Application, 'status' | 'method' | 'amount'>, now: Date) {
  if (app.status !== 'confirmed' || app.method !== 'deposit' || app.amount === 0) return null
  const daysLeft = item.startsAt ? Math.floor((new Date(item.startsAt).getTime() - now.getTime()) / 86_400_000) : Infinity
  const rule = sortedRefundRules(offer.refundRules).find(r => daysLeft >= r.daysBefore)
  const percent = rule?.percent ?? 0
  return { percent, amount: Math.round((app.amount * percent) / 100) }
}

export function durationText(minutes: number) {
  if (minutes % 1440 === 0 && minutes >= 1440) return `${minutes / 1440}일`
  if (minutes % 60 === 0 && minutes >= 60) return `${minutes / 60}시간`
  return `${minutes}분`
}

export function publishChecks(offer: Offer, items: Item[], questions: Questions, mode: FormMode = 'structured', customHtml?: CustomHtml): Check[] {
  const checks: Check[] = []
  if (mode === 'custom_html') {
    if (offer.structure !== 'simple') checks.push({ level: 'error', text: '커스텀 HTML 모드는 단순 신청 구조만 지원합니다 · 1단계' })
    if (!customHtml?.html.trim()) checks.push({ level: 'error', text: 'HTML이 비어 있습니다 · 디자인 단계에서 붙여넣어 주세요' })
    else checks.push({ level: 'ok', text: '커스텀 HTML 화면' })
  }
  if (items.length === 0) checks.push({ level: 'error', text: '판매할 항목이 없습니다 · 2단계에서 추가해 주세요' })
  else if (offer.structure === 'simple') {
    const cap = items[0].capacity
    checks.push({ level: 'ok', text: `단순 신청 · ${cap === null ? '정원 제한 없음' : `정원 ${cap}명`}` })
  } else {
    const seats = items.reduce((s, i) => s + (i.capacity ?? 0), 0)
    checks.push({ level: 'ok', text: `가격표 · ${items.length}개 항목, ${seats.toLocaleString('ko-KR')}석` })
  }
  const broken = questions.fields.filter(f => !f.label.trim() || ((f.type === 'select' || f.type === 'multi') && f.options.filter(Boolean).length < 2))
  if (broken.length > 0) checks.push({ level: 'error', text: '이름이 비었거나 선택지가 2개보다 적은 입력 항목이 있습니다 · 3단계' })
  else if (questions.identity === 'none') {
    checks.push({
      level: questions.fields.length ? 'ok' : 'error',
      text: questions.fields.length ? `익명 응답 · 질문 ${questions.fields.length}개` : '익명 폼인데 질문이 하나도 없습니다 · 3단계',
    })
  } else checks.push({ level: 'ok', text: `신청서 · 이름, 휴대폰${questions.fields.length ? ` 외 ${questions.fields.length}개 항목` : ''}` })
  if (isPaid(offer, items)) {
    if (!offer.deposit.enabled && !offer.onsite) checks.push({ level: 'error', text: '결제 방법이 없습니다 · 5단계에서 무통장 입금이나 현장 결제를 켜 주세요' })
    if (offer.deposit.enabled && (!offer.deposit.bank || !offer.deposit.account || !offer.deposit.holder)) {
      checks.push({ level: 'error', text: '무통장 입금 계좌 정보가 비어 있습니다 · 5단계' })
    }
    if (offer.refundRules.length === 0) checks.push({ level: 'error', text: '취소·환불 규정이 없습니다 · 5단계' })
    else checks.push({ level: 'ok', text: '취소·환불 규정' })
    checks.push({ level: 'warn', text: '온라인 결제는 아직 연결되지 않았습니다 · 무통장 입금·현장 결제로 게시됩니다' })
  } else {
    checks.push({ level: 'ok', text: '무료 신청 · 결제 단계 없음' })
  }
  if (offer.overflow === 'waitlist') checks.push({ level: 'ok', text: `대기 신청 · 자리가 나면 ${offer.claimHours}시간 안에 확정` })
  if (offer.openAt && offer.close.mode === 'at' && offer.close.at && offer.close.at <= offer.openAt) {
    checks.push({ level: 'error', text: '신청 마감이 예약 오픈보다 빠릅니다 · 4단계' })
  }
  checks.push({ level: 'warn', text: '프로토타입: 알림톡·SMS는 실제로 보내지 않고 발송 기록에만 남깁니다' })
  return checks
}
