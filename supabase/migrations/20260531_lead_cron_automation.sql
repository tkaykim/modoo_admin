-- ============================================================================
-- Lead 자동화 Cron (pg_cron) — 이미 prod 적용됨
-- 매일 03:00 KST(18:00 UTC): 새 스테이징 → classify → promote 자동 실행
-- ============================================================================

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead_auto_promote') THEN
    PERFORM cron.unschedule('lead_auto_promote');
  END IF;
END;
$outer$;

SELECT cron.schedule(
  'lead_auto_promote',
  '0 18 * * *',
  $cmd$
    DO $inner$
    DECLARE v_count int;
    BEGIN
      SELECT count(*) INTO v_count FROM public.lead_staging WHERE dedup_status = 'new';
      IF v_count > 0 THEN
        PERFORM public.lead_classify_staging(NULL);
        PERFORM public.lead_promote_staging(NULL);
      END IF;
    END;
    $inner$
  $cmd$
);
