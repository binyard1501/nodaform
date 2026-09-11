# 노다(nodaform) 개발 문서

마지막 갱신: 2026-09-11 (완전자유 HTML 모드 Phase 1 구현 완료)

이 문서는 지금까지 구현된 것, 왜 그렇게 만들었는지, 그리고 앞으로 해야 할 일을 정리합니다. 새 세션에서 이어서 작업할 때 이 문서부터 읽으면 맥락을 다시 설명할 필요가 없도록 관리합니다.

## 제품 한 줄 정의

"폼빌더"가 아니라 **신청+결제+정원관리+알림 자동화 올인원 툴**. 타겟은 협회/단체, 이벤트 주최자, 팝업스토어 운영자. 네이버폼/구글폼이 못 하는 지점(결제+정원+대기열+SMS/알림톡 자동화 조합)에서 차별화한다.

## 스택

- Next.js 16 (App Router, Server Actions, Turbopack)
- React 19
- PGlite(임베디드 Postgres, 프로세스당 싱글턴, `.data/pglite`에 파일로 저장 — gitignore됨)
- 별도 ORM 없이 raw SQL

## 아키텍처 개요

```
src/lib/types.ts     도메인 타입 + 기본값/정규화 함수
src/lib/db.ts         SQL 스키마 + row ↔ domain 매퍼
src/lib/rules.ts       순수 함수 비즈니스 규칙 (마감/정원/환불 계산)
src/lib/engine.ts      트랜잭션 단위 유스케이스 (신청/승인/취소/대기열 승격 등)
src/lib/messaging.ts   알림 렌더링 (실제 발송 없음, DB 로그만 — 프로토타입)
src/lib/auth.ts        로그인/세션/워크스페이스
src/lib/seed.ts        예시 데이터 시더 (워크스페이스별)
src/app/actions.ts     Server Action 얇은 wrapper (권한 체크 + 에러 매핑)
src/app/admin/**       운영자 화면 (로그인 필요)
src/app/f/**           신청자 화면 (공개, 로그인 불필요)
src/app/login, /signup 인증 화면
```

핵심 패턴: `engine.ts`의 `withApp()` 헬퍼가 트랜잭션 + 비관적 락(`for update`) + lazy reconcile(만료 처리·대기열 승격)을 모든 애플리케이션 단위 액션에 일관되게 적용합니다. 별도 배치/크론 없이 매 요청 시점에 "지금 시각 기준으로 상태를 다시 계산"하는 lazy-expiry 방식입니다.

## 지금까지 구현된 것

### 1. 핵심 신청 엔진 (초기 구현)
- 정원 구조 3종: `simple`(단일 항목) / `single`(권종별) / `slots`(시간대별)
- 대기열: 정원 초과 시 대기 등록 → 자리가 나면 자동으로 앞 순번부터 제안(`offered`) → 기한 내 미확정 시 자동 만료 → 다음 순번에게 재제안
- 결제 방식: 무통장 입금(관리자 수동 확인), 현장 결제(즉시 확정). **온라인 카드결제는 의도적으로 미구현** — 아래 "보류 중" 참고
- 환불 규정: 일자별 환불율 규칙(`refundRules`), 확정+무통장입금 건에만 적용
- 커스텀 질문 필드: text/textarea/email/select/multi/consent, 마케팅 수신 동의
- 알림톡/SMS 템플릿: 트리거별(확정/입금안내/대기등록/자리제안/변경/만료/취소/리마인드) 템플릿 + 변수 치환. **실제 발송 없음, DB 로그에만 기록** — 명시적 프로토타입 스코프
- QR 체크인: 확정 시 신청자 상태 페이지에 입장용 QR 생성 → 스태프가 스캔하면 `/admin/checkin/[appId]`에서 입장 처리
- 8단계 마법사(기본·방식 / 가격·정원 / 신청서 항목 / 신청 규칙 / 결제·환불 / 자동 알림 / 디자인 / 검토·게시)로 폼 생성
- CSV export (신청자 목록, 고객 DB)

### 2. 보안 수정
- **CSV 인젝션 방어**: 셀 값이 `=`, `+`, `-`, `@`, 탭/CR로 시작하면 앞에 `'`를 붙여 엑셀이 수식으로 해석하지 않도록 처리 (`lib/csv.ts`)

