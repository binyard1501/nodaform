import { randomUUID } from 'node:crypto'
import { mapApp, mapForm, type AppRow, type Db, type FormRow, type Q } from './db'
import { kstIso } from './format'
import { sendMessage } from './messaging'
import {
  defaultOffer,
  defaultQuestions,
  defaultTheme,
  type Answers,
  type AppStatus,
  type FormRecord,
  type Item,
  type Method,
  type Offer,
  type Questions,
  type Theme,
} from './types'

const NAMES = ['김서연', '이도윤', '박하은', '최민준', '정지우', '강서준', '조수아', '윤예준', '장하린', '임시우', '한지아', '오건우', '서다은', '신유준', '권채원', '황도현', '안소율', '송이안', '류지호', '전하윤']
const ORGS = ['한빛전자', '누리소프트', '다온물산', '세움건설', '바른회계법인', '온새미디자인', '하람바이오']
const TITLES = ['대리', '과장', '팀장', '책임', '대표']
const PARTIES = [2, 1, 3, 2, 4, 1, 2, 2, 3, 1, 2, 4, 1, 2, 3]

function kstDate(daysFromNow: number) {
  return new Date(Date.now() + 9 * 3600_000 + daysFromNow * 86_400_000).toISOString().slice(0, 10)
}

const f = (id: string, type: Questions['fields'][number]['type'], label: string, required: boolean, options: string[] = [], help = '') => ({
  id,
  type,
  label,
  required,
  options,
  help,
})

const POPUP_QUESTIONS: Questions = {
  fields: [
    f('instagram', 'text', '인스타그램 아이디', false, [], '당첨·이벤트 안내에만 씁니다'),
    f('route', 'select', '어떻게 알고 오셨나요?', false, ['인스타그램', '지인 추천', '지나가다', '기사·블로그']),
  ],
  companions: true,
  marketing: { enabled: true, text: '브랜드 신제품·팝업 소식을 문자로 받겠습니다 (선택)' },
}
const POPUP_THEME: Theme = { color: '#7a3e9d', logo: null, cover: null }

const SEMINAR_QUESTIONS: Questions = {
  fields: [
    f('org', 'text', '소속', true),
    f('title', 'text', '직책', true),
    f('email', 'email', '이메일', true, [], '발표 자료를 이메일로 보내드립니다'),
    f('invoice', 'select', '세금계산서', true, ['필요 없음', '발행 필요']),
    f('privacy', 'consent', '개인정보 수집·이용에 동의합니다', true, [], '세미나 운영과 참가 확인서 발급에만 씁니다'),
  ],
  companions: false,
  marketing: { enabled: false, text: defaultQuestions().marketing.text },
}
const SEMINAR_THEME: Theme = { color: '#1f3a8a', logo: null, cover: null }

let counter = 0

async function insertForm(
  q: Q,
  workspaceId: string,
  f: { slug: string; title: string; description: string; offer: Offer; questions: Questions; theme: Theme },
) {
  const { rows } = await q.query<FormRow>(
    `insert into forms (id, workspace_id, slug, title, description, status, offer, questions, theme)
     values ($1, $2, $3, $4, $5, 'published', $6::jsonb, $7::jsonb, $8::jsonb) returning *`,
    [randomUUID(), workspaceId, f.slug, f.title, f.description, JSON.stringify(f.offer), JSON.stringify(f.questions), JSON.stringify(f.theme)],
  )
  return mapForm(rows[0])
}

async function insertItem(q: Q, formId: string, item: Omit<Item, 'id'>) {
  const id = randomUUID()
  await q.query(
    `insert into items (id, form_id, label, starts_at, ends_at, price, capacity, position) values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8)`,
    [id, formId, item.label, item.startsAt, item.endsAt, item.price, item.capacity, item.position],
  )
  return { ...item, id }
}

type Extra = (n: number, party: number) => { answers: Answers; companions: string[]; marketing: boolean }

