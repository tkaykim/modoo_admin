-- The trigger runs through order_items insertion; direct API invocation is not needed.
REVOKE EXECUTE ON FUNCTION public.auto_populate_order_item_cost() FROM PUBLIC, anon, authenticated;
