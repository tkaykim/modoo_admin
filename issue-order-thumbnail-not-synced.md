# 주문 후 디자인 수정 시 썸네일/미리보기 미반영 문제

## 문제 현상

주문 완료 후 디자인이 수정되더라도(관리자 또는 고객), 주문 상세/목록 화면의 썸네일이 수정 전 상태 그대로 표시됨.

## 원인

### order_items.thumbnail_url은 정적 스냅샷

주문 생성 시(`/api/toss/confirm`) `saved_designs.preview_url` 또는 `cart_items.thumbnail_url`을 **복사**하여 `order_items.thumbnail_url`에 저장합니다. 이후 이 값을 갱신하는 코드는 이 코드베이스에 없습니다.

관련 코드 (`app/api/toss/confirm/route.ts` 311~312행):

```javascript
thumbnail_url: savedDesign?.preview_url || item.thumbnail_url || null,
```

### 주문 화면은 전부 order_items만 조회 (saved_designs 조인 없음)

| 화면 | 파일 | 조회 방식 |
|---|---|---|
| 주문 상세 | `app/order/[orderId]/page.tsx` | `orders.select('*, order_items(*)')` |
| 마이페이지 주문 목록 | `app/home/my-page/orders/page.tsx` | `orders.select('..., order_items(... thumbnail_url)')` |
| 비회원 주문 조회 | `app/api/order/lookup/route.ts` | `orders.select('..., order_items(... thumbnail_url)')` |
| 주문 파일 API | `app/api/orders/[orderId]/files/route.ts` | `orders.select('..., order_items(... thumbnail_url)')` |

모든 곳에서 `order_items.thumbnail_url`을 직접 읽으며, `saved_designs.preview_url`을 조인하지 않습니다.

### order_items UPDATE는 주문 생성 직후 보강용으로만 존재

코드베이스에서 `.from('order_items').update()`가 있는 곳은 3곳이며, 전부 **주문 생성 직후** `text_svg_exports`와 `image_urls`를 채우는 용도입니다:

- `app/api/toss/confirm/route.ts` 432행
- `app/api/checkout/testmode/route.ts` 321행
- `app/api/cobuy/create-order/route.ts` 291행

`thumbnail_url`, `canvas_state`, `color_selections` 등을 나중에 갱신하는 코드는 없습니다.

### saved_designs 수정이 order_items에 전파되지 않음

디자인 수정이 가능한 경로들:

1. **DesignEditModal** (`app/components/DesignEditModal.tsx` 569행) — `saved_designs` + `cart_items`만 UPDATE
2. **updateDesign** (`lib/designService.ts` 256행) — `saved_designs`만 UPDATE
3. **관리자 앱** (별도 레포) — 이 코드베이스에서는 확인 불가

어느 경로로 수정하든, `order_items`에 대한 동기화 로직이 이 코드베이스에 없습니다.

## 영향받는 데이터

| order_items 필드 | 저장 시점 | 이후 갱신 여부 |
|---|---|---|
| `thumbnail_url` | 주문 생성 시 복사 | 없음 |
| `canvas_state` | 주문 생성 시 복사 | 없음 |
| `color_selections` | 주문 생성 시 복사 | 없음 |
| `text_svg_exports` | 주문 생성 직후 보강 | 없음 |
| `image_urls` | 주문 생성 직후 보강 | 없음 |

## 참고: editor_chat_messages 테이블

DB에 `editor_chat_messages` 테이블이 존재하며 `order_item_id` FK가 있지만, 이 테이블을 읽거나 쓰는 코드가 고객 앱 코드베이스에 없습니다. 관리자-고객 간 디자인 수정 소통용으로 설계된 것으로 보이나 미구현 상태입니다.

## 수정 방향 (참고용)

관리자 코드베이스에 갱신/재생성 로직이 있을 수 있으므로, 수정 전 아래 확인 필요:

1. 관리자 앱에서 `order_items`를 직접 UPDATE하는 코드가 있는지
2. 관리자 앱에서 `saved_designs`를 수정할 때 `order_items`도 함께 갱신하는지
3. 관리자 앱 주문 화면에서 `saved_designs`를 조인하여 최신 preview_url을 사용하는지

만약 관리자 쪽에도 동기화 로직이 없다면, 가능한 수정 방식:

- **방식 A**: 디자인 수정 시 관련 `order_items`의 `thumbnail_url`도 함께 UPDATE
- **방식 B**: 주문 화면에서 `saved_designs`를 조인하여 `preview_url`이 있으면 우선 사용
- **방식 C**: `order_items.design_id` FK를 활용해 항상 `saved_designs.preview_url`을 참조
