# 디자인 수정 시 order_items 썸네일/캔버스 동기화 구현

## 배경

주문 생성 시 `saved_designs`의 데이터(`preview_url`, `canvas_state`, `color_selections`)가
`order_items`로 **복사**된다. 이후 디자인이 수정되더라도 `order_items`에는 전파되지 않아,
주문 상세/목록 화면에서 수정 전 썸네일이 그대로 표시되는 문제가 있었다.

관리자 에디터의 "order mode"는 `order_items`를 직접 편집하므로 문제가 없었지만,
"design mode"에서 `saved_designs`를 수정하면 연관 `order_items`가 갱신되지 않았다.

자세한 분석은 `issue-order-thumbnail-not-synced.md` 참고.

## 변경 사항

### 1. 동기화 API 신규 생성

**파일**: `app/api/admin/designs/[id]/sync-orders/route.ts`

`POST /api/admin/designs/:designId/sync-orders`

- 관리자 인증 필수 (admin role)
- `saved_designs`에서 최신 `preview_url`, `canvas_state`, `color_selections` 조회
- `order_items` 중 `design_id`가 해당 디자인인 항목을 찾아 일괄 업데이트
- 응답: `{ data: { synced: number } }` (동기화된 항목 수)

동기화 대상 필드:

| order_items 필드 | 원본 (saved_designs) |
|---|---|
| `thumbnail_url` | `preview_url` |
| `canvas_state` | `canvas_state` |
| `color_selections` | `color_selections` |
| `updated_at` | 현재 시각 |

### 2. 디자인 저장 시 자동 동기화 호출

**파일**: `components/editor/hooks/useEditorSave.ts`

`saveDesignMode()` 함수에서 기존 디자인 업데이트(`updateDesign()`) 성공 후,
`syncDesignToOrderItems()` 함수를 **비동기(fire-and-forget)**로 호출한다.

- 동기화 실패가 디자인 저장 자체를 실패시키지 않음
- 동기화 결과는 콘솔에 로깅
- 새 디자인 생성 시에는 호출하지 않음 (아직 연결된 order_items가 없으므로)

## 동작 흐름

```
관리자가 design mode에서 디자인 수정 → 저장 클릭
  ↓
saveDesignMode()
  ↓
updateDesign() → saved_designs UPDATE (preview_url, canvas_state 등)
  ↓
syncDesignToOrderItems() (비동기)
  ↓
POST /api/admin/designs/:id/sync-orders
  ↓
order_items WHERE design_id = :id → UPDATE thumbnail_url, canvas_state, color_selections
```

## 변경 파일 목록

| 파일 | 변경 유형 | 설명 |
|---|---|---|
| `app/api/admin/designs/[id]/sync-orders/route.ts` | 신규 | 동기화 API 엔드포인트 |
| `components/editor/hooks/useEditorSave.ts` | 수정 | 디자인 저장 후 동기화 호출 추가 |

## 참고

- order mode에서 주문 항목을 직접 편집/저장하는 기존 로직(`app/api/admin/orders/items/route.ts` PATCH)은 변경 없음
- 유저 앱에서의 디자인 수정은 이 코드베이스의 범위 밖이므로 별도 처리 필요
