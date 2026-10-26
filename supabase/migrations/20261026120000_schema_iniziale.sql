-- =====================================================================
-- Dieta — schema iniziale
-- Ogni tabella ha user_id (default auth.uid()) e Row Level Security:
-- solo l'utente loggato proprietario può leggere e scrivere le sue righe.
-- Nessun accesso per il ruolo anon.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------
create type public.tipo_pasto as enum (
  'colazione', 'spuntino', 'pranzo', 'merenda', 'pre_allenamento', 'cena', 'extra', 'uscita'
);

-- Funzione comune per aggiornare updated_at
create or replace function public.imposta_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Impostazioni e obiettivi (una riga per utente)
-- ---------------------------------------------------------------------
create table public.impostazioni (
  user_id                  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kcal_obiettivo           integer      not null default 1350 check (kcal_obiettivo between 500 and 6000),
  proteine_obiettivo_g     numeric(6,1) not null default 135  check (proteine_obiettivo_g >= 0),
  carboidrati_obiettivo_g  numeric(6,1) not null default 100  check (carboidrati_obiettivo_g >= 0),
  grassi_obiettivo_g       numeric(6,1) not null default 45   check (grassi_obiettivo_g >= 0),
  acqua_obiettivo_bicchieri smallint    not null default 8    check (acqua_obiettivo_bicchieri between 1 and 40),
  bicchiere_ml             smallint     not null default 250  check (bicchiere_ml between 50 and 1000),
  passi_obiettivo          integer               default 8000 check (passi_obiettivo >= 0),
  -- giorni di allenamento abituali, ISO: 1 = lunedì … 7 = domenica
  giorni_allenamento       smallint[]   not null default '{}'
                           check (giorni_allenamento <@ array[1,2,3,4,5,6,7]::smallint[]),
  created_at               timestamptz  not null default now(),
  updated_at               timestamptz  not null default now()
);
create trigger impostazioni_updated_at before update on public.impostazioni
  for each row execute function public.imposta_updated_at();

-- ---------------------------------------------------------------------
-- Alimenti salvati (valori per 100 g)
-- ---------------------------------------------------------------------
create table public.alimenti (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome              text not null check (length(trim(nome)) > 0),
  marca             text,
  codice_barre      text check (codice_barre ~ '^[0-9]{6,14}$'),
  kcal_100g         numeric(6,1) not null check (kcal_100g >= 0),
  proteine_100g     numeric(5,1) not null default 0 check (proteine_100g >= 0),
  carboidrati_100g  numeric(5,1) not null default 0 check (carboidrati_100g >= 0),
  grassi_100g       numeric(5,1) not null default 0 check (grassi_100g >= 0),
  porzione_g        numeric(6,1) check (porzione_g > 0),          -- porzione abituale
  porzione_nome     text,                                         -- es. "1 vasetto", "2 cracker"
  fonte             text not null default 'manuale' check (fonte in ('manuale', 'openfoodfacts')),
  preferito         boolean not null default false,
  archiviato        boolean not null default false,               -- nascosto dagli elenchi, ma il diario resta
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, codice_barre)
);
create index alimenti_user_nome_idx on public.alimenti (user_id, lower(nome));
create trigger alimenti_updated_at before update on public.alimenti
  for each row execute function public.imposta_updated_at();

-- ---------------------------------------------------------------------
-- Ricette e ingredienti
-- ---------------------------------------------------------------------
create table public.ricette (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  porzioni      numeric(4,1) not null default 1 check (porzioni > 0),
  procedimento  text,
  tempo_minuti  smallint check (tempo_minuti >= 0),
  note          text,
  archiviata    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ricette_user_idx on public.ricette (user_id);
create trigger ricette_updated_at before update on public.ricette
  for each row execute function public.imposta_updated_at();

create table public.ricetta_ingredienti (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ricetta_id   uuid not null references public.ricette (id) on delete cascade,
  alimento_id  uuid not null references public.alimenti (id) on delete restrict,
  grammi       numeric(7,1) not null check (grammi > 0),
  nota         text,                       -- es. "a crudo", "sgocciolato"
  ordine       smallint not null default 0
);
create index ricetta_ingredienti_ricetta_idx on public.ricetta_ingredienti (ricetta_id);
create index ricetta_ingredienti_alimento_idx on public.ricetta_ingredienti (alimento_id);

-- ---------------------------------------------------------------------
-- Drink per le uscite (calorie già pronte)
-- ---------------------------------------------------------------------
create table public.bevande (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome            text not null check (length(trim(nome)) > 0),
  quantita_ml     smallint check (quantita_ml > 0),
  kcal            numeric(6,1) not null check (kcal >= 0),
  proteine_g      numeric(5,1) not null default 0 check (proteine_g >= 0),
  carboidrati_g   numeric(5,1) not null default 0 check (carboidrati_g >= 0),
  grassi_g        numeric(5,1) not null default 0 check (grassi_g >= 0),
  ordine          smallint not null default 0,
  archiviata      boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (user_id, nome)
);

-- ---------------------------------------------------------------------
-- Piano settimanale
-- piano_pasti: un pasto per giorno della settimana (es. lunedì / pranzo)
-- piano_voci:  cosa c'è dentro (alimenti con grammi o ricette con porzioni)
-- ---------------------------------------------------------------------
create table public.piano_pasti (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  giorno_settimana   smallint not null check (giorno_settimana between 1 and 7),  -- 1 = lunedì
  pasto              public.tipo_pasto not null check (pasto not in ('extra', 'uscita')),
  nome               text,                      -- titolo breve, es. "Pasta al tonno"
  solo_allenamento   boolean not null default false,  -- es. cracker pre-allenamento
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, giorno_settimana, pasto)
);
create trigger piano_pasti_updated_at before update on public.piano_pasti
  for each row execute function public.imposta_updated_at();

