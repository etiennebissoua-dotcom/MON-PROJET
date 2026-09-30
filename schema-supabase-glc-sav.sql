-- =====================================================================
-- GLC SARL — Application SAV — Schéma de base de données (Supabase/Postgres)
-- =====================================================================

-- Extension nécessaire pour générer des identifiants uniques (uuid)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Table CLIENTS
-- ---------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text not null,
  email text,
  adresse text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Table APPAREILS
-- ---------------------------------------------------------------------
create table appareils (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  type text not null check (type in ('telephone','ordi_portable','ordi_bureau','tablette','autre')),
  marque text not null,
  modele text,
  numero_serie text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Table REPARATIONS (tickets)
-- ---------------------------------------------------------------------
create table reparations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                     -- ex: GLC-2026-0001
  client_id uuid not null references clients(id) on delete restrict,
  appareil_id uuid not null references appareils(id) on delete restrict,
  panne_declaree text not null,
  diagnostic text,
  statut text not null default 'Reçu' check (statut in ('Reçu','En cours','Prêt','Livré','Annulé')),
  technicien text,
  date_reception date not null default current_date,
  date_estimee date,
  montant_devis numeric(12,0) default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- Historique des changements de statut (une ligne par changement)
create table reparation_historique (
  id uuid primary key default gen_random_uuid(),
  reparation_id uuid not null references reparations(id) on delete cascade,
  statut text not null,
  date timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Table FACTURES / DEVIS
-- ---------------------------------------------------------------------
create table factures (
  id uuid primary key default gen_random_uuid(),
  reparation_id uuid not null references reparations(id) on delete cascade,
  type text not null check (type in ('devis','facture')),
  statut_paiement text not null default 'Non payé' check (statut_paiement in ('Non payé','Partiel','Payé')),
  total numeric(12,0) not null default 0,
  date timestamptz not null default now()
);

-- Lignes de détail d'une facture/devis
create table facture_lignes (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references factures(id) on delete cascade,
  designation text not null,
  quantite numeric(10,2) not null default 1,
  prix_unitaire numeric(12,0) not null default 0
);

-- ---------------------------------------------------------------------
-- Numérotation automatique des tickets (GLC-AAAA-0000)
-- ---------------------------------------------------------------------
create sequence reparation_seq start 1;

create or replace function generate_reparation_code()
returns trigger as $$
begin
  new.code := 'GLC-' || extract(year from now())::text || '-' || lpad(nextval('reparation_seq')::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger trg_generate_code
before insert on reparations
for each row
when (new.code is null)
execute function generate_reparation_code();

-- Historisation automatique à chaque changement de statut
create or replace function log_statut_change()
returns trigger as $$
begin
  if (TG_OP = 'INSERT') then
    insert into reparation_historique(reparation_id, statut) values (new.id, new.statut);
  elsif (TG_OP = 'UPDATE' and new.statut is distinct from old.statut) then
    insert into reparation_historique(reparation_id, statut) values (new.id, new.statut);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_log_statut
after insert or update on reparations
for each row
execute function log_statut_change();

-- ---------------------------------------------------------------------
-- Index utiles pour les recherches fréquentes
-- ---------------------------------------------------------------------
create index idx_reparations_statut on reparations(statut);
create index idx_reparations_client on reparations(client_id);
create index idx_appareils_client on appareils(client_id);
create index idx_clients_telephone on clients(telephone);

-- ---------------------------------------------------------------------
-- Sécurité (Row Level Security) — à affiner à l'étape "authentification"
-- Pour l'instant : lecture/écriture ouvertes le temps du développement.
-- ---------------------------------------------------------------------
alter table clients enable row level security;
alter table appareils enable row level security;
alter table reparations enable row level security;
alter table reparation_historique enable row level security;
alter table factures enable row level security;
alter table facture_lignes enable row level security;

create policy "dev_open_clients" on clients for all using (true) with check (true);
create policy "dev_open_appareils" on appareils for all using (true) with check (true);
create policy "dev_open_reparations" on reparations for all using (true) with check (true);
create policy "dev_open_historique" on reparation_historique for all using (true) with check (true);
create policy "dev_open_factures" on factures for all using (true) with check (true);
create policy "dev_open_lignes" on facture_lignes for all using (true) with check (true);
