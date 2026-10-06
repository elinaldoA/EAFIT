-- Modelos de mensagem do Broadcast (Comunicação → Enviar notificação): o admin
-- salva títulos/textos usados com frequência e reaproveita no formulário.
create table if not exists public.broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.broadcast_templates enable row level security;

drop policy if exists "admin full access" on public.broadcast_templates;
create policy "admin full access" on public.broadcast_templates
  for all using (public.is_admin()) with check (public.is_admin());