async function insertApp(q: Q, form: FormRecord, item: Item, a: { party: number; status: AppStatus; method: Method; createdAt: Date }, extra: Extra) {
  const n = counter++
  const expiresAt = a.status === 'pending_deposit' ? new Date(a.createdAt.getTime() + form.offer.deposit.deadlineHours * 3600_000) : null
  const x = extra(n, a.party)
  const { rows } = await q.query<AppRow>(
    `insert into applications (id, form_id, item_id, name, phone, party, amount, method, status, created_at, expires_at, confirmed_at, updated_at,
       answers, companions, marketing)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz,
             case when $9 = 'confirmed' then $10::timestamptz end, $10::timestamptz, $12::jsonb, $13::jsonb, $14)
     returning *`,
    [
      randomUUID(),
      form.id,
      item.id,
      NAMES[n % NAMES.length],
      `0101234${String(1000 + n).slice(-4)}`,
      a.party,
      (form.offer.free ? 0 : item.price) * a.party,
      a.method,
      a.status,
      a.createdAt.toISOString(),
      expiresAt?.toISOString() ?? null,
      JSON.stringify(x.answers),
      JSON.stringify(x.companions),
      x.marketing,
    ],
  )
  const app = mapApp(rows[0])
  const now = a.createdAt
  if (a.status === 'confirmed') {
    await sendMessage(q, { form, item, app, trigger: 'confirmed', now })
    await sendMessage(q, { form, item, app, trigger: 'reminder', now })
  } else if (a.status === 'pending_deposit') {
    await sendMessage(q, { form, item, app, trigger: 'deposit_requested', now })
  } else if (a.status === 'waitlisted') {
    await sendMessage(q, { form, item, app, trigger: 'waitlisted', now })
  }
}

type Plan = { item: Item; seats: number; status: AppStatus; method: Method; parties?: number[] }

async function fill(q: Q, form: FormRecord, plans: Plan[], extra: Extra) {
  const total = plans.reduce((s, p) => s + (p.parties?.length ?? Math.ceil(p.seats / 2)), 0)
  let k = 0
  const stamp = () => new Date(Date.now() - (total - k++) * 23 * 60_000)
  for (const plan of plans) {
    const parties: number[] = plan.parties ?? []
    if (!plan.parties) {
      let left = plan.seats
      let i = 0
      while (left > 0) {
        const party = Math.min(PARTIES[i++ % PARTIES.length], left)
        parties.push(party)
        left -= party
      }
    }
    for (const party of parties) await insertApp(q, form, plan.item, { party, status: plan.status, method: plan.method, createdAt: stamp() }, extra)
  }
}

const popupExtra: Extra = (n, party) => ({
  answers: { instagram: n % 3 === 0 ? '' : `@${['sand', 'film', 'dawn', 'mono', 'leaf'][n % 5]}_${n}`, route: POPUP_QUESTIONS.fields[1].options[n % 4] },
  companions: Array.from({ length: party - 1 }, (_, i) => NAMES[(n + 7 + i * 3) % NAMES.length]),
  marketing: n % 5 !== 0,
})

const seminarExtra: Extra = n => ({
  answers: {
    org: ORGS[n % ORGS.length],
    title: TITLES[n % TITLES.length],
    email: `member${n}@example.com`,
    invoice: n % 3 === 0 ? '발행 필요' : '필요 없음',
    privacy: true,
  },
  companions: [],
  marketing: false,
})

const briefingExtra: Extra = n => ({
  answers: { org: n % 2 ? ORGS[n % ORGS.length] : '', question: n % 4 === 0 ? '요금제와 무료 범위가 궁금합니다.' : '' },
  companions: [],
  marketing: n % 3 !== 0,
})

async function seedPopup(q: Q, workspaceId: string, slug: string) {
  const offer = defaultOffer()
  offer.deposit = { enabled: true, bank: '신한은행', account: '110-000-000000', holder: '노다 팝업(예시)', deadlineHours: 24 }
  const form = await insertForm(q, workspaceId, {
    slug,
    title: '성수 여름 끝 팝업 (예시)',
    description: '30분 단위 입장 예약 · 1인 5,000원, 엽서 굿즈 교환권 포함',
    offer,
    questions: POPUP_QUESTIONS,
    theme: POPUP_THEME,
  })
  const date = kstDate(16)
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const items: Item[] = []
  for (let s = 0; s < 16; s++) {
    const start = 11 * 60 + s * 30
    items.push(
      await insertItem(q, form.id, {
        label: `${hhmm(start)} 입장`,
        startsAt: kstIso(date, hhmm(start)),
        endsAt: kstIso(date, hhmm(start + 30)),
        price: 5000,
        capacity: 40,
        position: s,
      }),
    )
  }
  await fill(
    q,
    form,
    [
      { item: items[0], seats: 38, status: 'confirmed', method: 'deposit' },
      { item: items[0], seats: 2, status: 'pending_deposit', method: 'deposit', parties: [2] },
      { item: items[0], seats: 5, status: 'waitlisted', method: 'deposit', parties: [2, 1, 2] },
      { item: items[1], seats: 22, status: 'confirmed', method: 'deposit' },
      { item: items[1], seats: 4, status: 'pending_deposit', method: 'deposit', parties: [2, 2] },
      { item: items[2], seats: 9, status: 'confirmed', method: 'deposit' },
      { item: items[5], seats: 14, status: 'confirmed', method: 'deposit' },
      { item: items[8], seats: 4, status: 'confirmed', method: 'deposit' },
    ],
    popupExtra,
  )
}

