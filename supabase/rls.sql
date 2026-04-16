-- Enable RLS and restrict rows to their owner.

alter table public.articles enable row level security;
alter table public.highlights enable row level security;
alter table public.quick_cards enable row level security;
alter table public.perses_settings enable row level security;

-- Articles
drop policy if exists articles_select_own on public.articles;
create policy articles_select_own on public.articles
for select using (user_id = auth.uid());

drop policy if exists articles_insert_own on public.articles;
create policy articles_insert_own on public.articles
for insert with check (user_id = auth.uid());

drop policy if exists articles_update_own on public.articles;
create policy articles_update_own on public.articles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Highlights
drop policy if exists highlights_select_own on public.highlights;
create policy highlights_select_own on public.highlights
for select using (user_id = auth.uid());

drop policy if exists highlights_insert_own on public.highlights;
create policy highlights_insert_own on public.highlights
for insert with check (user_id = auth.uid());

drop policy if exists highlights_update_own on public.highlights;
create policy highlights_update_own on public.highlights
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Quick cards
drop policy if exists quick_cards_select_own on public.quick_cards;
create policy quick_cards_select_own on public.quick_cards
for select using (user_id = auth.uid());

drop policy if exists quick_cards_insert_own on public.quick_cards;
create policy quick_cards_insert_own on public.quick_cards
for insert with check (user_id = auth.uid());

drop policy if exists quick_cards_update_own on public.quick_cards;
create policy quick_cards_update_own on public.quick_cards
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Perses settings
drop policy if exists perses_settings_select_own on public.perses_settings;
create policy perses_settings_select_own on public.perses_settings
for select using (user_id = auth.uid());

drop policy if exists perses_settings_insert_own on public.perses_settings;
create policy perses_settings_insert_own on public.perses_settings
for insert with check (user_id = auth.uid());

drop policy if exists perses_settings_update_own on public.perses_settings;
create policy perses_settings_update_own on public.perses_settings
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

