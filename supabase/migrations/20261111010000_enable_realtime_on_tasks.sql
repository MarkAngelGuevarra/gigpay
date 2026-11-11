-- Push task inserts/updates to open pages (Supabase Realtime), so a freelancer sees the client's newly
-- funded task without reloading. Row Level Security still decides which rows each viewer receives.
-- Applied Nov 11, 2026 after the pre-onboarding QA review found the tasks table missing from the
-- supabase_realtime publication (the app subscribed, but no events were ever sent).
alter publication supabase_realtime add table public.tasks;
