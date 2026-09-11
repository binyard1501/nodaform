export type Structure = 'simple' | 'single' | 'slots'
export type Overflow = 'close' | 'waitlist'
export type Channel = 'alimtalk' | 'sms'
export type Method = 'free' | 'deposit' | 'onsite'
export type FormStatus = 'draft' | 'published' | 'closed'
export type AppStatus = 'confirmed' | 'pending_deposit' | 'waitlisted' | 'offered' | 'canceled' | 'expired'
export type Trigger =
  | 'confirmed'
  | 'deposit_requested'
  | 'waitlisted'
  | 'waitlist_offer'
  | 'changed'
  | 'expired'
  | 'canceled'
  | 'reminder'

export type MessageRule = { trigger: Trigger; enabled: boolean; channel: Channel; template: string }
export type RefundRule = { daysBefore: number; percent: number }

export type Offer = {
  structure: Structure
  free: boolean
  party: { mode: 'solo' | 'group'; max: number }
  overflow: Overflow
  claimHours: number
  openAt: string | null
  close: { mode: 'none' | 'before_start' | 'at'; minutes: number; at: string | null }
  limitPerPerson: number | null
  deposit: { enabled: boolean; bank: string; account: string; holder: string; deadlineHours: number }
  onsite: boolean
  refundRules: RefundRule[]
  messages: MessageRule[]
}

export type FieldType = 'text' | 'textarea' | 'email' | 'select' | 'multi' | 'consent'
export type FieldDef = { id: string; type: FieldType; label: string; required: boolean; options: string[]; help: string }
export type Questions = {
  fields: FieldDef[]
  companions: boolean
  marketing: { enabled: boolean; text: string }
}
export type Theme = { color: string; logo: string | null; cover: string | null }
export type Answer = string | string[] | boolean
export type Answers = Record<string, Answer>

export type Item = {
  id: string
  label: string
  startsAt: string | null
  endsAt: string | null
  price: number
  capacity: number | null
  position: number
}

export type FormRecord = {
  id: string
  workspaceId: string
  slug: string
  title: string
  description: string
  status: FormStatus
  offer: Offer
  questions: Questions
  theme: Theme
}

export type ItemStats = Item & {
  confirmed: number
  pending: number
  offered: number
  waitlisted: number
  checkedIn: number
  remaining: number | null
  closed: boolean
}

export type Application = {
  id: string
  seq: number
  itemId: string
  name: string
  phone: string
  party: number
  amount: number
  method: Method
  status: AppStatus
  createdAt: string
  expiresAt: string | null
  answers: Answers
  companions: string[]
  marketing: boolean
  memo: string
  source: 'online' | 'manual'
  checkedInAt: string | null
  refundDue: number | null
}

export type MessageLog = {
  id: number
  applicationId: string | null
  trigger: Trigger
  channel: Channel
  toPhone: string
  body: string
  status: 'sent' | 'scheduled'
  sendAt: string
}

export const STATUS_LABEL: Record<AppStatus, string> = {
  confirmed: '확정',
  pending_deposit: '입금 대기',
  offered: '자리 제안',
  waitlisted: '대기',
  canceled: '취소',
  expired: '기한 만료',
}

export const METHOD_LABEL: Record<Method, string> = { free: '무료', deposit: '무통장', onsite: '현장' }

export const TRIGGER_LABEL: Record<Trigger, string> = {
  confirmed: '신청 확정',
  deposit_requested: '입금 안내',
  waitlisted: '대기 등록',
  waitlist_offer: '대기 차례 도착',
  changed: '시간 변경',
  expired: '기한 만료',
  canceled: '취소',
  reminder: '입장 하루 전 10:00',
}

export const CHANNEL_LABEL: Record<Channel, string> = { alimtalk: '알림톡', sms: 'SMS' }

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: '짧은 글',
  textarea: '긴 글',
  email: '이메일',
  select: '하나 고르기',
  multi: '여러 개 고르기',
  consent: '동의 체크',
}

export const TEMPLATE_VARS = ['#{이름}', '#{행사}', '#{시간대}', '#{인원}', '#{금액}', '#{계좌}', '#{입금기한}', '#{대기순번}', '#{링크}', '#{확정기한}', '#{환불금액}']

