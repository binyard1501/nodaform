'use client'

import { useRef, useState } from 'react'

export function ShareForm({ url, title, qrSvg }: { url: string; title: string; qrSvg: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('아래 주소를 복사해 주세요', url)
    }
  }

  // Web Share API is client-only and only available on some browsers (mainly mobile),
  // so it's checked at click time rather than during render to avoid a hydration mismatch.
  async function share() {
    if (typeof navigator.share !== 'function') return copy()
    try {
      await navigator.share({ title, url })
    } catch {
      // Cancelled or unsupported mid-call — nothing to do.
    }
  }

  function downloadQr() {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = `${title} 신청 QR.svg`
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <>
      <button type="button" className="btn" onClick={share}>
        공유하기
      </button>
      <button type="button" className="btn" onClick={copy}>
        {copied ? '복사됨' : '링크 복사'}
      </button>
      <button type="button" className="btn" onClick={() => dialogRef.current?.showModal()}>
        QR 코드
      </button>
      <dialog ref={dialogRef} className="qr-dialog">
        <div className="stack" style={{ gap: 14, padding: 22, minWidth: 260 }}>
          <b>신청 화면 QR</b>
          <div className="qr-box" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <span className="mono small muted" style={{ wordBreak: 'break-all' }}>
            {url}
          </span>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={downloadQr}>
              QR 다운로드
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialogRef.current?.close()}>
              닫기
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}
