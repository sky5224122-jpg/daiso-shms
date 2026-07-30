# 안전보건관리체계 이행 관리 시스템 (SHMS) — AI 작업 지침

> 이 문서는 다음 작업자(사람 또는 AI)가 반드시 먼저 읽어야 하는 규칙입니다.
> 「6. 매장 비상대응훈련 앱」의 `작업규칙_필수준수사항_20260722.md`를 계승합니다.

## 0. 시작 전 확인 순서

1. 이 문서(`CLAUDE.md`) 읽기
2. `작업인수인계.md` 최신 하단 읽기
3. `README.md`의 파일 구조 확인
4. 로컬 서버 기동 후 화면이 정상적으로 뜨는지 확인
5. 작업 범위가 **이 앱(7번 폴더)** 인지 확인 — 다른 앱으로 범위를 옮기지 않는다

## 1. 절대 원칙 (위반 금지)

1. **수정 전 체크포인트 커밋** — 파일 수정 전 반드시 `git commit`으로 현재 상태 저장
2. **한 번에 하나만** — 요청된 기능 하나만 수정. 주변 정리·리팩터 금지
3. **배포 전 변경 내용 보고** — 변경 목록을 사용자에게 보여주고 확인 후 배포
4. **영향 범위 먼저 확인** — 함수 수정 전 호출 위치를 Grep으로 먼저 검색
5. **사용자 자료를 임의로 삭제하지 않는다**
6. **테스트하지 않은 배포를 "완료"라고 쓰지 않는다**

## 2. 파일별 역할 (실제 수정 대상)

| 파일 | 역할 | 수정 시 주의 |
|---|---|---|
| `js/data/frameworks.js` | ★ 법령·ISO·문서체계 마스터 데이터 | 조항 `id`를 바꾸면 **기존 이행기록이 끊어진다.** 절대 변경 금지 |
| `js/core.js` | 유틸·설정·데이터 계층·인증 | `saveRecord`/`saveRow` 수정 전 호출처 전수 확인 |
| `js/views-core.js` | 대시보드·법령/ISO 목록·작성 드로어 | `openDrawer`는 views-ext에서도 사용 |
| `js/views-ext.js` | 문서·점검·CAPA·증빙·조직·심사대응·설정 | 각 `bindXxxEvents`는 화면 노드에 리스너 등록 |
| `js/app.js` | 셸·라우팅·로그인 | `route()`는 매번 `#view` 노드를 새로 만든다 (리스너 중복 방지) |
| `css/style.css` | 디자인 시스템 전체 | CSS 변수(`:root`)를 먼저 확인하고 사용 |
| `supabase/schema.sql` | 테이블·RLS | 컬럼 추가 시 `core.js`의 저장 객체도 함께 수정 |

## 3. 데이터 구조 규칙

### 이행기록 키
```
shms_records 의 PK = (item_id, half)
  item_id : MSSA-4-3 / OSHA-036 / ISO-6.1.2  ← frameworks.js 의 id
  half    : 2026-H2                          ← 반기 단위로 이력이 누적된다
```
반기가 바뀌면 **새 레코드가 생성**되며 이전 반기 기록은 그대로 보존됩니다.
이것이 "반기 1회 이상 점검" 의무의 이력 증빙 구조입니다.

### 저장 흐름
```
saveRecord() → ① state.records 갱신 → ② localStorage 저장 → ③ Supabase upsert
```
③이 실패해도 ①②는 유지되며, 화면에 "로컬 저장됨 · 동기화 실패" 토스트가 뜹니다.
**동기화 실패를 성공이라고 표시하지 않습니다.**

## 4. 캐시버스트 규칙

`index.html`의 버전 문자열을 수정할 때마다 변경합니다.

```html
<link rel="stylesheet" href="css/style.css?v=YYYYMMDD_설명">
<script type="module" src="js/app.js?v=YYYYMMDD_설명"></script>
```

> `js/app.js`만 캐시버스트해도 `core.js` 등 하위 모듈은 갱신되지 않습니다.
> 하위 모듈을 고쳤으면 **import 경로에도 쿼리를 붙이거나**, 배포 후 강력 새로고침(Ctrl+F5)으로 확인하십시오.

## 5. 배포

```bash
git add -A
git commit -m "작업 내용"
git push
```

`main` 브랜치 push → GitHub Actions → GitHub Pages 자동 배포.
배포 후 **운영 URL에서 실제로 변경 내용이 내려오는지 반드시 확인**합니다.

배포 전 검사:
```bash
node --check js/app.js
node --check js/core.js
node --check js/views-core.js
node --check js/views-ext.js
node --check js/data/frameworks.js
```

## 6. 권한 처리

- 화면 편집 권한 판정: `canEdit()` — `role`이 `master|safety|head`인 경우만 true
- **화면의 버튼 비활성화는 편의 기능일 뿐**이며, 실제 통제는 Supabase RLS의 `shms_can_edit()`가 수행
- 권한 로직을 바꿀 때는 `core.js`의 `canEdit()`와 `schema.sql`의 `shms_can_edit()`를 **함께** 수정

## 7. 절대 하면 안 되는 것

1. `frameworks.js`의 조항 `id` 변경 (기존 기록 유실)
2. Supabase 데이터를 확인 없이 일괄 수정·삭제
3. `service_role` 키를 `config.js`나 소스에 하드코딩
4. 사용자가 작성한 이행기록·문서 본문을 임의로 덮어쓰기
5. 로컬 백업 없이 대량 데이터 작업 실행
6. 화면에 깨진 한글이 보이는데 "문제없다"고 보고하기
7. 사용자 지시 없이 다른 앱(위험성평가·비상대응훈련) 폴더 수정

## 8. 작업 후 기록

작업이 끝나면 `작업인수인계.md` 하단에 아래 형식으로 추가합니다.

```
### YYYY-MM-DD 작업내용
- 수정한 파일:
- 수정한 기능:
- 건드리지 않은 기능:
- 테스트한 항목 / 결과:
- 확인하지 못한 것:
- 다음 작업자가 봐야 할 것:
```

**허위로 "완료"라고 쓰지 않습니다. 확인하지 못한 것은 확인하지 못했다고 씁니다.**
