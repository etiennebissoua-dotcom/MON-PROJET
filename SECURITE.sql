-- =====================================================================
-- GLC SARL — Atelier SAV : verrouillage de la base (auth + RLS)
-- À exécuter UNE FOIS dans Supabase > SQL Editor sur le projet existant.
-- Aucune donnée n'est supprimée.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rôles de l'équipe (jamais dans une table de profils : table dédiée)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'technicien');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

drop policy if exists "read own roles" on public.user_roles;
create policy "read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid())
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Fermeture de l'accès anonyme + RLS "équipe uniquement"
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','appareils','reparations','reparation_historique','factures','facture_lignes']
  loop
    -- plus aucun accès direct pour les visiteurs non connectés
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format(
      'create policy "staff full access" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    -- suppression d'éventuelles anciennes policies ouvertes
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "Enable read access for all users" on public.%I', t);
    execute format('drop policy if exists "allow all" on public.%I', t);
  end loop;
end $$;

revoke usage on schema public from anon;
grant usage on schema public to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Suivi client : une seule fonction publique, code ticket + téléphone
--    Le client ne peut lire QUE son propre ticket, jamais la table.
-- ---------------------------------------------------------------------
create or replace function public.suivi_reparation(p_code text, p_tel text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rep public.reparations;
  v_client public.clients;
  v_tel text := regexp_replace(coalesce(p_tel, ''), '\D', '', 'g');
  v_result jsonb;
begin
  if length(v_tel) < 6 or coalesce(p_code, '') = '' then
    return null;
  end if;

  select * into v_rep from public.reparations
   where upper(code) = upper(trim(p_code)) limit 1;
  if not found then return null; end if;

  select * into v_client from public.clients where id = v_rep.client_id;
  if not found then return null; end if;

  -- vérification : les 8 derniers chiffres du téléphone doivent correspondre
  if right(regexp_replace(coalesce(v_client.telephone, ''), '\D', '', 'g'), 8)
     <> right(v_tel, 8) then
    return null;
  end if;

  select jsonb_build_object(
    'reparation', to_jsonb(v_rep),
    -- on n'expose que le prénom/nom, pas l'adresse ni l'email
    'client', jsonb_build_object('id', v_client.id, 'nom', v_client.nom,
                                 'telephone', v_client.telephone),
    'appareil', (select to_jsonb(a) from public.appareils a where a.id = v_rep.appareil_id),
    'historique', coalesce((select jsonb_agg(to_jsonb(h) order by h.date)
                            from public.reparation_historique h
                            where h.reparation_id = v_rep.id), '[]'::jsonb),
    'factures', coalesce((select jsonb_agg(
        to_jsonb(f) || jsonb_build_object('lignes', coalesce((
          select jsonb_agg(to_jsonb(l)) from public.facture_lignes l
           where l.facture_id = f.id), '[]'::jsonb)))
        from public.factures f where f.reparation_id = v_rep.id), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.suivi_reparation(text, text) from public;
grant execute on function public.suivi_reparation(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Numérotation des tickets fiable (fini les doublons GLC-2026-0001)
-- ---------------------------------------------------------------------
create sequence if not exists public.reparation_code_seq;

-- aligne la séquence sur le plus grand numéro déjà utilisé
select setval('public.reparation_code_seq',
  greatest(1, coalesce((select max(nullif(regexp_replace(code, '^.*-', ''), ''))::int
                        from public.reparations), 0)), true);

create or replace function public.set_reparation_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'GLC-' || to_char(now(), 'YYYY') || '-' ||
                lpad(nextval('public.reparation_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_set_reparation_code on public.reparations;
create trigger trg_set_reparation_code
  before insert on public.reparations
  for each row execute function public.set_reparation_code();

-- ---------------------------------------------------------------------
-- 5. Historique de statut automatique (traçabilité fiable)
-- ---------------------------------------------------------------------
create or replace function public.log_reparation_statut()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.statut is distinct from old.statut then
    insert into public.reparation_historique (reparation_id, statut, date)
    values (new.id, new.statut, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_log_reparation_statut on public.reparations;
create trigger trg_log_reparation_statut
  after insert or update of statut on public.reparations
  for each row execute function public.log_reparation_statut();

-- ---------------------------------------------------------------------
-- 6. Créer les comptes de l'équipe
--    a) Supabase > Authentication > Users > "Add user" (email + mot de passe)
--    b) puis, pour chaque compte créé :
-- ---------------------------------------------------------------------
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where email = 'patron@glc.cm'
-- on conflict do nothing;
--
-- insert into public.user_roles (user_id, role)
-- select id, 'technicien' from auth.users where email = 'tech1@glc.cm'
-- on conflict do nothing;
