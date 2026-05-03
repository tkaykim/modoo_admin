ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_order_category_check;

ALTER TABLE public.orders
ADD CONSTRAINT orders_order_category_check CHECK (
  order_category IS NULL
  OR order_category = ANY (
    ARRAY[
      'cobuy'::text,
      'regular'::text,
      'salesman_direct'::text
    ]
  )
);
