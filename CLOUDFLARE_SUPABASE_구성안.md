# SHMS Supabase + Cloudflare 운영 구성안

작성일: 2026-08-13

## 결론

Supabase 하나로도 초기 운영은 가능하지만, 첨부파일까지 Supabase Storage에 집중하면 저장용량과 egress가 먼저 증가합니다. 이 앱은 아래처럼 역할을 나누는 것이 적합합니다.

| 계층 | 서비스 | 저장 내용 |
|---|---|---|
| 정적 화면 | 현 GitHub Pages 유지 또는 Cloudflare Pages | HTML/CSS/JS |
| 사용자 인증 | Supabase Auth | 사용자 세션과 JWT |
| 업무 데이터 | Supabase Postgres + RLS | 이행기록, 문서, 점검, CAPA, 첨부 메타데이터 |
| 첨부파일 API | Cloudflare Worker | JWT 검증, 업로드·열람·삭제 |
| 파일 본문 | Cloudflare R2 | PDF, Office 문서, 사진, 압축파일 |
| 선택적 접속 전단 | Cloudflare Access | 50명 이하 내부 사용자일 때 사이트 입구 보호 |

GitHub Pages의 정적 파일 제공은 Supabase 사용량을 발생시키지 않으므로, 단순히 부하를 줄이기 위해 Cloudflare Pages로 옮길 필요는 없습니다. Cloudflare Access나 자체 도메인이 필요할 때 이전을 검토합니다.

## 2026-08-13 공식 한도 기준

- Supabase Free: 데이터베이스 500MB, 파일 저장 1GB, egress 5GB(별도 cached egress 5GB), 비활성 프로젝트 일시정지 가능
- Supabase Pro: 월 25달러부터, DB 8GB, 파일 저장 100GB, egress 250GB 포함
- Cloudflare R2 Standard 무료 구간: 월 10GB, Class A 100만 회, Class B 1,000만 회, 인터넷 egress 무료
- Cloudflare Workers Free: 하루 100,000 요청, 호출당 CPU 10ms
- Cloudflare Access Free: 50명 이하, 초과 시 Pay-as-you-go는 사용자당 월 7달러

공식 문서:

- Supabase billing: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase pricing: https://supabase.com/pricing
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Zero Trust pricing: https://www.cloudflare.com/plans/zero-trust-services/

## 적용 순서

1. Supabase Auth를 공용 비밀번호 게이트 대신 실제 로그인 세션 방식으로 전환
2. `shms_profiles` 역할과 RLS를 연결하고 읽기·쓰기 권한 검증
3. `supabase/schema.sql`의 신규 수기 필드와 `attachments jsonb` 마이그레이션 실행
4. Cloudflare R2 버킷 및 `cloudflare/attachment-worker` 배포
5. `config.js`에 Supabase 공개키와 Worker URL 입력
6. 두 계정으로 로그인해 업로드·다른 PC 열람·삭제 권한·JSON 백업을 검증

## 비용과 부하 관리 원칙

- 목록 화면에는 첨부 메타데이터만 조회하고 파일 본문은 사용자가 `보기`를 누를 때만 R2에서 전송
- 사진(JPG·PNG·WebP)은 브라우저에서 WebP로 변환하며 1,280px부터 품질과 해상도를 단계적으로 낮춰 1장당 50KB 미만으로 만든 뒤 저장. 위험성평가 앱 기준을 따라 최소 긴 변 560px·최저 품질 0.42를 보호선으로 유지
- 사진은 압축 후 최대 50KB, PDF·Office·한글·ZIP은 10MB로 앱과 Worker 양쪽에서 제한
- 같은 파일은 한 이행항목 안에서 SHA-256으로 중복 등록을 차단
- 동일 파일 중복 업로드 방지와 보존기한 정책은 실제 운영 자료량을 본 후 추가
- Cloudflare Worker는 파일 API에만 사용하고, 모든 Supabase 쿼리를 불필요하게 프록시하지 않음
- R2와 Supabase 사용량 알림을 각각 설정하고 월 1회 백업 검증