async function seedSeminar(q: Q, workspaceId: string, slug: string) {
  const offer = defaultOffer()
  const date = kstDate(20)
  offer.structure = 'single'
  offer.party = { mode: 'solo', max: 1 }
  offer.overflow = 'close'
  offer.close = { mode: 'at', minutes: 60, at: new Date(new Date(kstIso(date, '18:00')).getTime() - 2 * 86_400_000).toISOString() }
  offer.deposit = { enabled: true, bank: '국민은행', account: '000000-00-000000', holder: '(사)노다협회(예시)', deadlineHours: 72 }
  offer.onsite = true
  const form = await insertForm(q, workspaceId, {
    slug,
    title: '2026 하반기 회원사 세미나 (예시)',
    description: '회원사 30,000원 · 비회원 50,000원 · 선착순',
    offer,
    questions: SEMINAR_QUESTIONS,
    theme: SEMINAR_THEME,
  })
  const common = { startsAt: kstIso(date, '14:00'), endsAt: kstIso(date, '17:00') }
  const member = await insertItem(q, form.id, { label: '회원사 참가권', ...common, price: 30000, capacity: 60, position: 0 })
  const guest = await insertItem(q, form.id, { label: '비회원 참가권', ...common, price: 50000, capacity: 20, position: 1 })
  const ones = (n: number) => Array.from({ length: n }, () => 1)
  await fill(
    q,
    form,
    [
      { item: member, seats: 18, status: 'confirmed', method: 'deposit', parties: ones(18) },
      { item: member, seats: 4, status: 'confirmed', method: 'onsite', parties: ones(4) },
      { item: member, seats: 3, status: 'pending_deposit', method: 'deposit', parties: ones(3) },
      { item: guest, seats: 5, status: 'confirmed', method: 'deposit', parties: ones(5) },
    ],
    seminarExtra,
  )
}

async function seedBriefing(q: Q, workspaceId: string, slug: string) {
  const offer = defaultOffer()
  const date = kstDate(10)
  offer.structure = 'simple'
  offer.free = true
  offer.party = { mode: 'solo', max: 1 }
  offer.overflow = 'close'
  offer.close = { mode: 'none', minutes: 60, at: null }
  const form = await insertForm(q, workspaceId, {
    slug,
    title: 'NODA. 온라인 설명회 사전 등록 (예시)',
    description: '무료 · 누구나 · 접속 링크는 전날 문자로 보내드립니다',
    offer,
    questions: {
      fields: [f('org', 'text', '소속', false), f('question', 'textarea', '미리 궁금한 점', false, [], '설명회에서 먼저 답해 드립니다')],
      companions: false,
      marketing: { enabled: true, text: 'NODA. 소식과 다음 설명회 일정을 문자로 받겠습니다 (선택)' },
    },
    theme: defaultTheme(),
  })
  const item = await insertItem(q, form.id, { label: '사전 등록', startsAt: kstIso(date, '19:00'), endsAt: kstIso(date, '20:00'), price: 0, capacity: null, position: 0 })
  await fill(q, form, [{ item, seats: 14, status: 'confirmed', method: 'free', parties: Array.from({ length: 14 }, () => 1) }], briefingExtra)
}

const POTTERY_QUESTIONS: Questions = {
  fields: [
    f('level', 'select', '도예 경험', true, ['처음이에요', '몇 번 해봤어요', '꾸준히 하고 있어요']),
    f('note', 'text', '알레르기·건강상 참고할 점', false),
  ],
  companions: true,
  marketing: { enabled: true, text: '다음 클래스 일정을 문자로 받겠습니다 (선택)' },
}

const potteryExtra: Extra = (n, party) => ({
  answers: { level: POTTERY_QUESTIONS.fields[0].options[n % 3], note: n % 6 === 0 ? '손목 보호대 착용' : '' },
  companions: Array.from({ length: party - 1 }, (_, i) => NAMES[(n + 5 + i) % NAMES.length]),
  marketing: n % 2 === 0,
})

