import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { rawDb, type Q } from './db'
import { ensureExamples } from './seed'

export class AuthError extends Error {}

const COOKIE = 'noda_session'
const SESSION_DAYS = 30

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const check = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return check.length === expected.length && timingSafeEqual(check, expected)
}

async function db(): Promise<Q> {
  return rawDb()
}

async function createSession(userId: string) {
  const q = await db()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await q.query(`insert into sessions (token, user_id, expires_at) values ($1, $2, $3::timestamptz)`, [token, userId, expiresAt.toISOString()])
  const jar = await cookies()
  jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt })
}

export async function signUp(email: string, password: string, workspaceName: string) {
  const q = await db()
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new AuthError('올바른 이메일 주소를 입력해 주세요.')
  if (password.length < 8) throw new AuthError('비밀번호는 8자 이상이어야 합니다.')
  const { rows: existing } = await q.query<{ n: number }>(`select count(*)::int as n from users where email = $1`, [normalizedEmail])
  if (existing[0].n > 0) throw new AuthError('이미 가입된 이메일입니다.')

  const workspaceId = randomUUID()
  const userId = randomUUID()
  await q.query(`insert into workspaces (id, name) values ($1, $2)`, [workspaceId, workspaceName.trim() || '내 워크스페이스'])
  await q.query(`insert into users (id, workspace_id, email, password_hash) values ($1, $2, $3, $4)`, [
    userId,
    workspaceId,
    normalizedEmail,
    hashPassword(password),
  ])
  // New workspaces start with the same example forms the old single-workspace prototype seeded,
  // so a fresh signup has something to look at instead of an empty dashboard.
  await ensureExamples(await rawDb(), workspaceId)
  await createSession(userId)
}

export async function login(email: string, password: string) {
  const q = await db()
  const normalizedEmail = email.trim().toLowerCase()
  const { rows } = await q.query<{ id: string; password_hash: string }>(`select id, password_hash from users where email = $1`, [normalizedEmail])
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash)) throw new AuthError('이메일 또는 비밀번호가 올바르지 않습니다.')
  await createSession(rows[0].id)
}

export async function logout() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    const q = await db()
    await q.query(`delete from sessions where token = $1`, [token])
  }
  jar.delete(COOKIE)
}

export type Session = { userId: string; email: string; workspaceId: string; workspaceName: string }

export async function getSession(): Promise<Session | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const q = await db()
  const { rows } = await q.query<{ id: string; email: string; workspace_id: string; name: string }>(
    `select u.id, u.email, u.workspace_id, w.name
     from sessions s join users u on u.id = s.user_id join workspaces w on w.id = u.workspace_id
     where s.token = $1 and s.expires_at > now()`,
    [token],
  )
  if (!rows[0]) return null
  return { userId: rows[0].id, email: rows[0].email, workspaceId: rows[0].workspace_id, workspaceName: rows[0].name }
}

// For Server Components (pages/layouts): sends a signed-out visitor to /login.
export async function requireWorkspace(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

// For Server Actions: redirect()'s thrown control-flow error would otherwise be caught by the
// actions' try/catch, so this throws a plain AuthError instead and lets the caller report it.
export async function requireWorkspaceId(): Promise<string> {
  const session = await getSession()
  if (!session) throw new AuthError('로그인이 필요합니다. 다시 로그인해 주세요.')
  return session.workspaceId
}
