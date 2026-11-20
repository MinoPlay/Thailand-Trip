-- Additive migration for a shared Supabase project. Never reset/push this
-- repository's migration history onto an existing project.
begin;
create schema thailand_private;
revoke all on schema thailand_private from public, anon, authenticated;
grant usage on schema thailand_private to authenticated;

create table thailand_private.thailand_config (
  singleton boolean primary key default true check (singleton),
  account_id uuid not null unique references auth.users(id)
);
revoke all on thailand_private.thailand_config from public, anon, authenticated;

create function thailand_private.thailand_is_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from thailand_private.thailand_config where account_id = (select auth.uid()));
$$;

create function public.thailand_shared_account_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select account_id from thailand_private.thailand_config where singleton; $$;

create table public.thailand_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  title text not null check (length(btrim(title)) between 1 and 200),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  timezone text not null default 'Asia/Bangkok',
  initialized boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.thailand_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.thailand_trips(id),
  type text not null check (type in ('stay', 'transfer', 'activity')),
  title text not null check (length(btrim(title)) between 1 and 200),
  date date,
  starts_at timestamptz,
  ends_at timestamptz,
  start_zone text not null default 'Asia/Bangkok',
  end_zone text not null default 'Asia/Bangkok',
  check_in date,
  check_out date,
  location text not null default '',
  address text not null default '',
  map_url text not null default '',
  origin text not null default '',
  destination text not null default '',
  mode text not null default '',
  flight_number text not null default '',
  operator text not null default '',
  provider text not null default '',
  booking_status text not null default 'not_booked'
    check (booking_status in ('not_booked', 'pending', 'booked', 'not_required')),
  booking_reference text not null default '',
  booking_url text not null default '',
  preparation text not null default 'to_prepare' check (preparation in ('to_prepare', 'ready', 'done')),
  attention text not null default '',
  overnight boolean not null default false,
  journey_id text not null default '',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, trip_id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create table public.thailand_tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.thailand_trips(id),
  item_id uuid,
  title text not null check (length(btrim(title)) between 1 and 300),
  details text not null default '',
  due_date date,
  done boolean not null default false,
  position integer not null default 0 check (position >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, trip_id) references public.thailand_itinerary_items(id, trip_id)
);
create table public.thailand_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.thailand_trips(id),
  item_id uuid,
  body text not null check (length(btrim(body)) between 1 and 100000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, trip_id) references public.thailand_itinerary_items(id, trip_id)
);
create table public.thailand_attachments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.thailand_trips(id),
  item_id uuid,
  name text not null check (length(btrim(name)) between 1 and 255),
  path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size bigint not null check (size between 1 and 10485760),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'deleting')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, trip_id) references public.thailand_itinerary_items(id, trip_id),
  check (path ~ ('^' || trip_id::text || '/' || id::text || '/[A-Za-z0-9._-]{1,120}$')),
  check (split_part(path, '/', 3) not in ('.', '..'))
);
create index thailand_itinerary_trip_idx on public.thailand_itinerary_items(trip_id);
create index thailand_tasks_trip_item_idx on public.thailand_tasks(trip_id, item_id);
create index thailand_notes_trip_item_idx on public.thailand_notes(trip_id, item_id);
create index thailand_attachments_trip_item_idx on public.thailand_attachments(trip_id, item_id);

-- No trip FK: completed receipts must survive deletion of an empty trip.
create table thailand_private.thailand_deletion_claims (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  trip_id uuid not null,
  target_table text not null check (target_table in ('thailand_itinerary_items', 'thailand_attachments')),
  target_id uuid not null,
  target_version integer not null,
  paths text[] not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (target_table, target_id)
);
create index thailand_active_claims_idx on thailand_private.thailand_deletion_claims(trip_id) where completed_at is null;
create table thailand_private.thailand_finalizations (
  transaction_id xid8 primary key,
  trip_id uuid not null
);
revoke all on thailand_private.thailand_deletion_claims, thailand_private.thailand_finalizations
  from public, anon, authenticated;

create function thailand_private.thailand_owns_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select thailand_private.thailand_is_member() and exists (
    select 1 from public.thailand_trips where id = p_trip_id and owner_id = (select auth.uid())
  );
