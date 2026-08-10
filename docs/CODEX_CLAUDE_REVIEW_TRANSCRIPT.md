# Claude ↔ Codex 대화 기록 — plan-order-staff

- Codex 세션 id: `019fea2d-ec68-7392-a901-2d80a8147bff`
- 01턴 설정: gpt-5.6-sol / reasoning high / sandbox read-only / tokens 170,489
- 02턴 설정: gpt-5.6-sol / reasoning high / sandbox read-only / tokens 208,883
- 03턴 설정: gpt-5.6-sol / reasoning high / sandbox workspace-write [workdir, /tmp, $TMPDIR] / tokens 280,279


---

## 라운드 01 · Claude →

# Claude → Codex 설계 검토 라운드 1

너(Codex)가 작성한 `docs/PLAN_ORDER_STAFF_ACCOUNTS_AND_ASSIGNMENT.md` 를 Claude가 코드·운영 DB와 대조 검토했다.

이건 승패를 가리는 게 아니라, 대표님이 승인해도 되는 수준까지 문서를 끌어올리는 공동 작업이다.

지금 단계에서 **코드·DB·문서를 수정하지 마라.** 읽기와 논증만 한다.

## 내가 확인한 사실 (직접 확인 권장)

운영 DB(Supabase `obxekwyolrmipwmffhwq`)를 조회하고 레포 코드를 읽어 아래를 확인했다.

1. `auth.users` 에 `on_auth_user_created` → `handle_new_user()` 트리거가 있고, **`role`을 `'customer'` 로 하드코딩해 `profiles` 행을 자동 INSERT** 한다. 게다가 `EXCEPTION WHEN others THEN RAISE WARNING; RETURN NEW` 로 **예외를 삼킨다**.
2. `orders.id` 의 타입은 `uuid` 가 아니라 **`text`** 다.
3. `orders.salesman_id` 는 `uuid` 이고 `profiles` 가 아니라 **`salesman_profiles`** 를 참조한다 (`app/api/admin/orders/route.ts:56` 의 `attributed_salesman:salesman_profiles!salesman_id`).
4. `GET /api/admin/orders` 에는 **페이지네이션이 전혀 없다** (`range`/`limit` 없음). `components/OrdersTab.tsx:125` 가 SWR로 전체(현재 398건)를 한 번에 받는다.
5. `factory` 역할도 `/orders` 라우트에 접근한다 (`hooks/useAdminAuth.ts:16`) 그리고 주문 API도 `isBackofficeOperatorRole` 로 통과시킨다.
6. `orders` 에 `parent_order_id` 가 있고 API가 `parentOrderId` 조회를 지원한다(차액/추가금 자식 주문).
7. public 스키마에서 RLS 비활성 테이블은 정확히 `cobuy_sessions`, `cobuy_participants` 두 개다 (문서 §21 정확).
8. 현재 orders 398건, profiles 495건(문서엔 494), role 분포 admin 6 / super_admin 2 / factory 7 / marketing_manager 1 / customer 479.
9. `mh@modoo.co.kr`, `yh@modoo.co.kr` 는 `auth.users` 에 없다(문서 §4.1 정확).

## 내가 제기하는 지적 (각각 동의/반박해 달라)

**A. §7.1 "profiles 행을 만들거나" 는 틀렸다.**
트리거가 이미 `role='customer'` 로 행을 만들기 때문에 INSERT는 PK 충돌로 실패한다.
반드시 UPDATE 여야 하고, 정확한 선례가 이미 레포에 있다: `app/api/admin/factory-accounts/route.ts:92-103`.

**B. 트리거가 예외를 삼키므로 §7.1 의 보상 절차 발동 조건이 부실하다.**
프로필 생성이 실패해도 auth 유저는 성공으로 남는다.
그러면 후속 UPDATE 는 "에러 없이 0행"이 될 수 있어 단순 error 체크로는 보상이 안 돈다.

**C. `GET /api/admin/order-assignments?order_ids=...` (§11.1) 는 실패한다.**
주문 목록이 페이지네이션 없이 398건 전체를 받고 `order_id` 가 text(약 36자)라서, 쿼리스트링이 ~15KB가 되어 Node 기본 헤더 한도에 부딪힌다. 주문이 늘면 431이다.

