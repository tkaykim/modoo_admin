-- reportError의 read-then-write 레이스로 같은 에러가 여러 경로(error boundary +
-- window.onerror)에서 동시에 보고될 때 메일이 2통씩 발송되는 문제 해결.
-- 행 단위 락(FOR UPDATE) + UNIQUE(dedup_key) 충돌 처리로, 동시 호출 중 단 한
-- 번만 should_email=true 를 받도록 직렬화한다.
create or replace function public.claim_error_report(
  p_dedup_key text,
  p_message text,
  p_stack text,
  p_url text,
  p_user_agent text,
  p_user_id uuid,
  p_is_payment boolean,
  p_is_noise boolean,
  p_noise_reason text,
  p_context jsonb,
  p_cooldown_sec int,
  p_daily_cap int,
  p_today_kst date
) returns table(should_email boolean, occurrence_since_last int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_existing public.error_logs%rowtype;
  v_should boolean := false;
  v_occ int := 1;
  v_same_day boolean;
  v_sent_today int;
  v_sec numeric;
begin
  select * into v_existing from public.error_logs
  where dedup_key = p_dedup_key for update;

  if not found then
    begin
      insert into public.error_logs(
        dedup_key, message, stack, url, user_agent, user_id, is_payment, is_noise,
        noise_reason, first_seen_at, last_seen_at, occurrence_count, context,
        last_emailed_at, emails_sent_today, emails_sent_date
      ) values (
        p_dedup_key, p_message, p_stack, p_url, p_user_agent, p_user_id, p_is_payment, p_is_noise,
        p_noise_reason, v_now, v_now, 0, p_context,
        case when not p_is_noise then v_now else null end,
        case when not p_is_noise then 1 else 0 end,
        p_today_kst
      );
      should_email := not p_is_noise;
      occurrence_since_last := 1;
      return next;
      return;
    exception when unique_violation then
      -- 동시 insert 충돌: 승자가 방금 넣은 행을 락 걸고 다시 읽어 아래 분기로.
      select * into v_existing from public.error_logs
      where dedup_key = p_dedup_key for update;
    end;
  end if;

  -- 기존 행 경로 (원래 존재했거나 동시 insert 충돌 후).
  v_same_day := (v_existing.emails_sent_date = p_today_kst);
  v_sent_today := case when v_same_day then coalesce(v_existing.emails_sent_today,0) else 0 end;
  v_sec := case when v_existing.last_emailed_at is not null
                then extract(epoch from (v_now - v_existing.last_emailed_at)) else null end;
  v_occ := coalesce(v_existing.occurrence_count,0) + 1;

  v_should := not p_is_noise;
  if v_should then
    if v_existing.last_emailed_at is not null and v_sec < p_cooldown_sec then
      v_should := false;
    elsif v_sent_today >= p_daily_cap then
      v_should := false;
    end if;
  end if;

  update public.error_logs set
    message = p_message,
    stack = p_stack,
    url = p_url,
    user_agent = p_user_agent,
    user_id = p_user_id,
    is_payment = p_is_payment,
    is_noise = p_is_noise,
    noise_reason = p_noise_reason,
    last_seen_at = v_now,
    context = p_context,
    updated_at = v_now,
    occurrence_count = case when v_should then 0 else v_occ end,
    last_emailed_at = case when v_should then v_now else last_emailed_at end,
    emails_sent_today = case when v_should then (case when v_same_day then coalesce(emails_sent_today,0) + 1 else 1 end) else emails_sent_today end,
    emails_sent_date = case when v_should then p_today_kst else emails_sent_date end
  where dedup_key = p_dedup_key;

  should_email := v_should;
  occurrence_since_last := v_occ;
  return next;
end;
$$;

revoke all on function public.claim_error_report(text,text,text,text,text,uuid,boolean,boolean,text,jsonb,int,int,date) from public, anon, authenticated;
