-- Unique OM numbering under concurrency + archive document type.

begin;

create or replace function public.hr_next_doc_number(p_prefix text)
returns text
language plpgsql
as $$
declare
  yy text := to_char((now() at time zone 'Africa/Algiers'), 'YY');
  max_n integer := 0;
begin
  -- Serialize allocation so two concurrent creates cannot share a number.
  perform pg_advisory_xact_lock(hashtext('hr_next_doc_number:' || coalesce(p_prefix, '') || ':' || yy));

  select coalesce(max(split_part(number, '/', 1)::integer), 0)
    into max_n
  from public.hr_correspondences
  where number ~ ('^[0-9]+/' || yy || '$');

  return lpad((max_n + 1)::text, 6, '0') || '/' || yy;
end;
$$;

grant execute on function public.hr_next_doc_number(text) to authenticated;

insert into public.hr_catalogs (kind, code, label_ar, label_fr, extra, sort_order, is_active)
values
  (
    'document_type',
    'OM_ARCHIVE',
    'أرشيف أمر بمهمة',
    'Archive ordre de mission',
    '{"block_level":"grace"}'::jsonb,
    60,
    true
  )
on conflict (kind, code) do update set
  label_ar = excluded.label_ar,
  label_fr = excluded.label_fr,
  extra = excluded.extra,
  sort_order = excluded.sort_order,
  is_active = true;

commit;