create table public.piano_voci (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  piano_pasto_id  uuid not null references public.piano_pasti (id) on delete cascade,
  alimento_id     uuid references public.alimenti (id) on delete restrict,
  ricetta_id      uuid references public.ricette (id) on delete restrict,
  grammi          numeric(7,1) check (grammi > 0),
  porzioni        numeric(4,2) check (porzioni > 0),
  ordine          smallint not null default 0,
  check (
    (alimento_id is not null and ricetta_id is null and grammi is not null)
    or
    (ricetta_id is not null and alimento_id is null and porzioni is not null)
  )
);
create index piano_voci_pasto_idx on public.piano_voci (piano_pasto_id);

-- ---------------------------------------------------------------------
-- Giornate: allenamento sì/no e scambi di pasto per una data precisa
-- ---------------------------------------------------------------------
create table public.giornate (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data         date not null,
  allenamento  boolean,          -- null = usa i giorni abituali delle impostazioni
  note         text,
  primary key (user_id, data)
);

-- "Oggi a pranzo mangio il pranzo del giovedì": per quella data e quel pasto
-- si usa il piano_pasto indicato al posto di quello del giorno.
create table public.scambi_pasto (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data            date not null,
  pasto           public.tipo_pasto not null check (pasto not in ('extra', 'uscita')),
  piano_pasto_id  uuid not null references public.piano_pasti (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, data, pasto)
);

-- ---------------------------------------------------------------------
-- Diario: cosa è stato mangiato davvero.
-- I valori (kcal e macro) sono SALVATI al momento dell'inserimento:
-- se poi modifico un alimento o una ricetta, il passato non cambia.
-- ---------------------------------------------------------------------
create table public.diario (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data             date not null,
  pasto            public.tipo_pasto not null,
  alimento_id      uuid references public.alimenti (id) on delete set null,
  ricetta_id       uuid references public.ricette (id) on delete set null,
  bevanda_id       uuid references public.bevande (id) on delete set null,
  piano_pasto_id   uuid references public.piano_pasti (id) on delete set null,
  descrizione      text not null,                 -- nome salvato, es. "Yogurt greco 0%"
  grammi           numeric(7,1) check (grammi > 0),
  porzioni         numeric(4,2) check (porzioni > 0),
  kcal             numeric(6,1) not null default 0 check (kcal >= 0),
  proteine_g       numeric(6,1) not null default 0 check (proteine_g >= 0),
  carboidrati_g    numeric(6,1) not null default 0 check (carboidrati_g >= 0),
  grassi_g         numeric(6,1) not null default 0 check (grassi_g >= 0),
  fatto            boolean not null default true,
  dal_piano        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (num_nonnulls(alimento_id, ricetta_id, bevanda_id) <= 1)
);
create index diario_user_data_idx on public.diario (user_id, data);
create trigger diario_updated_at before update on public.diario
  for each row execute function public.imposta_updated_at();

-- ---------------------------------------------------------------------
-- Misure e contatori giornalieri
-- ---------------------------------------------------------------------
create table public.peso (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        date not null,
  kg          numeric(5,2) not null check (kg between 25 and 300),
  nota        text,
  created_at  timestamptz not null default now(),
  unique (user_id, data)                       -- un inserimento al giorno (al mattino)
);

create table public.punto_vita (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        date not null,
  cm          numeric(5,1) not null check (cm between 30 and 250),
  nota        text,
  created_at  timestamptz not null default now(),
  unique (user_id, data)
);

create table public.acqua (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       date not null,
  bicchieri  smallint not null default 0 check (bicchieri between 0 and 60),
  updated_at timestamptz not null default now(),
  primary key (user_id, data)
);
create trigger acqua_updated_at before update on public.acqua
  for each row execute function public.imposta_updated_at();

create table public.passi (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       date not null,
  passi      integer not null check (passi between 0 and 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, data)
);
create trigger passi_updated_at before update on public.passi
  for each row execute function public.imposta_updated_at();

