-- contact_rate_log (limite de contatos por IP) não tinha chave primária. Uma
-- coluna de identidade resolve sem mexer nas linhas nem em quem usa a tabela.
alter table public.contact_rate_log
  add column if not exists id bigint generated always as identity primary key;
