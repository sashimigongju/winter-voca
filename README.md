# Winter Voca — 관리자 인증 및 보호 페이지

Supabase Auth와 데이터베이스 RLS를 이용한 온리원에듀 단어 학습 관리자 진입점입니다.

## 보안 모델
- `#/login`: 이메일/비밀번호 로그인
- `#/reset`: 이메일 비밀번호 재설정
- `#/update-password`: 재설정 링크에서 새 비밀번호 설정
- `#/admin`: **서버에서 확인한 로그인 계정 + public.admins 관리자 등록** 모두 필요
- `students`, `schedules`, `vocab_categories`, `vocab_units`: Supabase RLS를 통해 관리자만 접근
- 프런트엔드에서 관리자를 자가 등록할 수 없습니다.

## 관리자 최초 등록
1. Supabase Dashboard > Authentication > Users에서 본인 관리자 계정 생성
2. SQL Editor에서 **아래 SQL 한 개만** 실행 (이메일 주소 변경):

```sql
insert into public.admins (id)
select id from auth.users
where email = 'YOUR_ADMIN_EMAIL@example.com'
on conflict (id) do nothing;
```

3. GitHub Pages URL의 `#/login`에서 로그인합니다.

## 배포
`index.html`, `app.js`, `style.css`는 빌드가 필요 없는 정적 파일입니다.
GitHub > Settings > Pages > Build and deployment 에서 **GitHub Actions**를 선택합니다.
`.github/workflows/pages.yml`에서 main 브랜치 푸시 시 정적 앱을 배포합니다.

## Supabase Dashboard 설정
Authentication > URL Configuration 에서 **Site URL**을 실제 GitHub Pages 배포 URL로 설정하고,
**Redirect URLs**에 `https://sashimigongju.github.io/winter-voca/**`를 추가하세요.
재설정 이메일 링크가 올바른 배포 URL로 돌아오려면 이 설정이 필요합니다.

## 기존 프로젝트 연결
이 저장소는 기본 인증과 관리자 전용 학생 목록만 구축한 시작점입니다.
기존 단어 스케줄 생성/학생용 공개 링크 전체 화면을 아직 이 저장소에 병합하지 않았습니다.
특히 `public_token`은 단지 추측하기 어려운 값일 뿐, 그 자체로 익명 API 권한을 주지 않습니다.
학생용 페이지가 필요하면 별도 서버/Edge Function에서 검증된 토큰으로 접근 범위를 제한하세요.

브라우저에 포함한 Supabase publishable key는 공개용 키입니다. **service role/secret key를 절대로 공개하지 마세요.**
