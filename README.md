# 온리원에듀 · 개인 단어 스케줄표 (winter-voca)

Supabase Auth + 관리자 전용 RLS + 학생별 읽기 전용 링크가 적용된 운영용 웹앱입니다. GitHub Pages에 정적 배포됩니다.

## 화면
- `#/login`: 관리자 이메일·비밀번호 로그인
- `#/reset`: 비밀번호 재설정 링크 발송
- `#/admin`: 등록된 관리자만 접근 가능한 학생/스케줄 관리
- `#/student/<64자리 토큰>`: 해당 학생의 월별 일정표만 조회 가능, 읽기 전용
- 관리자는 학생 생성·검색·정보 수정·활성화 전환·개인 링크 복사/재발급 가능
- 관리자 일정: 자동 DAY 배정(월~일 선택, 횟수, 시작 날짜, 시작 범위), 직접 추가, 완료 체크, 수정, 삭제, 월 이동, 월별 인쇄
- 학생 화면: 학년/학교, 월별 일정, 완료 표시, 달 이동, 인쇄
- 자동 생성은 **기존 일정 삭제 없이 추가**됩니다. 같은 날짜/책/단원 중복은 클라이언트가 사전 차단합니다.

## Supabase 데이터
- `admins`: 관리자 UUID (자가 승인 불가)
- `students`: 학생 이름/학교/학년/활성화 상태/강한 개인 토큰
- `schedules`: 학생별 날짜/책/단원/표시 범위/완료 여부
- `vocab_categories`, `vocab_units`: 다섯 단어장 / 230분류
- 학생 이름·학교, 관리 토큰은 **GitHub 코드에 저장하지 않습니다.**
- `students`, `schedules`는 인증된 관리자만 조회·수정 가능 (RLS)
- 학생 전용 공개 API는 Supabase Edge Function `student-schedule`이며 64자리 개인 토큰을 검증해 해당 학생의 정보만 반환합니다. 링크를 알면 누구나 해당 학생의 정보에 접근할 수 있으므로 **링크를 비공개로 전달하세요.**

## 백업/복구
기존 관리자 UI는 `backup/pre-schedule-merge-2026-11-11` Git 브랜치에 보관했습니다.
저장소 주소: https://github.com/sashimigongju/winter-voca/tree/backup/pre-schedule-merge-2026-11-11

## 배포
GitHub repository Settings → Pages → Build and deployment → Source: GitHub Actions.
`.github/workflows/static.yml`에서 main 변경 시 자동 배포.
예상 URL: https://sashimigongju.github.io/winter-voca/

Supabase Authentication → URL Configuration에서 Site URL과 Redirect URLs에 실제 배포 주소를 등록하세요.
`https://sashimigongju.github.io/winter-voca/**`

## 운영 안내
- 관리자 계정은 Authentication → Users에서 생성 후 `public.admins`에 별도 등록합니다.
- 학생 정보는 관리자 화면의 **새 학생 등록**에서 입력합니다.
- 실명 데이터는 확인되지 않은 기존 시안의 샘플 18명을 자동 이관하지 않았습니다.
- 원래 ZIP 원본은 현재 접근 제한으로 열 수 없어서 2026-11-11에 저장된 관리자/학생 시안과 DB 스키마를 기준으로 주요 기능을 재구현했습니다. 원본 UI 픽셀 단위 일치와 모든 세부 기능의 1:1 대조는 추후 원본이 접근 가능할 때 확인해야 합니다.

## 보안
Supabase publishable key만 브라우저에 저장하고, service role/secret key는 Supabase 함수 환경에만 유지합니다. 각 테이블의 권한 검사는 Supabase RLS가 수행합니다. 개인 링크 재발급은 이전 링크를 즉시 무효화합니다.

## 무료 관리자 명령 도우미

관리자 `#/admin` 우측 아래 **일정 도우미** 버튼에서 사용합니다. **별도 AI 계정 또는 OpenAI API 키가 필요하지 않습니다.** Supabase Edge Function에서 규칙 기반으로 한국어 명령을 분석하므로 OpenAI API 사용료는 없습니다(호스팅 서비스 무료 사용량 한도는 별도).

가능한 명령 예시:
- `신도중 학생 명단 보여줘`
- `최세영 11월 일정 알려줘`
- `등록된 단어장 목록 보여줘`
- `능률 라이트 단원 목록 보여줘`
- `신도중 최세영 11월 16일 결석, 그날 이후 일정 밀어줘`
- `김채원 능률 라이트 DAY 10부터 11월 16일 5회 배정해줘`
- `김서윤 11월 17일 완료 처리해줘`
- `능률 라이트 이름을 새 이름으로 변경해줘`

**변경은 자동 저장되지 않습니다.** 일정 이동/배정/완료 처리/단어장·단원 이름 변경 명령은 먼저 작업 미리보기를 표시하고, 관리자 버튼으로 별도 승인해야 적용됩니다. 15분 뒤에는 변경안이 만료되며, 이미 적용된 변경안은 재실행할 수 없습니다.

**학생 조회 링크는 절대 관리자 명령 도구에 접근할 수 없습니다.** 학생용 `student-schedule` Edge Function은 GET만 허용하고, 개인 토큰으로 매칭된 학생의 일정 데이터만 읽으며, POST/PATCH/DELETE를 허용하지 않습니다. 관리자용 `admin-ai`는 Supabase Auth JWT를 서버에서 검증하고 `admins` 등록 계정만 처리합니다. 일정 변경 RPC도 별도 관리자 권한을 검증합니다. GitHub Pages의 화면 숨김이 보안이 아니라 데이터베이스 RLS/서버 검사가 실제 접근 제어를 제공합니다.

이 도우미는 **생성형 AI가 아닌 무료 규칙 기반 명령 처리기**입니다. 지원하지 않는 표현은 자동 추측해 실행하지 않고 예시 명령으로 재입력하도록 안내합니다.