### 3. QR·공유 기능
- 관리자 대시보드에 신청 URL **공유하기**(Web Share API) / **링크 복사** / **QR 코드**(다운로드 가능한 SVG) 버튼 추가
- 확정된 신청자 행에 **QR 보기**(신청자 상태 페이지로 바로 이동), **QR 다시 보내기**(확정 알림 재발송 — 메시지가 유실됐을 때 대비) 버튼 추가

### 4. 로그인 · 멀티테넌시
- `lib/auth.ts`: 이메일+비밀번호 가입/로그인, scrypt 비밀번호 해싱, DB 세션 쿠키(`sessions` 테이블, 30일 만료)
- 새 테이블: `workspaces`, `users`, `sessions`, `workspace_settings`(워크스페이스별 시간이동 디버그 설정)
- `forms.workspace_id` 컬럼 추가 — 모든 운영자용 엔진 함수(`listForms`, `getDashboard`, `getWizard`, `getCheckin`, `getCheckinApp`, `exportRows`, `listCustomers`, `saveForm`, `publishForm`, `setFormStatus`, `createDraft`, `duplicateForm`, `manualRegister`, `confirmDeposit`, `operatorCancel`, `setCheckIn`, `resendCheckinLink`, `shiftClock`)가 `workspaceId`를 받아 소유권을 검증
- 신청자용 공개 액션(`applyToForm`, `claimOffer`, `changeItem`, `applicantCancel`, `getPublic`, `lookupApplications`)은 로그인 불필요 — 의도된 설계 (신청자는 계정이 없어도 신청 가능해야 함)
- `admin/layout.tsx`가 `/admin/**` 전체를 게이트(비로그인 시 `/login` 리다이렉트). Route Handler(export API)는 layout이 적용 안 되므로 각 핸들러에서 개별적으로 세션 체크
- 가입 시 워크스페이스별 예시 폼 4종 자동 시딩(slug는 워크스페이스 접미사로 전역 유일성 보장)
- Playwright로 검증: 두 워크스페이스 독립 가입 → 서로의 폼 ID로 직접 접근 시 404 → 로그아웃 후 세션 무효화 확인 완료

## 보류/의도적 미구현

- **온라인 결제(토스페이먼츠) 연동**: 사용자 요청으로 보류. 계약 모델(① 각 운영자가 직접 PG 가맹점 계약 vs ② 노다가 대표 가맹점으로 플랫폼 정산)을 아직 결정하지 않음. 현재 방향: **①로 시작**, 결제 모듈을 인터페이스로 분리해 나중에 ②(토스 "플랫폼 정산" 상품 활용)로 전환 가능하게 설계. 법적 걸림돌(전자금융업 등록 여부)은 코드 문제가 아니므로 별도 트랙으로 검토 필요.
- **실제 알림톡/SMS 발송**: 카카오 비즈니스/문자 API 연동 필요. 현재는 로그 테이블에만 렌더링된 메시지를 남김.
### 5. 완전자유 HTML 모드 — Phase 1 구현 완료

아래 설계대로 구현됨:

