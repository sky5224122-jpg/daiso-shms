/* ============================================================
   config.js — 배포 환경 Supabase 설정 (선택)
   ------------------------------------------------------------
   · 이 파일을 채워 두면 사용자가 [설정] 화면에서 키를 입력하지 않아도
     앱이 자동으로 Supabase에 연결됩니다.
   · anon key는 공개되어도 되는 키입니다. 실제 접근 통제는
     Supabase의 RLS(행 수준 보안) 정책이 수행합니다.
   · service_role 키는 절대 이 파일에 넣지 마십시오.
   · localStorage 설정([설정] 화면 입력값)이 이 파일보다 우선합니다.
   ============================================================ */

window.SHMS_SUPABASE = {
  url: 'https://zjnjbvkbxzpxtswqzoau.supabase.co',
  anonKey: 'sb_publishable_T0loyctj480POqvxD7a7HQ_pG1b_sOw'
};

/* Cloudflare Worker 첨부파일 API (선택)
   · 미설정 시 파일은 현재 브라우저 IndexedDB에만 저장됩니다.
   · Worker에는 R2 버킷을 바인딩하고 Supabase JWT 검증을 적용합니다.
   · R2 API 토큰이나 비밀키를 이 파일에 넣지 마십시오. */
window.SHMS_ATTACHMENT_API = {
  url: 'https://YOUR-WORKER.workers.dev'
};
