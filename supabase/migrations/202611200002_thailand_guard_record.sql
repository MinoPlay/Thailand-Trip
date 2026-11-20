-- Correct the shared trigger's runtime record-field validation. PostgreSQL
-- resolves record fields before evaluating an AND, even when its first branch
-- is false. Only the matching table branch may reference attachment fields.
begin;
create or replace function thailand_private.thailand_guard_record() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_trip uuid;
  v_item uuid;
  v_attachment uuid;
  v_finalizing boolean;
begin
  if tg_table_name = 'thailand_trips' then
    v_trip := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_trip := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
    if tg_table_name = 'thailand_itinerary_items' then
      v_item := case when tg_op = 'DELETE' then old.id else new.id end;
    else
      v_item := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
    end if;
    if tg_table_name = 'thailand_attachments' then
      v_attachment := case when tg_op = 'DELETE' then old.id else new.id end;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:trip:' || v_trip::text, 0));
  select exists (select 1 from thailand_private.thailand_finalizations
    where transaction_id = pg_current_xact_id() and trip_id = v_trip) into v_finalizing;
  if tg_op = 'DELETE' then
    if tg_table_name in ('thailand_itinerary_items', 'thailand_attachments') and not v_finalizing then
      raise exception using errcode = '55000', message = 'use_delete_content';
    end if;
    if tg_table_name = 'thailand_trips' and (
      exists (select 1 from public.thailand_itinerary_items where trip_id = v_trip)
      or exists (select 1 from public.thailand_attachments where trip_id = v_trip)
      or exists (select 1 from public.thailand_notes where trip_id = v_trip)
      or exists (select 1 from public.thailand_tasks where trip_id = v_trip)
      or exists (select 1 from thailand_private.thailand_deletion_claims where trip_id = v_trip and completed_at is null)
    ) then raise exception using errcode = '55000', message = 'trip_not_empty'; end if;
  end if;
  if thailand_private.thailand_is_claimed(v_trip, v_item, v_attachment) and not v_finalizing then
    raise exception using errcode = '55000', message = 'deletion_in_progress';
  end if;
  if tg_op = 'UPDATE' and tg_table_name not in ('thailand_trips', 'thailand_itinerary_items') and not v_finalizing then
    if thailand_private.thailand_is_claimed(old.trip_id, old.item_id,
      case when tg_table_name = 'thailand_attachments' then old.id else null end) then
      raise exception using errcode = '55000', message = 'deletion_in_progress';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from thailand_private.thailand_deletion_claims where target_table = tg_table_name and target_id = new.id) then
      raise exception using errcode = '23514', message = 'deleted_identity_cannot_be_reused';
    end if;
    new.version := 1;
    new.created_at := now();
  else
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception using errcode = '23514', message = 'immutable_identity';
    end if;
    if tg_table_name = 'thailand_trips' then
      if new.owner_id <> old.owner_id or new.initialized <> old.initialized then
        raise exception using errcode = '23514', message = 'immutable_trip_owner_or_initialization';
      end if;
    elsif new.trip_id <> old.trip_id then
      raise exception using errcode = '23514', message = 'immutable_trip_id';
    end if;
    if tg_table_name = 'thailand_attachments' then
      if new.item_id is distinct from old.item_id or new.path <> old.path
        or new.mime_type <> old.mime_type or new.size <> old.size or new.name <> old.name then
        raise exception using errcode = '23514', message = 'immutable_attachment_metadata';
      end if;
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  if tg_table_name = 'thailand_trips' then
    if not exists (select 1 from pg_timezone_names where name = new.timezone) then
      raise exception using errcode = '23514', message = 'invalid_timezone';
    end if;
  elsif tg_table_name = 'thailand_itinerary_items' then
    if not exists (select 1 from pg_timezone_names where name = new.start_zone)
      or not exists (select 1 from pg_timezone_names where name = new.end_zone) then
      raise exception using errcode = '23514', message = 'invalid_timezone';
    end if;
  elsif tg_table_name = 'thailand_attachments' then
    if tg_op = 'INSERT' and new.status <> 'uploading' then
      raise exception using errcode = '23514', message = 'attachment_must_start_uploading';
    end if;
    if new.status = 'deleting' then raise exception using errcode = '55000', message = 'use_delete_content'; end if;
    if tg_op = 'UPDATE' and old.status = 'ready' and new.status <> 'ready' then
      raise exception using errcode = '23514', message = 'invalid_attachment_transition';
    end if;
    if new.status = 'ready' and not exists (
      select 1 from storage.objects o where o.bucket_id = 'thailand-documents' and o.name = new.path
        and (o.metadata->>'size')::bigint = new.size and o.metadata->>'mimetype' = new.mime_type
    ) then raise exception using errcode = '23514', message = 'upload_not_verified'; end if;
  end if;
  return new;
end;
$$;
commit;