export const DEFAULT_MESSAGES: MessageRule[] = [
  { trigger: 'confirmed', enabled: true, channel: 'alimtalk', template: '[#{행사}] #{이름}님, #{시간대} #{인원}명 신청이 확정되었습니다. 입장 QR과 신청 내역: #{링크}' },
  { trigger: 'deposit_requested', enabled: true, channel: 'alimtalk', template: '[#{행사}] #{금액}을 #{입금기한}까지 #{계좌}로 입금해 주세요. 기한이 지나면 자동으로 취소됩니다.' },
  { trigger: 'waitlisted', enabled: true, channel: 'alimtalk', template: '[#{행사}] #{시간대} 대기 #{대기순번}번으로 등록되었습니다. 자리가 나면 바로 알려드릴게요.' },
  { trigger: 'waitlist_offer', enabled: true, channel: 'sms', template: '[#{행사}] 자리가 났습니다. #{확정기한}까지 확정해 주세요: #{링크}' },
  { trigger: 'changed', enabled: true, channel: 'alimtalk', template: '[#{행사}] #{이름}님, 신청 시간이 #{시간대}로 변경되었습니다.' },
  { trigger: 'expired', enabled: true, channel: 'sms', template: '[#{행사}] #{시간대} 신청이 기한이 지나 취소되었습니다.' },
  { trigger: 'canceled', enabled: true, channel: 'alimtalk', template: '[#{행사}] #{시간대} 신청이 취소되었습니다. 환불 예정 금액: #{환불금액}' },
  { trigger: 'reminder', enabled: true, channel: 'alimtalk', template: '[#{행사}] 내일 #{시간대} 입장입니다. 10분 전부터 입장 줄을 설 수 있어요.' },
]

export const BRAND_PRESETS = ['#0e6b5b', '#1f3a8a', '#b4412f', '#7a3e9d', '#c27c0e', '#1c1c1c']

export function defaultOffer(): Offer {
  return {
    structure: 'slots',
    free: false,
    party: { mode: 'group', max: 4 },
    overflow: 'waitlist',
    claimHours: 2,
    openAt: null,
    close: { mode: 'before_start', minutes: 60, at: null },
    limitPerPerson: 1,
    deposit: { enabled: true, bank: '', account: '', holder: '', deadlineHours: 24 },
    onsite: false,
    refundRules: [
      { daysBefore: 7, percent: 100 },
      { daysBefore: 3, percent: 50 },
      { daysBefore: 0, percent: 0 },
    ],
    messages: DEFAULT_MESSAGES.map(m => ({ ...m })),
  }
}

export function defaultQuestions(): Questions {
  return { fields: [], companions: false, marketing: { enabled: false, text: '신상품·이벤트 소식을 문자로 받겠습니다 (선택)' } }
}

export function defaultTheme(): Theme {
  return { color: BRAND_PRESETS[0], logo: null, cover: null }
}

// Older rows predate some settings; fill the gaps instead of migrating JSON in place.
export function normalizeOffer(raw: Partial<Offer> | null | undefined): Offer {
  const base = defaultOffer()
  const o = { ...base, ...(raw ?? {}) } as Offer
  o.party = { ...base.party, ...(raw?.party ?? {}) }
  o.close = { ...base.close, ...(raw?.close ?? {}) }
  o.deposit = { ...base.deposit, ...(raw?.deposit ?? {}) }
  if (raw && !('limitPerPerson' in raw)) o.limitPerPerson = null
  const have = new Set((o.messages ?? []).map(m => m.trigger))
  o.messages = [...(o.messages ?? []), ...base.messages.filter(m => !have.has(m.trigger))]
  return o
}

export function normalizeQuestions(raw: Partial<Questions> | null | undefined): Questions {
  const base = defaultQuestions()
  return {
    fields: raw?.fields ?? base.fields,
    companions: raw?.companions ?? base.companions,
    marketing: { ...base.marketing, ...(raw?.marketing ?? {}) },
  }
}

export function normalizeTheme(raw: Partial<Theme> | null | undefined): Theme {
  return { ...defaultTheme(), ...(raw ?? {}) }
}