**D. `version` 낙관적 잠금(§8.2)과 `claim`(§9.3)이 서로 안 맞는다.**
미배정 주문은 배정 행 자체가 없어 비교할 version이 없다.
게다가 §8.2가 "해제 시 행 삭제 대신 `assignee_profile_id = null`" 을 권장하므로, claim 경로가 (a) 행 없음 → INSERT ON CONFLICT DO NOTHING, (b) null 행 있음 → 조건부 UPDATE 두 갈래로 갈린다. 문서엔 이 분기가 없다.

**E. §9 가 `factory` 역할을 아예 언급하지 않는다.**
공장 계정도 같은 `/orders` 화면을 쓰므로 담당자 컬럼·배정 버튼이 공장 계정에 노출된다.

**F. 자식(차액) 주문이 미배정 뷰를 오염시킨다.**
§16이 상속을 1차 제외로 넘겼는데, 그러면 추가금 주문이 전부 미배정으로 업무함에 쌓인다.

**G. §13 단계5 "기능 플래그를 제한된 관리자 세션에서 먼저 활성화" 는 모순이다.**
플래그 메커니즘 자체가 문서에 정의돼 있지 않고, 환경변수 플래그로는 사용자별 부분 활성화가 불가능하다.

**H. §8.3 의 담당자 이름 스냅샷은 "필요하면"이 아니라 필수여야 한다.**
프로필 FK가 `ON DELETE SET NULL` 이라 계정 삭제 시 이력에서 담당자가 소실된다.

**I. 단순화 제안.** `is_active` 와 `can_receive_orders`(§8.1)는 설명상 효과가 동일하니 하나로 합쳐라. `PUT [orderId]` 와 `POST claim`(§11.1)은 사실상 같은 동작이니 API 하나로 합칠 수 있다.

## 내가 확신하지 못하는 것 (네 판단을 듣고 싶다)

1. §8.2 가 전제하는 "슈퍼관리자 주문 삭제 경로"가 실제 코드에 존재하는가? 나는 확인하지 못했다.
2. `admin_staff_members` 테이블이 현 규모(직원 2명)에서 정당한가, 아니면 `profiles` 불리언 하나가 맞나? 나는 admin 6 + super_admin 2 가 이미 있어서 테이블이 정당하다고 봤는데, 반론이 있으면 달라.
3. 배정+이력을 원자적으로 처리하는 DB 함수(§11.3)를 이 레포에서 어떻게 호출할 계획인가? RPC를 service-role로 부르는 기존 선례가 있나?

## 답변 형식

각 항목을 이렇게 답해라.

- `A. 동의` / `A. 반박: <근거>` / `A. 부분동의: <어디까지>`
- 반박할 땐 반드시 **파일:줄 또는 SQL 근거**를 대라. 추측이면 "추측"이라고 명시해라.
- 마지막에 `## 내가 새로 발견한 것` 섹션을 두고, 내가 놓친 위험을 파일:줄 근거와 함께 적어라.
- 마지막에 `## 합의 못 한 항목` 섹션으로 남은 쟁점만 나열해라.

간결하게. 동의하는 항목은 한 줄이면 충분하다.

## 라운드 01 · Codex →

코드와 마이그레이션은 직접 확인했고, 운영 DB 상세 SQL 재조회는 호출이 취소되어 제공된 DB 조회 결과를 전제로 판단했다.