async function seedPottery(q: Q, workspaceId: string, slug: string) {
  const offer = defaultOffer()
  offer.party = { mode: 'group', max: 2 }
  offer.claimHours = 3
  offer.close = { mode: 'before_start', minutes: 1440, at: null }
  offer.limitPerPerson = 2
  offer.deposit = { enabled: true, bank: '우리은행', account: '1002-000-000000', holder: '노다공방(예시)', deadlineHours: 12 }
  offer.refundRules = [
    { daysBefore: 3, percent: 100 },
    { daysBefore: 1, percent: 50 },
    { daysBefore: 0, percent: 0 },
  ]
  const form = await insertForm(q, workspaceId, {
    slug,
    title: '가을 도예 원데이 클래스 (예시)',
    description: '2주간 화~토 · 하루 네 타임 · 1인 45,000원, 재료비 포함',
    offer,
    questions: POTTERY_QUESTIONS,
    theme: { color: '#c27c0e', logo: null, cover: null },
  })
  const items: Item[] = []
  for (let d = 5; d <= 18; d++) {
    const date = kstDate(d)
    if (new Date(`${date}T00:00:00Z`).getUTCDay() < 2) continue
    for (const h of [10, 12, 14, 16]) {
      const start = `${String(h).padStart(2, '0')}:00`
      items.push(
        await insertItem(q, form.id, {
          label: `${start} 클래스`,
          startsAt: kstIso(date, start),
          endsAt: kstIso(date, `${String(h + 2).padStart(2, '0')}:00`),
          price: 45000,
          capacity: 8,
          position: items.length,
        }),
      )
    }
  }
  await fill(
    q,
    form,
    [
      { item: items[0], seats: 8, status: 'confirmed', method: 'deposit', parties: [2, 1, 2, 1, 2] },
      { item: items[0], seats: 3, status: 'waitlisted', method: 'deposit', parties: [2, 1] },
      { item: items[1], seats: 5, status: 'confirmed', method: 'deposit', parties: [2, 1, 2] },
      { item: items[4], seats: 6, status: 'confirmed', method: 'deposit', parties: [2, 2, 1, 1] },
      { item: items[5], seats: 2, status: 'pending_deposit', method: 'deposit', parties: [2] },
      { item: items[9], seats: 3, status: 'confirmed', method: 'deposit', parties: [1, 2] },
    ],
    potteryExtra,
  )
}

const EXAMPLES: { baseSlug: string; seed: (q: Q, workspaceId: string, slug: string) => Promise<void>; questions?: Questions; theme?: Theme }[] = [
  { baseSlug: 'member-seminar', seed: seedSeminar, questions: SEMINAR_QUESTIONS, theme: SEMINAR_THEME },
  { baseSlug: 'seongsu-popup', seed: seedPopup, questions: POPUP_QUESTIONS, theme: POPUP_THEME },
  { baseSlug: 'noda-briefing', seed: seedBriefing },
  { baseSlug: 'pottery-class', seed: seedPottery },
]

// Public form URLs (/f/[slug]) have no workspace segment, so slugs must stay globally unique —
// each workspace's copy of an example gets its own short suffix.
function exampleSlug(workspaceId: string, baseSlug: string) {
  return `${baseSlug}-${workspaceId.slice(0, 6)}`
}

// Seeds a new workspace with the example forms, and (for the legacy no-auth prototype data
// that predates workspaces) gives already-seeded examples their settings if still missing.
export async function ensureExamples(d: Db, workspaceId: string) {
  await d.transaction(async tx => {
    for (const ex of EXAMPLES) {
      const slug = exampleSlug(workspaceId, ex.baseSlug)
      const { rows } = await tx.query<{ id: string; questions: object }>(`select id, questions from forms where slug = $1`, [slug])
      if (!rows[0]) {
        await ex.seed(tx, workspaceId, slug)
      } else if (ex.questions && Object.keys(rows[0].questions ?? {}).length === 0) {
        await tx.query(
          `update forms set questions = $2::jsonb, theme = $3::jsonb, offer = offer || '{"limitPerPerson": 1}'::jsonb where id = $1`,
          [rows[0].id, JSON.stringify(ex.questions), JSON.stringify(ex.theme)],
        )
      }
    }
  })
}