$$;
create function thailand_private.thailand_is_claimed(p_trip_id uuid, p_item_id uuid, p_attachment_id uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from thailand_private.thailand_deletion_claims c
    where c.trip_id = p_trip_id and c.completed_at is null
      and ((c.target_table = 'thailand_itinerary_items' and c.target_id = p_item_id)
        or (c.target_table = 'thailand_attachments' and c.target_id = p_attachment_id))
  );
$$;

-- Serialize a claim with concurrent child inserts/edits, not only parent updates.
create function thailand_private.thailand_guard_record() returns trigger
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
    if tg_table_name = 'thailand_attachments' and (
      new.item_id is distinct from old.item_id or new.path <> old.path
      or new.mime_type <> old.mime_type or new.size <> old.size or new.name <> old.name
    ) then raise exception using errcode = '23514', message = 'immutable_attachment_metadata'; end if;
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

do $$
declare t text;
begin
  foreach t in array array['thailand_trips','thailand_itinerary_items','thailand_tasks','thailand_notes','thailand_attachments'] loop
    execute format('create trigger thailand_guard_record before insert or update or delete on public.%I for each row execute function thailand_private.thailand_guard_record()',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
    if t = 'thailand_trips' then
      execute 'create policy thailand_owner_access on public.thailand_trips to authenticated using (thailand_private.thailand_is_member() and owner_id = (select auth.uid())) with check (thailand_private.thailand_is_member() and owner_id = (select auth.uid()))';
    else
      execute format('create policy thailand_owner_access on public.%I to authenticated using (thailand_private.thailand_owns_trip(trip_id)) with check (thailand_private.thailand_owns_trip(trip_id))',t);
    end if;
    execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
end;
$$;
grant delete on public.thailand_trips, public.thailand_tasks, public.thailand_notes to authenticated;
grant all on public.thailand_trips, public.thailand_itinerary_items, public.thailand_tasks,
  public.thailand_notes, public.thailand_attachments to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('thailand-documents','thailand-documents',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']);
-- Existing permissive bucket-management policies must not let other project
-- users make this bucket public or relax its upload limits.
create policy thailand_bucket_insert_fence on storage.buckets as restrictive for insert to public
with check (id <> 'thailand-documents');
create policy thailand_bucket_update_fence on storage.buckets as restrictive for update to public
using (id <> 'thailand-documents') with check (id <> 'thailand-documents');
create policy thailand_bucket_delete_fence on storage.buckets as restrictive for delete to public
using (id <> 'thailand-documents');

create function thailand_private.thailand_can_upload(p_path text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare a public.thailand_attachments;
begin
  select * into a from public.thailand_attachments where path = p_path;
  if not found or not thailand_private.thailand_owns_trip(a.trip_id) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:trip:' || a.trip_id::text, 0));
  return exists (
    select 1 from public.thailand_attachments x where x.id = a.id and x.status = 'uploading'
      and not thailand_private.thailand_is_claimed(x.trip_id,x.item_id,x.id)
  );
end;
$$;
create function thailand_private.thailand_can_read(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select thailand_private.thailand_is_member() and exists (
    select 1 from public.thailand_attachments a where a.path=p_path
      and thailand_private.thailand_owns_trip(a.trip_id)
      and not thailand_private.thailand_is_claimed(a.trip_id,a.item_id,a.id)
  );
$$;

-- Restrictive policies fence ONLY this bucket even if another application has a
-- broad permissive Storage policy. Other buckets get TRUE and are unchanged.
create policy thailand_documents_read_fence on storage.objects as restrictive for select to public
using (bucket_id <> 'thailand-documents' or thailand_private.thailand_can_read(name));
create policy thailand_documents_insert_fence on storage.objects as restrictive for insert to public
with check (bucket_id <> 'thailand-documents' or thailand_private.thailand_can_upload(name));
create policy thailand_documents_update_fence on storage.objects as restrictive for update to public
using (bucket_id <> 'thailand-documents') with check (bucket_id <> 'thailand-documents');
create policy thailand_documents_delete_fence on storage.objects as restrictive for delete to public
using (bucket_id <> 'thailand-documents');
create policy thailand_documents_read on storage.objects for select to authenticated
using (bucket_id = 'thailand-documents' and thailand_private.thailand_is_member());
create policy thailand_documents_upload on storage.objects for insert to authenticated
with check (bucket_id = 'thailand-documents' and thailand_private.thailand_can_upload(name));

create function public.thailand_initialize_trip(
  p_title text,p_start_date date,p_end_date date,p_timezone text,
  p_items jsonb default '[]',p_tasks jsonb default '[]',p_notes jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_trip public.thailand_trips; v_entry jsonb; v_owner uuid := auth.uid();
begin
  if v_owner is null or not thailand_private.thailand_is_member() then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:owner:' || v_owner::text, 0));
  select * into v_trip from public.thailand_trips where owner_id = v_owner;
  if found then return to_jsonb(v_trip); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or p_tasks is null or jsonb_typeof(p_tasks) <> 'array'
    or p_notes is null or jsonb_typeof(p_notes) <> 'array' then
    raise exception using errcode = '22023', message = 'import_requires_arrays';
  end if;
  if jsonb_array_length(p_items) > 2000 or jsonb_array_length(p_tasks) > 5000 or jsonb_array_length(p_notes) > 5000 then
    raise exception using errcode = '22023', message = 'import_too_large';
  end if;
  insert into public.thailand_trips(owner_id,title,start_date,end_date,timezone,initialized)
    values(v_owner,p_title,p_start_date,p_end_date,p_timezone,true) returning * into v_trip;
  for v_entry in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_entry) k where k not in (
        'id','type','title','date','starts_at','ends_at','start_zone','end_zone','check_in','check_out',
        'location','address','map_url','origin','destination','mode','flight_number','operator','provider',
        'booking_status','booking_reference','booking_url','preparation','attention','overnight','journey_id')
    ) then raise exception using errcode = '22023', message = 'invalid_item_import_fields'; end if;
    insert into public.thailand_itinerary_items (
      id,trip_id,type,title,date,starts_at,ends_at,start_zone,end_zone,check_in,check_out,
      location,address,map_url,origin,destination,mode,flight_number,operator,provider,
      booking_status,booking_reference,booking_url,preparation,attention,overnight,journey_id
    ) select
      coalesce(x.id,gen_random_uuid()),v_trip.id,x.type,x.title,x.date,x.starts_at,x.ends_at,
      coalesce(x.start_zone,p_timezone),coalesce(x.end_zone,p_timezone),x.check_in,x.check_out,
      coalesce(x.location,''),coalesce(x.address,''),coalesce(x.map_url,''),coalesce(x.origin,''),
      coalesce(x.destination,''),coalesce(x.mode,''),coalesce(x.flight_number,''),coalesce(x.operator,''),
      coalesce(x.provider,''),coalesce(x.booking_status,'not_booked'),coalesce(x.booking_reference,''),
      coalesce(x.booking_url,''),coalesce(x.preparation,'to_prepare'),coalesce(x.attention,''),
      coalesce(x.overnight,false),coalesce(x.journey_id,'')
    from jsonb_populate_record(null::public.thailand_itinerary_items,v_entry) x;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(v_entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_entry) k where k not in ('id','item_id','title','details','due_date','done','position')
    ) then raise exception using errcode = '22023', message = 'invalid_task_import_fields'; end if;
    insert into public.thailand_tasks(id,trip_id,item_id,title,details,due_date,done,position)
    select coalesce(x.id,gen_random_uuid()),v_trip.id,x.item_id,x.title,coalesce(x.details,''),
      x.due_date,coalesce(x.done,false),coalesce(x.position,0)
    from jsonb_populate_record(null::public.thailand_tasks,v_entry) x;
  end loop;
  for v_entry in select value from jsonb_array_elements(p_notes) loop
    if jsonb_typeof(v_entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(v_entry) k where k not in ('id','item_id','body')
    ) then raise exception using errcode = '22023', message = 'invalid_note_import_fields'; end if;
    insert into public.thailand_notes(id,trip_id,item_id,body)
    select coalesce(x.id,gen_random_uuid()),v_trip.id,x.item_id,x.body
    from jsonb_populate_record(null::public.thailand_notes,v_entry) x;
  end loop;
  return to_jsonb(v_trip);
end;
$$;

create function public.thailand_claim_content(p_table text,p_id uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_trip uuid;
  v_version integer;
  v_paths text[];
  v_claim thailand_private.thailand_deletion_claims;
  v_owner uuid := auth.uid();
begin
  if v_owner is null or not thailand_private.thailand_is_member() then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_table not in ('thailand_itinerary_items','thailand_attachments') or p_table is null or p_version is null or p_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_deletion_request';
  end if;
  select * into v_claim from thailand_private.thailand_deletion_claims
    where target_table=p_table and target_id=p_id and owner_id=v_owner;
  if found then
    if v_claim.target_version <> p_version then raise exception using errcode='40001',message='version_conflict'; end if;
    return jsonb_build_object('claim_id',v_claim.id,'paths',v_claim.paths,'completed',v_claim.completed_at is not null);
  end if;
  if p_table = 'thailand_itinerary_items' then
    select trip_id into v_trip from public.thailand_itinerary_items where id=p_id;
  else
    select trip_id into v_trip from public.thailand_attachments where id=p_id;
  end if;
  if v_trip is null or not thailand_private.thailand_owns_trip(v_trip) then
    raise exception using errcode='P0002',message='content_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:trip:' || v_trip::text,0));
  select * into v_claim from thailand_private.thailand_deletion_claims
    where target_table=p_table and target_id=p_id and owner_id=v_owner;
  if found then
    if v_claim.target_version <> p_version then raise exception using errcode='40001',message='version_conflict'; end if;
    return jsonb_build_object('claim_id',v_claim.id,'paths',v_claim.paths,'completed',v_claim.completed_at is not null);
  end if;
  if p_table = 'thailand_itinerary_items' then
    select version into v_version from public.thailand_itinerary_items where id=p_id for update;
    if exists (
      select 1 from thailand_private.thailand_deletion_claims c join public.thailand_attachments a on a.id=c.target_id
      where c.target_table='thailand_attachments' and c.completed_at is null and a.item_id=p_id
    ) then raise exception using errcode='55000',message='dependent_deletion_in_progress'; end if;
    select coalesce(array_agg(path order by path),'{}'::text[]) into v_paths
      from public.thailand_attachments where item_id=p_id and trip_id=v_trip;
  else
    select version into v_version from public.thailand_attachments where id=p_id for update;
    if exists (select 1 from public.thailand_attachments a where a.id=p_id
      and thailand_private.thailand_is_claimed(a.trip_id,a.item_id,a.id)) then
      raise exception using errcode='55000',message='parent_deletion_in_progress';
    end if;
    select array[path] into v_paths from public.thailand_attachments where id=p_id;
  end if;
  if v_version is null then raise exception using errcode='P0002',message='content_not_found'; end if;
  if v_version <> p_version then raise exception using errcode='40001',message='version_conflict'; end if;
  insert into thailand_private.thailand_deletion_claims(owner_id,trip_id,target_table,target_id,target_version,paths)
    values(v_owner,v_trip,p_table,p_id,p_version,v_paths) returning * into v_claim;
  return jsonb_build_object('claim_id',v_claim.id,'paths',v_claim.paths,'completed',false);
end;
$$;

create function public.thailand_finalize_content_deletion(p_claim_id uuid,p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c thailand_private.thailand_deletion_claims;
begin
  if not exists (select 1 from thailand_private.thailand_config where account_id=p_owner_id) then
    raise exception using errcode='42501',message='account_not_allowed';
  end if;
  select * into c from thailand_private.thailand_deletion_claims where id=p_claim_id and owner_id=p_owner_id;
  if not found then raise exception using errcode='P0002',message='claim_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:trip:' || c.trip_id::text,0));
  select * into c from thailand_private.thailand_deletion_claims where id=p_claim_id for update;
  if exists (select 1 from storage.objects where bucket_id='thailand-documents' and name=any(c.paths)) then
    raise exception using errcode='55000',message='storage_cleanup_required';
  end if;
  if c.completed_at is not null then return jsonb_build_object('deleted',true); end if;
  insert into thailand_private.thailand_finalizations(transaction_id,trip_id) values(pg_current_xact_id(),c.trip_id);
  if c.target_table='thailand_itinerary_items' then
    delete from public.thailand_notes where trip_id=c.trip_id and item_id=c.target_id;
    delete from public.thailand_tasks where trip_id=c.trip_id and item_id=c.target_id;
    delete from public.thailand_attachments where trip_id=c.trip_id and item_id=c.target_id;
    delete from public.thailand_itinerary_items where id=c.target_id and version=c.target_version;
  else
    delete from public.thailand_attachments where id=c.target_id and version=c.target_version;
  end if;
  if not found then raise exception using errcode='40001',message='version_conflict'; end if;
  update thailand_private.thailand_deletion_claims set completed_at=now() where id=c.id;
  delete from thailand_private.thailand_finalizations where transaction_id=pg_current_xact_id();
  return jsonb_build_object('deleted',true);
