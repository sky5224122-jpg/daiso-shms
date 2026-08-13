# SHMS Cloudflare R2 첨부파일 Worker

Supabase Auth가 발급한 JWT를 검증한 뒤 Cloudflare R2에 첨부파일을 저장·열람·삭제하는 API입니다.

## 역할

- `POST /files`: 사진은 앱에서 자동 축소·압축된 뒤 최대 5MB, 문서는 최대 10MB로 R2에 저장
- `GET /files/{key}`: 인증된 사용자가 파일 열람
- `DELETE /files/{key}`: 업로드한 본인의 파일 삭제
- R2 비밀키나 Supabase `service_role` 키를 브라우저에 노출하지 않음

## 배포 전 준비

1. Cloudflare에서 R2 버킷 `daiso-shms-files`를 생성합니다.
2. `wrangler.toml.example`을 `wrangler.toml`로 복사하고 `SUPABASE_URL`, `APP_ORIGIN`, 버킷명을 실제 값으로 바꿉니다.
3. Supabase Auth의 JWT 서명 키는 RS256 또는 ES256 비대칭 키를 사용합니다.
4. 아래 명령으로 의존성을 설치하고 배포합니다.

```powershell
npm install
npm run deploy
```

5. 배포된 Worker URL을 프로젝트 `config.js`의 `window.SHMS_ATTACHMENT_API.url`에 입력합니다.

## 주의

- 현재 앱의 공용 비밀번호 게이트는 Supabase Auth 세션을 만들지 않으므로 Worker 배포만으로는 클라우드 첨부가 활성화되지 않습니다.
- Supabase Auth 로그인과 `shms_profiles` 역할/RLS 연결을 완료한 뒤 R2 모드를 사용해야 합니다.
- 로컬 모드에서 등록한 파일 본문은 현재 브라우저 IndexedDB에만 있으며 JSON 백업에는 첨부 메타데이터만 포함됩니다.
- 동일 파일은 같은 이행항목 안에서 중복 등록되지 않으며, Worker는 SHA-256 기반 키를 사용합니다.