- `types.ts`: `FormMode`('structured'|'custom_html'), `CustomHtml`(`source`, `html`, `lastScannedAt`) 추가. `FormRecord.mode`/`customHtml` 필드로 노출
- `db.ts`: `forms.mode`, `forms.custom_html` 컬럼 추가 (기본값 `'structured'` / 빈 HTML)
- `lib/htmlScan.ts` (신규): `node-html-parser`로 정적 HTML을 파싱해 `name="f_<id>"` 규약을 따르는 `<input>/<select>/<textarea>`를 스캔 → `FieldDef[]`로 변환. 체크박스 그룹(같은 name 여러 개)은 자동으로 multi-select로 인식. `mergeScannedFields()`가 기존 `questions.fields`와 병합 — 이미 있던 필드는 라벨/필수여부 등 운영자가 편집한 내용을 유지하고, 새 필드만 추가, 스캔에서 사라진 필드는 목록에서 빠짐(과거 응답에는 남음)
- `lib/sanitizeHtml.ts` (신규): `sanitize-html`로 `<script>`, 이벤트 핸들러 속성, `javascript:` URL, 중첩 `<form>` 태그를 제거. 저장 시(서버) 항상 재적용되므로 클라이언트를 우회해도 안전
- 스캔은 기존 `Questions.fields`에 직접 병합되므로 **CSV export, 응답 조회, 3단계(신청서 항목) 편집 UI를 그대로 재사용** — 별도 필드 저장소를 만들지 않음(설계 문서 대비 단순화한 부분)
- 마법사 7단계(디자인)에 "고정 디자인 / 커스텀 HTML" 토글 추가. 커스텀 HTML 선택 시: 붙여넣기·파일 업로드, "필드 스캔하기" 버튼(서버 액션 `scanCustomHtmlAction`), 스캔 결과 요약("신규 N개, 삭제 M개"), sandboxed iframe 미리보기
- v1 제약(설계대로): `offer.structure === 'simple'`일 때만 사용 가능 — 구조를 다른 값으로 바꾸면 자동으로 `structured` 모드로 되돌아감
- `publishChecks()`가 모드/HTML 유무를 검증 (`mode`, `customHtml` 인자 추가)
- 공개 신청 화면(`/f/[slug]`)은 `mode === 'custom_html'`일 때 `CustomApplyForm`이 sanitize된 HTML을 `<form action={applyAction}>` 안에 그대로 렌더링 — 기존 `f_` 접두사 파싱 로직(`applyAction`)은 변경 없이 재사용
- **Playwright로 종단 검증**: 폼 생성 → 커스텀 HTML 붙여넣기 → 스캔(신규 필드 2개 감지) → 3단계에 반영 확인 → 게시 → 공개 화면 렌더링 → 실제 신청 제출 → 확정 상태 페이지에 커스텀 답변 노출까지 전체 플로우 확인. 별도로 `<script>`/`onclick`/`onerror`/`javascript:` URL/중첩 `<form>`을 주입한 악성 HTML로 재현 — 전부 제거되고 실행되지 않음을 확인

**Phase 2(GitHub 연동 자동 재스캔), Phase 3(rename 매핑)는 아직 미구현.**

### 6. 테마 갤러리 — 프리셋 카드 + 사용자 템플릿 업로드/공유/별점

"미리캔버스처럼 다양한 완성형 디자인을 갤러리에서 고르고, 직접 만든 것도 올릴 수 있게" 해달라는 요청으로 구현. 색상 프리셋 카드(이전 절)와는 별개로, **완성된 HTML 템플릿**을 통째로 갤러리에서 골라 쓰는 기능:

- `templates` 테이블(`workspace_id`(NULL이면 기본 제공), `name`, `html`, `visibility`('private'|'public'), `is_builtin`) + `template_ratings` 테이블(`template_id`, `workspace_id`, `stars`, PK 복합) 추가
- `lib/builtinTemplates.ts`: 서버 시작 시(`db.ts`의 `open()`) 한 번 실행되는 `ensureBuiltinTemplates()` — 미니멀/포토히어로/카드그리드/브루탈리스트/파스텔 5종의 완성형 디자인을 `is_builtin=true, visibility='public'`으로 시딩. 전부 인라인 스타일만 사용(`<style>` 태그는 sanitize 단계에서 제거되므로)
- `lib/templates.ts`: `listTemplates(workspaceId)`가 기본/커뮤니티(내가 아닌 남의 공개 템플릿, 평점 높은 순)/내 템플릿 세 그룹으로 분류해 반환. `saveTemplate`, `setTemplateVisibility`, `deleteTemplate`(본인 것만), `rateTemplate`(워크스페이스당 1개, upsert)
- 마법사 디자인 단계(커스텀 HTML 모드)에 **"템플릿 갤러리"** 버튼(탭: 기본/커뮤니티/내 템플릿, 카드마다 sandboxed iframe 실시간 미리보기 + 별점 + "이 템플릿 쓰기") + **"내 템플릿으로 저장"** 버튼(이름 입력 + 공개 여부 체크박스) 추가
- **Playwright로 검증**: 워크스페이스 A가 기본 템플릿에 별점(5점) 매기고, 템플릿을 적용한 뒤 "공개"로 저장 → 워크스페이스 B가 가입해서 "커뮤니티" 탭에서 A의 템플릿을 확인(뜸) / "내 템플릿" 탭에서는 안 보임(격리 확인) — 전부 통과

**미구현/후속 과제**: 템플릿 검색·태그, 신고/모더레이션 정책, 평점 부정 방지(현재는 워크스페이스당 1표라 여러 워크스페이스를 만들어 도배하는 것을 막지 못함), 템플릿 미리보기 썸네일 캐싱(지금은 매번 iframe으로 라이브 렌더링).