- `A. 동의` — 프로필은 INSERT가 아니라 UPDATE해야 하며 기존 선례는 [factory-accounts/route.ts:92](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/factory-accounts/route.ts:92)다.
- `B. 부분동의` — 위험은 맞지만 UPDATE에 `.select(...).single()`을 붙이면 0행도 오류로 검출되므로 [factory-accounts/route.ts:94](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/factory-accounts/route.ts:94)처럼 영향 행을 반드시 검증한다고 명시하면 된다.
- `C. 부분동의` — 무제한 `order_ids` GET은 실패하지만 운영 Vercel에서는 14KB URL 제한으로 `414 URL_TOO_LONG`이 먼저 날 가능성이 높고, 근거는 [orders/route.ts:58](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/orders/route.ts:58), [OrdersTab.tsx:115](C:/Users/tkay/Desktop/dev/modoo_admin/components/OrdersTab.tsx:115), [Vercel 공식 제한](https://vercel.com/docs/errors/url_too_long)이다.
- `D. 동의` — 행 없음과 `assignee_profile_id = null` 행을 모두 처리하는 원자적 UPSERT 조건과 버전 규칙이 문서에 필요하다.
- `E. 동의` — `factory`도 `/orders` 접근권한이 있고 [useAdminAuth.ts:16](C:/Users/tkay/Desktop/dev/modoo_admin/hooks/useAdminAuth.ts:16), API도 이를 허용한다([orders/route.ts:36](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/orders/route.ts:36)).
- `F. 동의` — 자동 상속을 제외하려면 최소한 `order_category='surcharge'`를 독립 미배정 건수에서 제외하거나 부모 담당자를 조회 시점에 상속해야 한다.
- `G. 동의` — 레포에는 이 기능을 사용자별로 활성화할 기존 플래그 메커니즘이 없으므로 서버 평가형 허용목록을 정의하거나 제한 세션 단계를 삭제해야 한다.
- `H. 동의` — 계정 삭제 뒤에도 감사를 보존하려면 이름 스냅샷은 필수다.
- `I. 부분동의` — 두 불리언은 1차 범위에서 하나로 합치는 데 동의하고 API 경로도 하나로 합칠 수 있지만, `claim`은 반드시 “현재 미배정일 때만 자신에게 배정”이라는 별도 원자적 전이로 남겨야 한다.

## 확신하지 못한 항목에 대한 판단

1. 슈퍼관리자 주문 삭제 경로는 실제로 존재하며, 권한 검사는 [orders/route.ts:737](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/orders/route.ts:737), 실제 삭제는 [orders/route.ts:823](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/orders/route.ts:823), UI 노출은 [OrdersTab.tsx:1593](C:/Users/tkay/Desktop/dev/modoo_admin/components/OrdersTab.tsx:1593)에 있다.
2. `admin_staff_members`는 유지하는 편이 맞으며, 관리자급 계정 8명 중 실제 배정 대상 2명만 명시적으로 구분하므로 `profiles`에 전역 운영 컬럼을 추가하는 것보다 경계가 명확하다.
3. 서비스 역할 RPC 선례는 `createAdminClient()` 후 `admin.rpc()`를 호출하는 [leads/staging/promote/route.ts:30](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/leads/staging/promote/route.ts:30)에 있다.
3. 신규 구현도 인증·역할 검증 후 `createAdminClient().rpc('set_order_staff_assignment', args)`로 호출하고, 함수는 기본 `SECURITY INVOKER`와 `service_role` 전용 EXECUTE 권한을 사용하는 편이 안전하다.

## 내가 새로 발견한 것

- 공장 계정 생성 선례는 UPDATE 방식만 참고해야 하며, 프로필 UPDATE 실패 시 생성된 Auth 사용자를 비활성화하지 않고 그대로 500을 반환한다([factory-accounts/route.ts:105](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/factory-accounts/route.ts:105)).
- 담당자 조회 API가 공통 `isBackofficeOperatorRole` 검사를 재사용하면 공장도 통과하므로, 현재 주문 API의 공장별 범위 제한([orders/route.ts:70](C:/Users/tkay/Desktop/dev/modoo_admin/app/api/admin/orders/route.ts:70))을 별도 API에도 적용하지 않으면 임의 주문 ID 조회로 정보가 노출될 수 있다.
- 이력 스냅샷은 담당자뿐 아니라 변경 실행자도 필수이며, 현재 계획의 `actor_profile_id`도 `ON DELETE SET NULL` 대상이라 실행자 이름이 함께 소실된다([계획서:231](C:/Users/tkay/Desktop/dev/modoo_admin/docs/PLAN_ORDER_STAFF_ACCOUNTS_AND_ASSIGNMENT.md:231)).
- 기존 서비스 역할 RPC 선례의 SQL은 “service-role only”라고 적었지만([lead_staging_pipeline.sql:47](C:/Users/tkay/Desktop/dev/modoo_admin/supabase/migrations/20260531_lead_staging_pipeline.sql:47)), 함수 생성부에는 명시적 `REVOKE/GRANT`가 없어([lead_staging_pipeline.sql:50](C:/Users/tkay/Desktop/dev/modoo_admin/supabase/migrations/20260531_lead_staging_pipeline.sql:50)) 신규 RPC가 이를 그대로 복사하면 권한 경계가 불명확해진다.

## 합의 못 한 항목

- `B`의 “UPDATE가 오류 없이 0행” 문제는 `.select().single()`로 확실히 검출할 수 있다.
- `C`의 구조적 실패에는 동의하지만 예상 운영 응답은 `431`보다 Vercel의 `414`가 더 정확하다.
- `I`에서 API 경로는 합쳐도 `claim`의 동시성 의미까지 일반 배정과 동일하게 취급할 수는 없다.
---

## 라운드 02 · Claude →

# Claude → Codex 라운드 2 (수렴)

네 반박을 코드·운영 DB로 재검증했다. 결과부터.

## 내가 수용하는 것

- **B: 네가 맞다.** `.select(...).single()` 이면 0행이 PGRST116 오류가 되므로 검출된다. 내 지적은 "UPDATE 결과를 검증하라"가 아니라 "`.single()` 을 쓰라"로 좁히는 게 정확하다.
- **C: 414가 더 정확하다.** 구조적 결론(파라미터 제거)은 유지하되 예상 응답 코드는 Vercel 414로 문서에 적자.
- **I: `claim` 의 원자적 전이는 분리 유지에 동의.** 경로는 하나로 합치되 `expected: unassigned` 의미는 별도 전이로 남긴다.
- 네가 새로 찾은 4건(공장 계정 생성 보상 누락 / 담당자 API의 공장 통과 / 실행자 이름 스냅샷 / RPC GRANT 부재) 전부 확인했고 동의한다.

RPC 권한 건은 근거를 더 붙인다.
`lead_classify_staging` 은 GRANT/REVOKE가 없어 PUBLIC EXECUTE 로 남는다(`supabase/migrations/20260531_lead_staging_pipeline.sql:50`).
반면 올바른 선례가 이미 레포에 있다 — `supabase/migrations/20260502120000_rls_super_admin_admin_parity.sql:19-21` 의 `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO ...` 패턴.
신규 RPC는 이 패턴을 따르고 `TO service_role` 만 부여하자.

## 내가 반박하는 것 — F의 술어가 틀렸다

`order_category='surcharge'` 는 **코드에는 있지만 운영 데이터에는 한 건도 없다.**

운영 DB 실측(2026-08-10):

| order_category | 건수 | parent_order_id 있는 건수 |
|---|---|---|
| `null` | 292 | 0 |
| `regular` | 93 | 0 |
| `quick` | 14 | 0 |

즉 `surcharge` 0건, `cobuy` 0건, `salesman_direct` 0건, `parent_order_id` 채워진 행 0건이다.

여기서 나오는 결론 두 개가 문서에 반드시 들어가야 한다.

1. **필터 술어는 `order_category` 가 아니라 `parent_order_id IS NOT NULL` 이어야 한다.** 카테고리 값은 `create/route.ts:472` 에서만 채워지는 신규 필드라 과거 주문 292건이 NULL이다.
2. **`order_category` 를 쓰는 모든 신규 필터는 NULL-safe 여야 한다.** 398건 중 292건(73%)이 NULL이므로 `order_category != 'surcharge'` 같은 조건은 NULL 행을 통째로 탈락시켜 업무함이 텅 빈다. 이건 F보다 심각한, 조용히 터지는 종류의 버그다.

동의하나?

## 남은 결정 3개 — 네 최종 입장을 달라

**결정 1. 담당자 API의 역할 게이트.**
네 지적대로 `isBackofficeOperatorRole` 를 재사용하면 공장이 통과한다.
공장별 범위 제한을 담당자 API에도 복제하는 것보다, **담당자 API 전체를 `isAdminLike` 로만 게이트**하고(공장 403), UI에서도 `isFactoryUser` 면 담당자 컬럼을 렌더하지 않는 쪽이 단순하고 누수 표면이 작다고 본다.
복제 대신 차단, 동의하나?

**결정 2. 기능 플래그.**
사용자별 부분 활성화(§13 단계5)를 유지하려면 서버 평가형 허용목록이 필요하고, 그건 사실상 `admin_staff_members` 등록 여부와 같은 집합이다.
그래서 **별도 플래그 메커니즘을 만들지 말고 "담당자 UI는 `admin_staff_members` 에 등록된 계정에게만 보인다" 를 그대로 게이트로 쓰자.**
전역 킬스위치는 환경변수 하나(`ORDER_ASSIGNMENT_ENABLED`)로 두고, 단계5의 "제한된 세션 먼저 활성화"는 삭제한다.
테이블을 게이트로 겸용하는 게 과한가?

**결정 3. 이력 스냅샷 범위.**
`assignee_name_snapshot`, `actor_name_snapshot` 두 컬럼을 `order_staff_assignment_events` 에 필수로 넣는다.
이걸로 §8.3의 FK 없는 설계 + `ON DELETE SET NULL` 조합이 감사 요건을 만족한다고 보나?

## 마지막 요청

위 3개 결정에 대한 네 입장을 정하고, 그다음 **`## 최종 변경 지시서`** 섹션을 써라.

형식은 `§섹션번호 — 무엇을 어떻게 고친다` 한 줄씩, 문서에 그대로 반영할 수 있는 수준으로.

새 쟁점은 정말 치명적인 것만. 이번 라운드로 수렴하는 게 목표다.

## 라운드 02 · Codex →

F는 동의한다.  
업무함의 루트 주문 조건은 `parent_order_id IS NULL`이어야 하며, `order_category` 조건이 필요하면 `IS DISTINCT FROM` 또는 명시적 NULL 분기를 사용해야 한다.

결정 1은 동의한다.  
담당자 API는 전부 `isAdminLike`로 제한하고 공장은 403 처리하며, 공장 UI에서는 담당자 기능을 렌더하지 않는 것이 가장 단순하다.

결정 2는 부분동의한다.  
별도 사용자별 플래그는 만들지 않되 UI 조건은 `ORDER_ASSIGNMENT_ENABLED && (활성 admin_staff_member || super_admin)`으로 해야 기존 슈퍼관리자의 감독 권한이 유지된다.  
API 권한은 `isAdminLike`, 직원 등록 여부는 UI 출시 대상과 배정 가능 대상이라는 서로 다른 조건으로 유지한다.

결정 3은 보강이 필요하다.  
단일 `assignee_name_snapshot`으로는 재배정 전후를 자체적으로 설명할 수 없으므로 `previous_assignee_name_snapshot`, `next_assignee_name_snapshot`, `actor_name_snapshot` 세 컬럼이 필요하다.  
이벤트의 세 profile ID는 외래키 없는 UUID 값으로 보존하고 이름 스냅샷을 함께 저장해야 계정 삭제 뒤에도 식별 가능한 감사 기록이 남는다.

## 최종 변경 지시서

§4.1 — 프로필 수를 495건으로 고치고 역할 분포와 `order_category`·`parent_order_id` 운영 실측값을 추가한다.

§4.3 — `orders.id`와 `parent_order_id`는 `text`, `salesman_id`는 `salesman_profiles`를 참조하는 `uuid`라고 명시한다.

§5.1·§7.1 — Auth 생성 후 트리거가 만든 프로필을 `.update(...).select(...).single()`로 갱신하고 실패 시 신규 Auth 사용자를 비활성화한다.

§5.2·§8.1 — `admin_staff_members`는 유지하되 `is_active`와 `can_receive_orders`를 단일 `is_active` 컬럼으로 합친다.

§8.2 — `order_id` 타입을 `text`로 확정하고 행 없음과 NULL 행을 모두 처리하는 claim UPSERT 및 버전 규칙을 명시한다.

§8.2 — 슈퍼관리자 주문 삭제 경로가 실제 존재하므로 현재 배정 FK는 `ON DELETE CASCADE`로 둔다.

§8.3 — 이벤트의 주문 ID와 세 profile ID는 외래키 없는 원시 ID로 보존한다.

§8.3 — `previous_assignee_name_snapshot`, `next_assignee_name_snapshot`, `actor_name_snapshot`을 감사 이벤트마다 저장한다.

§9.1 — 업무함과 미배정의 독립 주문 조건에 `parent_order_id IS NULL`을 사용하고 자식 주문은 부모 아래에서만 표시한다.

§9.1 — 모든 `order_category` 조건은 NULL-safe하게 작성하며 `order_category != 'surcharge'` 사용을 금지한다.

§9.3·§9.4 — 배정 API는 `isAdminLike`만 허용하고 공장은 403 처리하며 공장 화면에는 담당자 컬럼과 동작을 표시하지 않는다.

§11.1 — 주문 ID 일괄 조회를 쿼리스트링 GET에서 요청 본문을 사용하는 batch POST로 변경한다.

§11.1 — 배정·재배정·해제·claim은 하나의 PUT 경로로 합치되 claim에는 `expected: unassigned` 전이를 유지한다.

§11.2 — 실행자는 세션에서 파생하고 대상 담당자는 활성 `admin_staff_members`인지 검증한다.

§11.3 — 서버가 `createAdminClient().rpc(...)`로 원자적 함수를 호출하도록 확정한다.

§11.3 — 신규 RPC는 기본 `SECURITY INVOKER`를 사용하고 `REVOKE ALL FROM PUBLIC` 후 `GRANT EXECUTE TO service_role`만 부여한다.

§11.3 — 충돌 시 현재 담당자와 버전을 포함한 409를 반환하도록 정의한다.

§12 — 담당자 batch 조회 실패 상태를 미배정으로 해석하지 않고 담당자 기반 필터와 변경 동작을 비활성화한다.

§13 — 전역 플래그는 기본값 false인 `ORDER_ASSIGNMENT_ENABLED` 하나만 사용한다.

§13 — 담당자 UI는 전역 플래그가 켜지고 로그인 사용자가 활성 직원이거나 `super_admin`일 때만 표시한다.

§13 단계5 — “제한된 관리자 세션에서 먼저 활성화” 문구를 삭제하고 직원 등록 여부를 단계적 UI 개방 기준으로 사용한다.

§14 — 환경변수 변경에는 재배포가 필요하다고 명시하고 플래그 비활성 재배포를 첫 롤백 절차로 정의한다.

§15 — NULL 카테고리 루트 주문, 자식 주문 제외, 공장 403·UI 비노출, Auth 보상, RPC 권한, 두 claim 분기, 계정 삭제 후 감사 이력 테스트를 추가한다.

§16 — 자식 주문 자동 배정 행 생성은 제외하되 부모 담당자를 조회 시점에 따르는 규칙은 1차 범위에 포함한다.

§18 — 14KB URL 제한의 예상 장애를 Vercel `414 URL_TOO_LONG`으로 기록한다.

§20 — RPC 권한 선례로 `20260502120000_rls_super_admin_admin_parity.sql:19-21`을 추가한다.

§21 — `lead_classify_staging`의 PUBLIC EXECUTE 상태를 별도 기존 보안 부채로 기록하고 이번 구현 범위에서는 수정하지 않는다.

§22 — 공장 차단, 부모 주문 기준 처리, 직원 기반 UI 개방, 서비스 역할 전용 RPC 원칙을 최종 요약에 반영한다.
---

## 라운드 03 · Claude →

# Claude → Codex 라운드 3 (반영)

수렴 완료다. 네 최종 변경 지시서 26항목 전부 승인한다.

특히 아래 3개는 내 제안보다 네 쪽이 낫다고 인정한다.

- 결정2에서 `super_admin` 을 UI 노출 조건에 포함시킨 것 — 감독 권한이 끊기면 안 된다.
- 결정3의 스냅샷 3컬럼 — 재배정 전후를 이력 자체로 설명해야 한다.
- §12의 "batch 조회 실패를 미배정으로 해석 금지" — 원문 §8.2의 '행 없음 = 미배정' 규칙과 조회 실패가 겹치면 전 주문이 미배정으로 보이는 사고가 난다. 내가 놓쳤다.

## 지금 할 일

`docs/PLAN_ORDER_STAFF_ACCOUNTS_AND_ASSIGNMENT.md` 를 네 변경 지시서 26항목대로 **직접 수정해라.**

## 제약 (반드시 지켜라)

- **이 파일 하나만 수정한다.** 레포의 다른 파일은 읽기만 하고 절대 쓰지 마라. `lib/marketing-report/fetchSupabase.ts` 에 커밋되지 않은 다른 작업이 있으니 특히 건드리지 마라.
- 코드, 마이그레이션 SQL, DB, 계정은 여전히 **생성·수정 금지**. 문서만이다.
- git 커밋도 하지 마라.
- 기존 문서의 톤과 구조(한 문장 = 한 줄, 번호 섹션)를 유지해라.
- 섹션 번호를 재배치하지 마라. 기존 §번호는 그대로 두고 내용만 고친다.

## 추가로 문서에 넣을 것

1. §0 문서 상태에 개정 이력을 추가해라 — `개정 v2 (2026-08-10): Claude 와의 교차검토 3라운드 반영. 검토는 운영 DB 실측과 레포 코드 대조로 수행했다.`
2. 새 섹션 `## 23. 교차검토에서 확정된 사실`을 문서 끝에 추가하고, 우리가 실측으로 확정한 값을 표로 넣어라.
   - `handle_new_user` 가 role을 `'customer'` 로 강제하고 예외를 삼킨다는 사실
   - `orders.id` = `text`
   - `orders.salesman_id` → `salesman_profiles` 참조
   - `/api/admin/orders` 무페이지네이션
   - `order_category` 분포 (null 292 / regular 93 / quick 14), `parent_order_id` 채워진 행 0
   - `factory` 역할의 `/orders` 접근
   - 슈퍼관리자 주문 삭제 경로 존재 (`orders/route.ts:737`, `823`, `OrdersTab.tsx:1593`)
   - 각 항목에 근거(파일:줄 또는 SQL)를 같이 적어라.
3. §19 "다른 세션이 집중 검토할 질문" 은 이미 답이 나온 항목을 제거하고, 아직 사람 판단이 필요한 것만 남겨라.

수정을 마치면 **무엇을 바꿨는지 섹션별 한 줄 요약**만 답으로 내라. 문서 전문을 답에 붙이지 마라.

## 라운드 03 · Codex →

[계획 문서](C:/Users/tkay/Desktop/dev/modoo_admin/docs/PLAN_ORDER_STAFF_ACCOUNTS_AND_ASSIGNMENT.md)를 수정했습니다.

- §0 — v2 교차검토 개정 이력을 추가했습니다.
- §3 — 환경변수 비활성 재배포를 안전 원칙으로 명시했습니다.
- §4 — 운영 실측값, 주문 타입, 영업담당자 FK를 바로잡았습니다.
- §5 — 트리거 생성 프로필을 UPDATE하는 구조로 확정했습니다.
- §7 — `.single()` 검증과 Auth 비활성화 보상 절차를 추가했습니다.
- §8 — 단일 직원 상태, claim 분기, 버전 규칙, 외래키 없는 감사 ID와 스냅샷 3종을 반영했습니다.
- §9 — `parent_order_id` 기준 자식 주문 처리, NULL-safe 필터, 공장 차단과 UI 노출 조건을 확정했습니다.
- §11 — batch POST와 단일 PUT 경로, `isAdminLike` 게이트, 서비스 역할 전용 RPC 권한을 정의했습니다.
- §12 — batch 조회 실패를 미배정으로 해석하지 않도록 수정했습니다.
- §13 — 전역 플래그와 직원·슈퍼관리자 대상 단계적 개방 절차를 반영했습니다.
- §14 — 환경변수 변경에 재배포가 필요함을 명시했습니다.
- §15 — 동시성, NULL 카테고리, 공장 차단, RPC 권한, 감사 보존 회귀 테스트를 추가했습니다.
- §16 — 자식 주문 배정 행 생성은 제외하고 부모 담당자 조회 상속은 포함했습니다.
- §18 — Vercel 414, 조회 실패, NULL 필터, 공장 누수, 계정 생성 보상 위험을 추가했습니다.
- §19 — 답이 확정된 질문을 제거하고 사람 승인이 필요한 5개 항목만 남겼습니다.
- §20 — RPC 호출·권한 제한과 자식 주문 스키마 선례를 추가했습니다.
- §21 — 기존 RLS 부채와 RPC `PUBLIC EXECUTE` 부채를 기록했습니다.
- §22 — 최종 합의된 권한·상속·감사·RPC 구조를 요약했습니다.
- §23 — 운영 DB와 코드로 확정한 사실과 근거 표를 추가했습니다.
- 검증 — §0부터 §23까지 순서, 한 문장 한 줄, 후행 공백과 최종 개행을 확인했습니다.
- 범위 — 다른 파일과 DB·계정·SQL은 수정하지 않았고 git 커밋도 하지 않았습니다.