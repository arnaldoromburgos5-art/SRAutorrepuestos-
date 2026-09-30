-- SR Autorrepuestos — claves privadas cargadas desde el panel (p. ej. la clave del asistente de IA).
-- Sin políticas RLS: sólo el servidor (service role) puede leerla o escribirla. Los valores se guardan cifrados.

create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
