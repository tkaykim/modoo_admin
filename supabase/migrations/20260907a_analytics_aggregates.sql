-- Additive read-only aggregates. No order/payment/history mutations.
create index if not exists orders_analytics_created_at_idx on public.orders (created_at, id);
create index if not exists orders_analytics_paid_at_idx on public.orders (paid_at, id) where paid_at is not null;

create or replace function public.admin_visitor_stats_v2(p_from timestamptz, p_to timestamptz, p_grain text default 'day')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_grain not in ('hour','day','week','month') or p_to < p_from or p_to - p_from > interval '1100 days' then
    raise exception 'Invalid analytics range';
  end if;
  with events as materialized (
    select e.session_id, date_trunc(p_grain, e.occurred_at at time zone 'Asia/Seoul') as bucket
    from public.analytics_events e
    where e.event_type='page_view' and e.occurred_at >= p_from and e.occurred_at < p_to
      and coalesce(e.utm_campaign,'') not like 'grp-E2E%'
  ), buckets as (
    select to_char(bucket, case when p_grain='hour' then 'YYYY-MM-DD HH24' when p_grain='month' then 'YYYY-MM' else 'YYYY-MM-DD' end) as key,
      count(distinct nullif(session_id,'')) as sessions from events group by bucket
  )
  select jsonb_build_object(
    'pageviews',(select count(*) from events),
    'unique_sessions',(select count(distinct nullif(session_id,'')) from events),
    'buckets',coalesce((select jsonb_object_agg(key,sessions) from buckets),'{}'::jsonb),
    'first_event_at',(select min(occurred_at) from public.analytics_events where event_type='page_view')
  ) into result;
  return result;
end $$;
revoke all on function public.admin_visitor_stats_v2(timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_visitor_stats_v2(timestamptz,timestamptz,text) to service_role;

create or replace function public.admin_channel_stats_range(p_since timestamptz, p_until timestamptz)
returns table(utm_source text, utm_medium text, sessions bigint, form_inquiries bigint, chatbot_sessions bigint)
language sql stable security invoker set search_path = '' as $$
  select e.utm_source,e.utm_medium,
    count(distinct nullif(e.session_id,'')),
    count(distinct nullif(e.session_id,'')) filter(where e.path like '/inquiries/new/success%'),
    count(distinct nullif(e.session_id,'')) filter(where e.event_type='chatbot_step')
  from public.analytics_events e
  where e.occurred_at >= p_since and e.occurred_at < p_until
    and p_until-p_since <= interval '1100 days'
    and coalesce(e.utm_campaign,'') not like 'grp-E2E%'
  group by e.utm_source,e.utm_medium
$$;
revoke all on function public.admin_channel_stats_range(timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_channel_stats_range(timestamptz,timestamptz) to service_role;
