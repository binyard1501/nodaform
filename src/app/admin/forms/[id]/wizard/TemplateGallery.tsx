'use client'

import { useRef, useState, useTransition } from 'react'
import {
  deleteTemplateAction,
  listTemplatesAction,
  pickTemplateAction,
  rateTemplateAction,
  saveTemplateAction,
  setTemplateVisibilityAction,
} from '@/app/actions'
import type { TemplateCard, TemplateGallery as Gallery, TemplateVisibility } from '@/lib/templates'

function Stars({ value, count, onRate }: { value: number; count: number; onRate?: (n: number) => void }) {
  return (
    <span className="row" style={{ gap: 2 }} aria-label={`평점 ${value} (${count}명)`}>
      {[1, 2, 3, 4, 5].map(n => (
        <span
          key={n}
          role={onRate ? 'button' : undefined}
          tabIndex={onRate ? 0 : undefined}
          onClick={() => onRate?.(n)}
          style={{ cursor: onRate ? 'pointer' : 'default', color: n <= Math.round(value) ? '#c27c0e' : 'var(--rule)', fontSize: 14 }}
        >
          ★
        </span>
      ))}
      <span className="small muted" style={{ marginLeft: 4 }}>
        {value > 0 ? value.toFixed(1) : '평점 없음'} {count > 0 && `(${count})`}
      </span>
    </span>
  )
}

function Card({ t, onUse, onChanged }: { t: TemplateCard; onUse: (html: string) => void; onChanged: () => void }) {
  const [pending, start] = useTransition()

  function use() {
    start(async () => {
      const r = await pickTemplateAction(t.id)
      if (r.html !== undefined) onUse(r.html)
    })
  }

  function rate(n: number) {
    start(async () => {
      await rateTemplateAction(t.id, n)
      onChanged()
    })
  }

  function toggleVisibility() {
    start(async () => {
      await setTemplateVisibilityAction(t.id, t.visibility === 'public' ? 'private' : 'public')
      onChanged()
    })
  }

  function remove() {
    if (!window.confirm(`'${t.name}' 템플릿을 삭제할까요?`)) return
    start(async () => {
      await deleteTemplateAction(t.id)
      onChanged()
    })
  }

  return (
    <div className="template-card">
      <div className="template-card-preview">
        <iframe title={t.name} sandbox="" srcDoc={t.html} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b style={{ fontSize: 13.5 }}>{t.name}</b>
          {t.mine && !t.isBuiltin && (
            <span className={`pill ${t.visibility === 'public' ? 'pill-info' : ''}`}>{t.visibility === 'public' ? '공개' : '비공개'}</span>
          )}
        </div>
        <Stars value={t.avgRating} count={t.ratingCount} onRate={rate} />
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" onClick={use} disabled={pending}>
            이 템플릿 쓰기
          </button>
          {t.mine && !t.isBuiltin && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleVisibility} disabled={pending}>
                {t.visibility === 'public' ? '비공개로 전환' : '공개로 전환'}
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={pending}>
                삭제
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function TemplateGalleryDialog({ onUse }: { onUse: (html: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [tab, setTab] = useState<'builtin' | 'community' | 'mine'>('builtin')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function load() {
    start(async () => {
      const r = await listTemplatesAction()
      if (r.error) setError(r.error)
      else {
        setError(null)
        setGallery(r.gallery!)
      }
    })
  }

  function open() {
    dialogRef.current?.showModal()
    load()
  }

  const rows = gallery?.[tab] ?? []

  return (
    <>
      <button type="button" className="btn" onClick={open}>
        템플릿 갤러리
      </button>
      <dialog ref={dialogRef} className="template-dialog">
        <div className="stack" style={{ gap: 16, padding: 22, width: 'min(90vw, 760px)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 16 }}>템플릿 갤러리</b>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialogRef.current?.close()}>
              닫기
            </button>
          </div>
          <div className="tabs">
            <a aria-current={tab === 'builtin' ? 'page' : undefined} onClick={() => setTab('builtin')}>
              기본 템플릿 {gallery && `(${gallery.builtin.length})`}
            </a>
            <a aria-current={tab === 'community' ? 'page' : undefined} onClick={() => setTab('community')}>
              커뮤니티 {gallery && `(${gallery.community.length})`}
            </a>
            <a aria-current={tab === 'mine' ? 'page' : undefined} onClick={() => setTab('mine')}>
              내 템플릿 {gallery && `(${gallery.mine.length})`}
            </a>
          </div>
          {error && <p className="form-error">{error}</p>}
          {pending && !gallery && <p className="muted small">불러오는 중…</p>}
          <div className="template-grid">
            {rows.length === 0 && !pending && (
              <p className="muted small">
                {tab === 'mine' ? '아직 저장한 템플릿이 없습니다. 디자인 단계에서 만든 HTML을 템플릿으로 저장해 보세요.' : '표시할 템플릿이 없습니다.'}
              </p>
            )}
            {rows.map(t => (
              <Card
                key={t.id}
                t={t}
                onUse={html => {
                  onUse(html)
                  dialogRef.current?.close()
                }}
                onChanged={load}
              />
            ))}
          </div>
        </div>
      </dialog>
    </>
  )
}

export function SaveTemplateButton({ html }: { html: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<TemplateVisibility>('private')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function save() {
    start(async () => {
      const r = await saveTemplateAction(name, html, visibility)
      if (r.error) {
        setError(r.error)
        return
      }
      setError(null)
      setSaved(true)
      setTimeout(() => dialogRef.current?.close(), 900)
    })
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setSaved(false)
          setError(null)
          dialogRef.current?.showModal()
        }}
        disabled={!html.trim()}
      >
        내 템플릿으로 저장
      </button>
      <dialog ref={dialogRef} className="qr-dialog">
        <div className="stack" style={{ gap: 14, padding: 22, minWidth: 280 }}>
          <b>템플릿으로 저장</b>
          <div className="field">
            <span className="label">템플릿 이름</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 우리 브랜드 신청폼" />
          </div>
          <label className="check">
            <input type="checkbox" checked={visibility === 'public'} onChange={e => setVisibility(e.target.checked ? 'public' : 'private')} />
            <span>커뮤니티에 공개하기 (다른 워크스페이스도 볼 수 있습니다)</span>
          </label>
          {error && <p className="form-error">{error}</p>}
          {saved && <p className="status-card tone-ok small">저장했습니다.</p>}
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={pending || !name.trim()}>
              {pending ? '저장 중…' : '저장'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialogRef.current?.close()}>
              취소
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
