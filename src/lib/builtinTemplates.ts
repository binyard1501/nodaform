import type { PGlite } from '@electric-sql/pglite'
import { sanitizeFormHtml } from './sanitizeHtml'

// Built-in templates ship as plain inline-styled HTML (no <style> block — sanitizeFormHtml strips
// it, same as for any operator-submitted template) so they render identically regardless of what
// CSS custom properties happen to be in scope on the public form page.
const TEMPLATES: { id: string; name: string; html: string }[] = [
  {
    id: 'builtin-minimal',
    name: '미니멀 라인',
    html: `
<div style="max-width:420px;margin:0 auto;font-family:Georgia,serif;">
  <h2 style="font-weight:400;font-size:24px;letter-spacing:-0.01em;margin:0 0 28px;color:#15201c;">신청서</h2>
  <label style="display:block;margin-bottom:20px;">
    <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">이름</span>
    <input name="name" required style="width:100%;border:0;border-bottom:1px solid #d3dcd8;padding:8px 0;font-size:15px;background:transparent;" />
  </label>
  <label style="display:block;margin-bottom:20px;">
    <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">휴대폰 번호</span>
    <input name="phone" required style="width:100%;border:0;border-bottom:1px solid #d3dcd8;padding:8px 0;font-size:15px;background:transparent;" />
  </label>
  <label style="display:block;margin-bottom:20px;">
    <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">하고 싶은 말</span>
    <textarea name="f_message" rows="3" style="width:100%;border:0;border-bottom:1px solid #d3dcd8;padding:8px 0;font-size:15px;background:transparent;resize:vertical;"></textarea>
  </label>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:28px;font-size:13px;color:#586862;">
    <input type="checkbox" name="f_agree" required /> 개인정보 수집·이용에 동의합니다
  </label>
  <button type="submit" style="width:100%;padding:14px;background:#15201c;color:#fff;border:0;border-radius:2px;font-size:15px;letter-spacing:0.02em;">신청하기</button>
</div>`,
  },
  {
    id: 'builtin-hero',
    name: '포토 히어로',
    html: `
<div style="max-width:460px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.12);">
  <div style="background:linear-gradient(135deg,#1f3a8a,#3651a3);padding:48px 28px;color:#fff;">
    <div style="font-size:12px;letter-spacing:0.14em;opacity:0.8;margin-bottom:8px;">EVENT ENTRY</div>
    <div style="font-size:26px;font-weight:700;line-height:1.3;">지금 바로 신청하세요</div>
  </div>
  <div style="padding:28px;background:#fff;">
    <label style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:13px;font-weight:600;color:#15201c;margin-bottom:6px;">이름</span>
      <input name="name" required style="width:100%;border:1px solid #d3dcd8;border-radius:8px;padding:11px 12px;font-size:14px;" />
    </label>
    <label style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:13px;font-weight:600;color:#15201c;margin-bottom:6px;">휴대폰 번호</span>
      <input name="phone" required style="width:100%;border:1px solid #d3dcd8;border-radius:8px;padding:11px 12px;font-size:14px;" />
    </label>
    <label style="display:block;margin-bottom:14px;">
      <span style="display:block;font-size:13px;font-weight:600;color:#15201c;margin-bottom:6px;">어떻게 알고 오셨나요?</span>
      <select name="f_route" style="width:100%;border:1px solid #d3dcd8;border-radius:8px;padding:11px 12px;font-size:14px;">
        <option value="인스타그램">인스타그램</option>
        <option value="지인 추천">지인 추천</option>
        <option value="기타">기타</option>
      </select>
    </label>
    <label style="display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:13px;color:#586862;">
      <input type="checkbox" name="f_agree" required /> 개인정보 수집·이용에 동의합니다
    </label>
    <button type="submit" style="width:100%;padding:14px;background:#1f3a8a;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;">신청하기</button>
  </div>
</div>`,
  },
  {
    id: 'builtin-cards',
    name: '카드 그리드',
    html: `
<div style="max-width:480px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#15201c;">신청 정보</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
    <div style="border:1px solid #eaefec;border-radius:10px;padding:14px;background:#fafcfb;">
      <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">이름</span>
      <input name="name" required style="width:100%;border:0;background:transparent;font-size:14px;padding:0;" />
    </div>
    <div style="border:1px solid #eaefec;border-radius:10px;padding:14px;background:#fafcfb;">
      <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">휴대폰 번호</span>
      <input name="phone" required style="width:100%;border:0;background:transparent;font-size:14px;padding:0;" />
    </div>
  </div>
  <div style="border:1px solid #eaefec;border-radius:10px;padding:14px;background:#fafcfb;margin-bottom:12px;">
    <span style="display:block;font-size:12px;color:#8a9892;margin-bottom:6px;">궁금한 점</span>
    <textarea name="f_message" rows="3" style="width:100%;border:0;background:transparent;font-size:14px;padding:0;resize:vertical;"></textarea>
  </div>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:18px;font-size:13px;color:#586862;">
    <input type="checkbox" name="f_agree" required /> 개인정보 수집·이용에 동의합니다
  </label>
  <button type="submit" style="width:100%;padding:14px;background:#0e6b5b;color:#fff;border:0;border-radius:10px;font-size:15px;font-weight:600;">신청하기</button>
</div>`,
  },
  {
    id: 'builtin-brutalist',
    name: '브루탈리스트',
    html: `
<div style="max-width:440px;margin:0 auto;font-family:'Courier New',monospace;border:3px solid #1c1c1c;padding:24px;">
  <h2 style="font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.02em;margin:0 0 20px;border-bottom:3px solid #1c1c1c;padding-bottom:10px;">APPLY NOW</h2>
  <label style="display:block;margin-bottom:16px;">
    <span style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px;">이름 / NAME</span>
    <input name="name" required style="width:100%;border:2px solid #1c1c1c;padding:10px;font-size:14px;font-family:inherit;" />
  </label>
  <label style="display:block;margin-bottom:16px;">
    <span style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:6px;">휴대폰 / PHONE</span>
    <input name="phone" required style="width:100%;border:2px solid #1c1c1c;padding:10px;font-size:14px;font-family:inherit;" />
  </label>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:12px;">
    <input type="checkbox" name="f_agree" required /> 개인정보 수집·이용에 동의합니다
  </label>
  <button type="submit" style="width:100%;padding:14px;background:#1c1c1c;color:#fff;border:0;font-size:15px;font-weight:900;text-transform:uppercase;letter-spacing:0.05em;">SUBMIT →</button>
</div>`,
  },
  {
    id: 'builtin-pastel',
    name: '파스텔 소프트',
    html: `
<div style="max-width:440px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;background:#fdf6f4;border-radius:24px;padding:32px;">
  <h2 style="font-size:20px;font-weight:700;margin:0 0 20px;color:#5a3d3a;">함께해요 🌸</h2>
  <label style="display:block;margin-bottom:14px;">
    <span style="display:block;font-size:13px;color:#8a6b66;margin-bottom:6px;">이름</span>
    <input name="name" required style="width:100%;border:none;border-radius:999px;padding:12px 18px;font-size:14px;background:#fff;" />
  </label>
  <label style="display:block;margin-bottom:14px;">
    <span style="display:block;font-size:13px;color:#8a6b66;margin-bottom:6px;">휴대폰 번호</span>
    <input name="phone" required style="width:100%;border:none;border-radius:999px;padding:12px 18px;font-size:14px;background:#fff;" />
  </label>
  <label style="display:block;margin-bottom:20px;">
    <span style="display:block;font-size:13px;color:#8a6b66;margin-bottom:6px;">전하고 싶은 말</span>
    <textarea name="f_message" rows="3" style="width:100%;border:none;border-radius:18px;padding:12px 18px;font-size:14px;background:#fff;resize:vertical;"></textarea>
  </label>
  <label style="display:flex;align-items:center;gap:8px;margin-bottom:22px;font-size:12.5px;color:#8a6b66;">
    <input type="checkbox" name="f_agree" required /> 개인정보 수집·이용에 동의합니다
  </label>
  <button type="submit" style="width:100%;padding:14px;background:#e8a49c;color:#fff;border:0;border-radius:999px;font-size:15px;font-weight:600;">신청하기</button>
</div>`,
  },
]

export async function ensureBuiltinTemplates(db: PGlite) {
  for (const t of TEMPLATES) {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from templates where id = $1`, [t.id])
    if ((rows[0] as { n: number }).n > 0) continue
    await db.query(
      `insert into templates (id, workspace_id, name, html, visibility, is_builtin) values ($1, null, $2, $3, 'public', true)`,
      [t.id, t.name, sanitizeFormHtml(t.html.trim())],
    )
  }
}