## 브랜딩 (결정됨, 코드 적용은 미착수)

노다는 고객 브랜드 뒤에서 도는 인프라이므로 **브랜드가 튀지 않는 것**이 원칙. 색이 주장하면 고객이 자기 테마 색을 골랐을 때 충돌한다.

- **워드마크**: 한글 `노다.` → 영문 **`NODA.`** 로 변경 예정. 마침표는 유지(지금 마크에도 있음). 색이 거의 무채색이라 인지를 글자꼴이 짊어지므로 타이포 선정이 색보다 중요
- **아이덴티티 컬러**: `#18211F` (잉크 그래파이트, 미세한 그린 캐스트) — 로고·헤더
- **포인트 컬러**: `#3F6A5E` (머디 틸) — 확정 상태·주요 버튼·링크. 현행 `#0e6b5b`에서 채도를 낮춘 값. 흰 배경 대비비 약 6:1로 WCAG AA 통과
- **종이**: `#F3F6F4` (현행 유지)

**적용 시 필요한 작업**: 지금은 `--accent` 하나를 노다 UI와 고객이 고른 테마 색이 공유한다(`globals.css`의 `.pub-theme`가 `--brand` → `--accent`로 덮어씀). 브랜드 색과 고객 테마 색 토큰을 분리해야 한다 — 노다는 크롬(프레임), 고객 색은 그 안의 콘텐츠로 레이어를 나누는 구조. 워드마크는 `admin/layout.tsx`, `login/page.tsx`, `signup/page.tsx`의 `.brand` 마크업에 하드코딩되어 있다.

## 완전자유 HTML 모드 설계 (Phase 1 구현 시 참고한 원안)

### 배경

지금은 필드 위치·순서를 노다가 고정하고 색/로고/커버 이미지만 커스터마이징하는 "고정구조+테마" 방식(`StepDesign`, `Theme` 타입)만 있음. 에이전시/파워유저를 위해 **완전자유 HTML을 업로드하면 백엔드가 필드를 자동 스캔**하는 두 번째 모드를 추가한다. Netlify Forms가 정확히 이 방식(정적 마크업 스캔 + `name` 속성 기반 자동 감지)으로 이미 상용화한 선례가 있음.

### 데이터 모델

```ts
// types.ts에 추가
export type FormMode = 'structured' | 'custom_html'

export type CustomHtml = {
  source: 'paste' | 'upload' | 'github'
  html: string                  // 저장된 정적 HTML 원본 (sanitize 후)
  githubRepo: string | null     // 'owner/repo' (source === 'github'일 때만)
  githubPath: string | null     // 리포 내 html 파일 경로
  lastScannedAt: string | null
  fields: FieldDef[]            // 스캔 + 운영자 확인을 거친 필드 목록 (기존 FieldDef 재사용)
}

// FormRecord에 추가
mode: FormMode
customHtml: CustomHtml | null
```

기존 `Questions.fields`(FieldDef[])와 같은 타입을 재사용해서, 마법사의 3단계(신청서 항목)·CSV export·응답 조회 로직을 거의 그대로 재사용할 수 있게 한다.

### 제출 규약 (기존 코드와의 접점)

`app/actions.ts`의 `applyAction`은 이미 `f_` 접두사 규칙으로 커스텀 필드를 파싱하고 있다:

```ts
if (!key.startsWith('f_')) continue
answers[key.slice(2)] = ...
```

커스텀 HTML도 이 규약을 그대로 따르게 한다 — 즉 운영자(또는 에이전시)가 작성하는 `<form>`의 커스텀 입력은 `name="f_<fieldId>"`, 예약 필드(이름/전화번호/인원/항목/결제수단/마케팅동의/동반자)는 `name`, `phone`, `party`, `itemId`, `method`, `marketing`, `companion`을 그대로 쓰도록 문서화한다. **백엔드 제출 처리 로직은 변경이 필요 없다** — 스캔·확인 UI만 새로 만들면 됨.

### 필드 스캔 알고리즘

