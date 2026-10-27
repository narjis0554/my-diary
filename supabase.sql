-- my-diary 데이터베이스 설정
-- Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run 한 번이면 끝.

-- ── 1. 사람(프로필) ──
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar_url text,
  color text not null default '#0f7a5c',   -- 캘린더에서 이 사람 일정의 색
  created_at timestamptz not null default now()
);

-- 구글로 처음 로그인하면 프로필을 자동으로 만들고 색을 하나 골라줌
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    (array['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#d6336c', '#5f3dc4'])[1 + floor(random() * 8)::int]
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. 일정 ──
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  date date not null,
  start_time time,            -- 비어 있으면 종일 일정
  end_time time,
  memo text check (char_length(memo) <= 1000),
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_date_idx on public.events (date);

-- ── 3. 다이어리 (사람당 하루 1개) ──
create table public.diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  breakfast text,
  lunch text,
  dinner text,
  snack text,
  water_ml int not null default 0 check (water_ml between 0 and 10000),   -- 마신 물 (ml)
  exercise text,
  exercise_min int check (exercise_min between 0 and 1440),          -- 분
  mood text,
  note text check (char_length(note) <= 1000),
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ── 4. 보안 규칙(RLS): 공개된 것 또는 내 것만 보이고, 고치는 건 내 것만 ──
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.diary enable row level security;

create policy "로그인한 사람은 프로필 보기" on public.profiles
  for select to authenticated using (true);
create policy "내 프로필만 수정" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "공개 일정이나 내 일정 보기" on public.events
  for select to authenticated using (is_public or (select auth.uid()) = user_id);
create policy "내 일정 추가" on public.events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "내 일정 수정" on public.events
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "내 일정 삭제" on public.events
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "공개 기록이나 내 기록 보기" on public.diary
  for select to authenticated using (is_public or (select auth.uid()) = user_id);
create policy "내 기록 추가" on public.diary
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "내 기록 수정" on public.diary
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "내 기록 삭제" on public.diary
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.events, public.diary to authenticated;
