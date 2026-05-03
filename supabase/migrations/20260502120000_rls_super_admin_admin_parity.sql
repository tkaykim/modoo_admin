-- super_admin 과 admin 을 동일한 RLS 권한으로 취급 (브라우저 anon 키 + authenticated 직접 조회용)
-- modoo_admin 은 서비스 롤도 쓰지만, 클라이언트/SDK 경로까지 맞춘다.

CREATE OR REPLACE FUNCTION public.app_is_admin_or_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.role = 'admin' OR p.role = 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.app_is_admin_or_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_is_admin_or_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_admin_or_super_admin() TO anon;

-- profiles: JWT 클레임 대신 테이블 기반 (기존 JWT admin 은 거의 채워지지 않음)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT
  USING ((auth.uid() = id) OR public.app_is_admin_or_super_admin());

-- products
DROP POLICY IF EXISTS "Admins can manage all products" ON public.products;
CREATE POLICY "Admins can manage all products" ON public.products
  FOR ALL
  USING (public.app_is_admin_or_super_admin())
  WITH CHECK (public.app_is_admin_or_super_admin());

-- announcements … saved_designs (기존 admin 전용 존재 정책)
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
CREATE POLICY "Admins can manage announcements" ON public.announcements FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update chatbot inquiries" ON public.chatbot_inquiries;
CREATE POLICY "Admins can update chatbot inquiries" ON public.chatbot_inquiries FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all chatbot inquiries" ON public.chatbot_inquiries;
CREATE POLICY "Admins can view all chatbot inquiries" ON public.chatbot_inquiries FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.cobuy_notifications;
CREATE POLICY "Admins can view all notifications" ON public.cobuy_notifications FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all participants" ON public.cobuy_participants;
CREATE POLICY "Admins can view all participants" ON public.cobuy_participants FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update all requests" ON public.cobuy_requests;
CREATE POLICY "Admins can update all requests" ON public.cobuy_requests FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all requests" ON public.cobuy_requests;
CREATE POLICY "Admins can view all requests" ON public.cobuy_requests FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update all cobuy sessions" ON public.cobuy_sessions;
CREATE POLICY "Admins can update all cobuy sessions" ON public.cobuy_sessions FOR UPDATE
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all cobuy sessions" ON public.cobuy_sessions;
CREATE POLICY "Admins can view all cobuy sessions" ON public.cobuy_sessions FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage all coupon usages" ON public.coupon_usages;
CREATE POLICY "Admins can manage all coupon usages" ON public.coupon_usages FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can delete templates" ON public.design_templates;
CREATE POLICY "Admins can delete templates" ON public.design_templates FOR DELETE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can insert templates" ON public.design_templates;
CREATE POLICY "Admins can insert templates" ON public.design_templates FOR INSERT
  WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update templates" ON public.design_templates;
CREATE POLICY "Admins can update templates" ON public.design_templates FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can delete designer requests" ON public.designer_requests;
CREATE POLICY "Admins can delete designer requests" ON public.designer_requests FOR DELETE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update designer requests" ON public.designer_requests;
CREATE POLICY "Admins can update designer requests" ON public.designer_requests FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all designer requests" ON public.designer_requests;
CREATE POLICY "Admins can view all designer requests" ON public.designer_requests FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins full access" ON public.editor_chat_messages;
CREATE POLICY "Admins full access" ON public.editor_chat_messages FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage factories" ON public.factories;
CREATE POLICY "Admins can manage factories" ON public.factories FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can delete faqs" ON public.faqs;
CREATE POLICY "Admins can delete faqs" ON public.faqs FOR DELETE USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can insert faqs" ON public.faqs;
CREATE POLICY "Admins can insert faqs" ON public.faqs FOR INSERT WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update faqs" ON public.faqs;
CREATE POLICY "Admins can update faqs" ON public.faqs FOR UPDATE
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all faqs" ON public.faqs;
CREATE POLICY "Admins can view all faqs" ON public.faqs FOR SELECT USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage hero banners" ON public.hero_banners;
CREATE POLICY "Admins can manage hero banners" ON public.hero_banners FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Users can update their own pending inquiries" ON public.inquiries;
CREATE POLICY "Users can update their own pending inquiries" ON public.inquiries FOR UPDATE
  USING (
    ((auth.uid() = user_id) AND (status <> 'completed'::text))
    OR public.app_is_admin_or_super_admin()
  );

DROP POLICY IF EXISTS "Users can view inquiry products for their inquiries" ON public.inquiry_products;
CREATE POLICY "Users can view inquiry products for their inquiries" ON public.inquiry_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries inquiries
      WHERE inquiries.id = inquiry_products.inquiry_id
        AND (
          inquiries.user_id = auth.uid()
          OR public.app_is_admin_or_super_admin()
        )
    )
  );

DROP POLICY IF EXISTS "Admins can create replies" ON public.inquiry_replies;
CREATE POLICY "Admins can create replies" ON public.inquiry_replies FOR INSERT
  WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update their own replies" ON public.inquiry_replies;
CREATE POLICY "Admins can update their own replies" ON public.inquiry_replies FOR UPDATE
  USING ((admin_id = auth.uid()) AND public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage manufacturer colors" ON public.manufacturer_colors;
CREATE POLICY "Admins can manage manufacturer colors" ON public.manufacturer_colors FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage manufacturers" ON public.manufacturers;
CREATE POLICY "Admins can manage manufacturers" ON public.manufacturers FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
CREATE POLICY "Admins can manage all order items" ON public.order_items FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;
CREATE POLICY "Admins can view all order items" ON public.order_items FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "order_shipping_legs_admin_select" ON public.order_shipping_legs;
CREATE POLICY "order_shipping_legs_admin_select" ON public.order_shipping_legs FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Admins can update all orders" ON public.orders FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admin full access on partner_mall_presets" ON public.partner_mall_presets;
CREATE POLICY "Admin full access on partner_mall_presets" ON public.partner_mall_presets FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Allow admin full access to partner_mall_products" ON public.partner_mall_products;
CREATE POLICY "Allow admin full access to partner_mall_products" ON public.partner_mall_products FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Allow admin full access to partner_malls" ON public.partner_malls;
CREATE POLICY "Allow admin full access to partner_malls" ON public.partner_malls FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "admin_full_access_product_calibrations" ON public.product_calibrations;
CREATE POLICY "admin_full_access_product_calibrations" ON public.product_calibrations FOR ALL
  USING (public.app_is_admin_or_super_admin()) WITH CHECK (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can manage categories" ON public.product_categories;
CREATE POLICY "Admins can manage categories" ON public.product_categories FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Only admins can manage product colors" ON public.product_colors;
CREATE POLICY "Only admins can manage product colors" ON public.product_colors FOR ALL
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all saved design screenshots" ON public.saved_design_screenshots;
CREATE POLICY "Admins can view all saved design screenshots" ON public.saved_design_screenshots FOR SELECT
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can delete all designs" ON public.saved_designs;
CREATE POLICY "Admins can delete all designs" ON public.saved_designs FOR DELETE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can update all designs" ON public.saved_designs;
CREATE POLICY "Admins can update all designs" ON public.saved_designs FOR UPDATE
  USING (public.app_is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view all designs" ON public.saved_designs;
CREATE POLICY "Admins can view all designs" ON public.saved_designs FOR SELECT
  USING (public.app_is_admin_or_super_admin());