1. 서버에서 `node-html-parser` 같은 경량 파서로 정적 HTML을 파싱 (브라우저 DOM 불가, JS 실행 없음 — v1은 정적 마크업만 지원)
2. `<input>`, `<select>`, `<textarea>` 중 `name` 속성이 있는 요소를 수집
3. 예약 필드명(`name`, `phone`, `party`, `itemId`, `method`, `marketing`, `companion`)은 제외하고, `f_` 접두사 필드만 커스텀 필드 후보로 처리
4. 타입 추론: `type="email"` → email, `type="checkbox"`(단일) → consent, 같은 `name`의 체크박스 그룹 → multi, `<select>` → select, `<textarea>` → textarea, 그 외 `<input>` → text
5. 라벨: `<label for="id">` 매칭 → 없으면 인접 텍스트 → 없으면 필드명을 사람이 읽을 수 있게 변환
6. 필수 여부: `required` 속성 유무
7. 선택지: `<option value>` 또는 체크박스 그룹의 `value` 집합

### 재스캔 시 diff UI (중요)

필드 구성이 이미 저장된 응답(`applications.answers`)의 key와 연결돼 있으므로, HTML을 다시 업로드했을 때 **조용히 덮어쓰면 과거 응답이 유실되거나 잘못 매핑**될 수 있다. 그래서:

- 새로 발견된 필드 → "새 항목" 배지, 운영자가 타입/필수 여부 확인 후 저장
- 기존에 있었는데 이번 스캔에 없는 필드 → "삭제됨" 경고, 과거 응답은 보존하되 신규 신청서에는 노출 안 함
- `name`이 바뀐 경우 자동으로는 같은 필드로 인식하지 않음(삭제+신규로 처리) — v2에서 운영자가 수동으로 "기존 항목에 연결"할 수 있는 매핑 UI를 추가해 히스토리 보존 가능하게 함

이 diff 화면은 기존 `saveForm`이 "신청이 있는 항목은 삭제 불가"를 막는 것과 같은 철학 — **응답이 이미 쌓인 상태에서의 스키마 변경은 항상 확인 절차를 거친다.**

### 렌더링 파이프라인

- `mode === 'custom_html'`인 폼은 `/f/[slug]/page.tsx`에서 기존 `<ApplyForm>` 대신 저장된 HTML을 그대로 렌더링
- v1 범위 제한: `structure: 'simple'`(단일 항목)만 지원 — 시간대/권종별 동적 목록을 임의 HTML 안에 넣는 것은 복잡도가 커서 v2로 미룸
- 결제 방법 UI, 조건부 로직(Logic Jump)은 기존 마법사(신청 규칙/결제·환불 단계)에서 그대로 설정 — 커스텀 HTML 모드는 **디자인 단계만 대체**하고 비즈니스 규칙 엔진은 공유한다

### 보안: HTML sanitize

운영자가 업로드한 HTML은 익명 신청자의 브라우저에서 실행된다. 저장 전 `sanitize-html` 등으로 `<script>` 태그, 인라인 이벤트 핸들러(`onclick` 등), `javascript:` URL을 제거해야 한다. 세션 쿠키는 이미 `httpOnly`라 `document.cookie`로 탈취는 안 되지만, 피싱/방문자 대상 악성 스크립트 삽입 리스크는 남아있으므로 화이트리스트 기반 sanitize가 필수.

### 구현 단계 제안

1. **Phase 1** (핵심): 붙여넣기/파일 업로드로 HTML 등록 → 정적 스캔 → 운영자 확인 UI → sanitize → 렌더링 전환 → 재저장 시 diff 확인
2. **Phase 2**: GitHub 리포 연결(공개 리포 또는 최소 권한 GitHub App) + 웹훅으로 자동 재스캔
3. **Phase 3**: 필드 rename 매핑 UX, JS 렌더링 폼 대응 검토(정적 스캔의 근본적 한계라 우선순위 낮음)

## 다음 우선순위 후보 (미결정, 사용자 확인 필요)

1. ~~완전자유 HTML 모드 Phase 1~~ — 완료. Phase 2(GitHub 연동), Phase 3(rename 매핑)는 미착수
2. 결제 계약 모델 확정 후 토스페이먼츠 연동
3. 요금제(무료/유료 경계) 설계 — 과금은 프론트엔드 방식과 무관하게 백엔드 사용량(제출 건수, SMS 발송량, 커스텀 도메인 등) 기준으로 하기로 논의됨
4. 실 발송 연동 (알림톡/SMS)
5. PGlite → 실 Postgres(Neon/Supabase 등) 이전 — 멀티 프로세스/서버리스 스케일 시 필요