end;
$$;

create table thailand_private.thailand_login_attempts (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
revoke all on thailand_private.thailand_login_attempts from public,anon,authenticated;
create function public.thailand_consume_shared_login_attempt(p_ip_key text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_key text;
  v_window integer;
  v_limit integer;
  v_row thailand_private.thailand_login_attempts;
  v_retry integer := 0;
begin
  if p_ip_key is null or p_ip_key !~ '^[a-zA-Z0-9_-]{1,128}$' then
    raise exception using errcode='22023',message='invalid_throttle_key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('thailand:login_throttle',0));
  delete from thailand_private.thailand_login_attempts where window_start < v_now - interval '1 day';
  for v_key,v_window,v_limit in
    select * from (values ('global:minute',60,20),('global:hour',3600,100),('ip:' || p_ip_key,900,5)) limits(k,w,l)
  loop
    insert into thailand_private.thailand_login_attempts(key,window_start,attempts) values(v_key,v_now,1)
    on conflict(key) do update set
      window_start=case when thailand_private.thailand_login_attempts.window_start + make_interval(secs=>v_window)<=v_now
        then v_now else thailand_private.thailand_login_attempts.window_start end,
      attempts=case when thailand_private.thailand_login_attempts.window_start + make_interval(secs=>v_window)<=v_now
        then 1 else least(thailand_private.thailand_login_attempts.attempts+1,1000000) end
    returning * into v_row;
    if v_row.attempts>v_limit then
      v_retry:=greatest(v_retry,ceil(extract(epoch from (v_row.window_start+make_interval(secs=>v_window)-v_now)))::integer);
    end if;
  end loop;
  return jsonb_build_object('allowed',v_retry=0,'retry_after',v_retry);
end;
$$;

revoke all on all functions in schema thailand_private from public,anon,authenticated;
-- Anonymous Storage requests need these boolean helpers for the restrictive
-- fence to evaluate FALSE rather than raising a permission error on other buckets.
grant usage on schema thailand_private to anon;
grant execute on function thailand_private.thailand_can_read(text),
  thailand_private.thailand_can_upload(text) to anon,authenticated;
grant execute on function thailand_private.thailand_is_member(),
  thailand_private.thailand_owns_trip(uuid),thailand_private.thailand_is_claimed(uuid,uuid,uuid) to authenticated;
revoke all on function public.thailand_initialize_trip(text,date,date,text,jsonb,jsonb,jsonb),
  public.thailand_claim_content(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.thailand_initialize_trip(text,date,date,text,jsonb,jsonb,jsonb),
  public.thailand_claim_content(text,uuid,integer) to authenticated;
revoke all on function public.thailand_finalize_content_deletion(uuid,uuid),
  public.thailand_consume_shared_login_attempt(text),public.thailand_shared_account_id() from public,anon,authenticated;
grant execute on function public.thailand_finalize_content_deletion(uuid,uuid),
  public.thailand_consume_shared_login_attempt(text),public.thailand_shared_account_id() to service_role;
commit;
