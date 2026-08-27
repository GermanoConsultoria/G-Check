-- ============================================================================
-- G-check — setup completo do banco (Supabase)
-- ----------------------------------------------------------------------------
-- Consolida as 4 migrations de supabase/migrations/ num único script idempotente
-- (pode rodar mais de uma vez sem quebrar).
--
-- Rode no SQL Editor do projeto NOVO (ref: mfcixcqopedcddbbvvmk), nesta ordem:
--   1. Extensões
--   2. Schema (tabelas, funções, triggers)
--   3. RLS (políticas)
--   4. Dados  -> por padrão usa o seed de demonstração; troque pela Opção B
--                (apêndice no fim do arquivo) para trazer os dados reais.
--   5. Admin  -> passo manual, depois de criar o usuário no Auth.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSÕES
-- ============================================================================
create extension if not exists pgcrypto;


-- ============================================================================
-- 2. SCHEMA
-- ============================================================================

create table if not exists checklists (
  id text primary key,
  nome text not null,
  setor text not null,
  turno text not null check (turno in ('Manhã', 'Tarde', 'Noite')),
  horario time not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 'ativo' entrou depois (migration 20260824150000); garante a coluna mesmo se a
-- tabela já existir de uma execução anterior deste script.
alter table checklists add column if not exists ativo boolean not null default true;

create table if not exists checklist_items (
  id text primary key,
  checklist_id text not null references checklists (id) on delete cascade,
  titulo text not null,
  detalhe text,
  responsavel text not null,
  status text not null default 'pendente' check (status in ('pendente', 'concluido')),
  posicao integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checklist_items_checklist_id_idx
  on checklist_items (checklist_id);
create index if not exists checklist_items_checklist_id_posicao_idx
  on checklist_items (checklist_id, posicao);

-- Cadastro próprio de setores (migration 20260827120000). Referência usada ao
-- criar/editar checklists; a coluna checklists.setor continua sendo texto livre.
create table if not exists setores (
  id text primary key,
  nome text not null unique,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'funcionario' check (role in ('admin', 'funcionario')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at automático em todo update
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists checklists_set_updated_at on checklists;
create trigger checklists_set_updated_at
  before update on checklists
  for each row execute function set_updated_at();

drop trigger if exists checklist_items_set_updated_at on checklist_items;
create trigger checklist_items_set_updated_at
  before update on checklist_items
  for each row execute function set_updated_at();

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

drop trigger if exists setores_set_updated_at on setores;
create trigger setores_set_updated_at
  before update on setores
  for each row execute function set_updated_at();

-- Cria o profile automaticamente quando um usuário nasce no Auth
-- (usado pela server function que cadastra funcionários com auth.admin.createUser).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', new.email),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'funcionario')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security definer para não recursar RLS ao checar o papel do usuário logado
-- dentro das próprias policies de profiles/checklists/checklist_items.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Funcionário só altera o STATUS de um item, e apenas se for o responsável por
-- ele (comparação por nome, mesmo critério do frontend em
-- src/lib/g-check-store.tsx, função ehResponsavel). Admin altera qualquer campo.
-- (versão final: migration 20260824140000)
create or replace function public.checklist_items_restrict_funcionario_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meu_nome text;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.titulo is distinct from old.titulo
    or new.detalhe is distinct from old.detalhe
    or new.responsavel is distinct from old.responsavel
    or new.posicao is distinct from old.posicao
    or new.checklist_id is distinct from old.checklist_id
  then
    raise exception 'Apenas administradores podem editar os itens da checklist.';
  end if;

  if new.status is distinct from old.status then
    select nome into meu_nome from public.profiles where id = auth.uid();

    if meu_nome is null or lower(trim(meu_nome)) is distinct from lower(trim(old.responsavel)) then
      raise exception 'Você só pode marcar itens atribuídos a você.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists checklist_items_restrict_funcionario_update on checklist_items;
create trigger checklist_items_restrict_funcionario_update
  before update on checklist_items
  for each row execute function public.checklist_items_restrict_funcionario_update();


-- ============================================================================
-- 3. RLS (políticas)
-- ============================================================================

alter table checklists enable row level security;
alter table checklist_items enable row level security;
alter table profiles enable row level security;
alter table setores enable row level security;

-- Limpa qualquer política anterior (inclui o "anon full access" da 1ª migration,
-- que liberava acesso sem login).
drop policy if exists "anon full access" on checklists;
drop policy if exists "anon full access" on checklist_items;
drop policy if exists "autenticados veem checklists" on checklists;
drop policy if exists "admin cria checklists" on checklists;
drop policy if exists "admin atualiza checklists" on checklists;
drop policy if exists "admin remove checklists" on checklists;
drop policy if exists "autenticados veem itens" on checklist_items;
drop policy if exists "admin insere itens" on checklist_items;
drop policy if exists "autenticados atualizam itens" on checklist_items;
drop policy if exists "admin remove itens" on checklist_items;
drop policy if exists "ver o proprio perfil" on profiles;
drop policy if exists "admin ve todos os perfis" on profiles;
drop policy if exists "admin atualiza perfis" on profiles;
drop policy if exists "autenticados veem setores" on setores;
drop policy if exists "admin cria setores" on setores;
drop policy if exists "admin atualiza setores" on setores;
drop policy if exists "admin remove setores" on setores;

-- checklists: todo autenticado lê; só admin escreve.
create policy "autenticados veem checklists"
  on checklists for select
  to authenticated
  using (true);

create policy "admin cria checklists"
  on checklists for insert
  to authenticated
  with check (is_admin());

create policy "admin atualiza checklists"
  on checklists for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "admin remove checklists"
  on checklists for delete
  to authenticated
  using (is_admin());

-- checklist_items: todo autenticado lê e dá update (o trigger acima restringe o
-- que o funcionário pode mudar); insert/delete só admin.
create policy "autenticados veem itens"
  on checklist_items for select
  to authenticated
  using (true);

create policy "admin insere itens"
  on checklist_items for insert
  to authenticated
  with check (is_admin());

create policy "autenticados atualizam itens"
  on checklist_items for update
  to authenticated
  using (true)
  with check (true);

create policy "admin remove itens"
  on checklist_items for delete
  to authenticated
  using (is_admin());

-- profiles: cada um vê o seu; admin vê e edita todos.
create policy "ver o proprio perfil"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "admin ve todos os perfis"
  on profiles for select
  to authenticated
  using (is_admin());

create policy "admin atualiza perfis"
  on profiles for update
  to authenticated
  using (is_admin())
  with check (is_admin());

-- setores: todo autenticado lê; só admin escreve.
create policy "autenticados veem setores"
  on setores for select
  to authenticated
  using (true);

create policy "admin cria setores"
  on setores for insert
  to authenticated
  with check (is_admin());

create policy "admin atualiza setores"
  on setores for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "admin remove setores"
  on setores for delete
  to authenticated
  using (is_admin());


-- ============================================================================
-- 4. DADOS
-- ----------------------------------------------------------------------------
-- OPÇÃO A (padrão abaixo): seed de demonstração.
-- OPÇÃO B: comente o bloco de seed abaixo e cole no lugar os INSERTs gerados
--          pelas queries do APÊNDICE (rodadas no projeto ANTIGO).
-- Os dois usam "on conflict do nothing", então rodar de novo não duplica nada.
-- ============================================================================

insert into setores (id, nome) values
  ('operacoes', 'Operações'),
  ('comercial', 'Comercial'),
  ('qualidade', 'Qualidade'),
  ('facilities', 'Facilities')
on conflict (id) do nothing;

insert into checklists (id, nome, setor, turno, horario) values
  ('abertura', 'Abertura da loja', 'Operações', 'Manhã', '07:00'),
  ('reposicao', 'Reposição de gôndolas', 'Comercial', 'Manhã', '08:30'),
  ('validade', 'Controle de validade', 'Qualidade', 'Tarde', '14:00'),
  ('limpeza', 'Limpeza e higienização', 'Facilities', 'Tarde', '16:00'),
  ('fechamento', 'Fechamento da loja', 'Operações', 'Noite', '22:00')
on conflict (id) do nothing;

insert into checklist_items (id, checklist_id, titulo, detalhe, responsavel, status, posicao) values
  ('ab1', 'abertura', 'Conferir alarme e portas', 'Registrar qualquer ocorrência noturna.', 'Marcos R.', 'concluido', 1),
  ('ab2', 'abertura', 'Ligar iluminação e climatização', 'Checar corredores e área de frios.', 'Marcos R.', 'concluido', 2),
  ('ab3', 'abertura', 'Abrir caixas com fundo de troco', 'Conferir valor por operador.', 'Fernanda L.', 'concluido', 3),
  ('ab4', 'abertura', 'Checar temperatura das câmaras frias', 'Registrar °C de cada câmara.', 'Ana P.', 'pendente', 4),
  ('ab5', 'abertura', 'Briefing rápido com a equipe', 'Metas do dia e avisos.', 'Gerente de loja', 'pendente', 5),

  ('re1', 'reposicao', 'Verificar rupturas nos corredores 1 a 5', 'Anotar itens em falta.', 'João S.', 'concluido', 1),
  ('re2', 'reposicao', 'Repor bebidas e mercearia', 'Prioridade para itens de alto giro.', 'João S.', 'pendente', 2),
  ('re3', 'reposicao', 'Aplicar PVPS (primeiro a vencer, primeiro a sair)', 'Produtos novos ao fundo.', 'Carla M.', 'pendente', 3),
  ('re4', 'reposicao', 'Conferir etiquetas e preços', 'Sinalizar divergências ao fiscal.', 'Carla M.', 'pendente', 4),
  ('re5', 'reposicao', 'Organizar frente de gôndola', 'Facing alinhado e limpo.', 'Equipe de repositores', 'pendente', 5),

  ('va1', 'validade', 'Auditar laticínios e frios', 'Retirar itens a vencer em 3 dias.', 'Ana P.', 'concluido', 1),
  ('va2', 'validade', 'Auditar padaria e rotisseria', 'Verificar etiquetas de fabricação.', 'Rita F.', 'concluido', 2),
  ('va3', 'validade', 'Registrar perdas no sistema', 'Foto do produto retirado.', 'Ana P.', 'pendente', 3),
  ('va4', 'validade', 'Aplicar desconto em itens próximos ao vencimento', 'Etiqueta amarela.', 'Fiscal de loja', 'pendente', 4),

  ('li1', 'limpeza', 'Higienizar carrinhos e cestas', 'Solução sanitizante.', 'Equipe de limpeza', 'concluido', 1),
  ('li2', 'limpeza', 'Limpeza dos corredores e piso', 'Sinalizar piso molhado.', 'Equipe de limpeza', 'pendente', 2),
  ('li3', 'limpeza', 'Sanitizar balcões de frios e açougue', 'Registrar horário.', 'Pedro A.', 'pendente', 3),
  ('li4', 'limpeza', 'Checar banheiros e reposição de insumos', 'Papel, sabão e lixeiras.', 'Equipe de limpeza', 'pendente', 4),

  ('fe1', 'fechamento', 'Fechamento de caixas e sangria', 'Conferir com o relatório do dia.', 'Fernanda L.', 'pendente', 1),
  ('fe2', 'fechamento', 'Conferir temperatura final das câmaras', 'Registrar °C.', 'Pedro A.', 'pendente', 2),
  ('fe3', 'fechamento', 'Desligar equipamentos não essenciais', 'Manter refrigeração ativa.', 'Marcos R.', 'pendente', 3),
  ('fe4', 'fechamento', 'Recolher lixo e resíduos', 'Separar recicláveis.', 'Equipe de limpeza', 'pendente', 4),
  ('fe5', 'fechamento', 'Armar alarme e trancar acessos', 'Última checagem de portas.', 'Gerente de loja', 'pendente', 5)
on conflict (id) do nothing;

-- profiles: NÃO insira aqui. Os ids são uuid de auth.users; primeiro recrie os
-- usuários no Auth do projeto novo (ver seção 5 e apêndice), o trigger
-- on_auth_user_created já cria o profile. Depois, se precisar corrigir nome/role,
-- rode um update.


-- ============================================================================
-- 5. ADMIN (passo manual)
-- ----------------------------------------------------------------------------
-- a) Crie seu usuário: Dashboard do Supabase > Authentication > Users > Add user
--    (marque "Auto Confirm User"). O trigger cria o profile como 'funcionario'.
-- b) Promova a admin:
--
--      update profiles set role = 'admin' where email = 'contato@germanoconsultoria.com.br';
--
-- c) Demais funcionários: entre no app como admin e cadastre pela tela
--    /funcionarios (usa a server function com a SERVICE_ROLE_KEY).
-- ============================================================================


-- ============================================================================
-- APÊNDICE — OPÇÃO B: trazer os dados reais do projeto ANTIGO
-- ----------------------------------------------------------------------------
-- Rode cada SELECT no SQL Editor do projeto ANTIGO. Cada um devolve UMA linha de
-- texto: um comando INSERT pronto. Copie e cole na seção 4 (no lugar do seed).
-- ============================================================================
/*
-- checklists
select 'insert into checklists (id,nome,setor,turno,horario,ativo) values '
     || string_agg(format('(%L,%L,%L,%L,%L,%L)', id, nome, setor, turno, horario, ativo), E',\n')
     || E'\non conflict (id) do nothing;'
from checklists;

-- checklist_items
select 'insert into checklist_items (id,checklist_id,titulo,detalhe,responsavel,status,posicao) values '
     || string_agg(format('(%L,%L,%L,%L,%L,%L,%s)', id, checklist_id, titulo, detalhe, responsavel, status, posicao), E',\n')
     || E'\non conflict (id) do nothing;'
from checklist_items;

-- profiles (rode DEPOIS de recriar os usuários no Auth novo; os uuid precisam
-- bater com auth.users, senão a FK falha). Em geral é mais simples deixar o
-- trigger criar e só ajustar o role no passo 5.
select 'insert into profiles (id,nome,email,role) values '
     || string_agg(format('(%L,%L,%L,%L)', id, nome, email, role), E',\n')
     || E'\non conflict (id) do nothing;'
from profiles;
*/