-- ---------------------------------------------------------------------
-- Lista della spesa (per settimana, settimana = lunedì)
-- ---------------------------------------------------------------------
create table public.spesa_voci (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  settimana    date not null check (extract(isodow from settimana) = 1),
  nome         text not null check (length(trim(nome)) > 0),
  quantita     text,                         -- es. "500 g", "2 confezioni"
  categoria    text,                         -- es. "frutta e verdura"
  alimento_id  uuid references public.alimenti (id) on delete set null,
  spuntata     boolean not null default false,
  ordine       smallint not null default 0,
  created_at   timestamptz not null default now()
);
create index spesa_voci_user_settimana_idx on public.spesa_voci (user_id, settimana);

-- ---------------------------------------------------------------------
-- Viste di calcolo (security_invoker: rispettano la RLS dell'utente)
-- ---------------------------------------------------------------------
create view public.ricette_macro with (security_invoker = true) as
select
  r.id                                   as ricetta_id,
  r.user_id,
  r.nome,
  r.porzioni,
  round(coalesce(sum(a.kcal_100g        * i.grammi / 100), 0), 1) as kcal_totali,
  round(coalesce(sum(a.kcal_100g        * i.grammi / 100), 0) / r.porzioni, 1) as kcal_porzione,
  round(coalesce(sum(a.proteine_100g    * i.grammi / 100), 0) / r.porzioni, 1) as proteine_porzione_g,
  round(coalesce(sum(a.carboidrati_100g * i.grammi / 100), 0) / r.porzioni, 1) as carboidrati_porzione_g,
  round(coalesce(sum(a.grassi_100g      * i.grammi / 100), 0) / r.porzioni, 1) as grassi_porzione_g,
  coalesce(sum(i.grammi), 0)                                         as grammi_totali
from public.ricette r
left join public.ricetta_ingredienti i on i.ricetta_id = r.id
left join public.alimenti a on a.id = i.alimento_id
group by r.id;

create view public.peso_settimanale with (security_invoker = true) as
select
  user_id,
  date_trunc('week', data::timestamp)::date  as settimana,   -- lunedì
  round(avg(kg), 2)               as media_kg,
  min(kg)                         as min_kg,
  max(kg)                         as max_kg,
  count(*)                        as misure
from public.peso
group by user_id, date_trunc('week', data::timestamp);

-- ---------------------------------------------------------------------
-- Row Level Security su TUTTE le tabelle
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'impostazioni', 'alimenti', 'ricette', 'ricetta_ingredienti', 'bevande',
    'piano_pasti', 'piano_voci', 'giornate', 'scambi_pasto', 'diario',
    'peso', 'punto_vita', 'acqua', 'passi', 'spesa_voci'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "solo_proprietaria" on public.%I as permissive for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
    -- difesa in profondità: il ruolo anonimo non ha nessun permesso
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end;
$$;

revoke all on public.ricette_macro    from anon;
revoke all on public.peso_settimanale from anon;

-- Le tabelle create in futuro in public non saranno accessibili ad anon
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ---------------------------------------------------------------------
-- Inizializzazione utente: impostazioni + drink pronti
-- ---------------------------------------------------------------------
create or replace function public.inizializza_utente(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.impostazioni (user_id) values (uid)
  on conflict (user_id) do nothing;

  -- valori indicativi per porzione standard
  insert into public.bevande (user_id, nome, quantita_ml, kcal, carboidrati_g, ordine) values
    (uid, 'Calice di vino rosso',    150, 125, 4,  1),
    (uid, 'Calice di vino bianco',   150, 120, 4,  2),
    (uid, 'Calice di prosecco',      125,  90, 2,  3),
    (uid, 'Spritz Aperol',           200, 150, 14, 4),
    (uid, 'Hugo',                    200, 150, 14, 5),
    (uid, 'Gin tonic',               250, 170, 15, 6),
    (uid, 'Negroni',                  90, 200, 15, 7),
    (uid, 'Mojito',                  250, 210, 25, 8),
    (uid, 'Birra piccola (20 cl)',   200,  85, 7,  9),
    (uid, 'Birra media (40 cl)',     400, 170, 14, 10),
    (uid, 'Analcolico alla frutta',  200, 110, 26, 11)
  on conflict (user_id, nome) do nothing;
end;
$$;

revoke all on function public.inizializza_utente(uuid) from public, anon, authenticated;

create or replace function public.nuovo_utente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.inizializza_utente(new.id);
  return new;
end;
$$;

revoke all on function public.nuovo_utente() from public, anon, authenticated;

create trigger alla_creazione_utente
  after insert on auth.users
  for each row execute function public.nuovo_utente();

-- Se l'utente esiste già quando la migrazione viene applicata
select public.inizializza_utente(id) from auth.users;
