-- Remove admin_list_admins(): existia só em produção (fora das migrations) e nada no
-- app, nas Edge Functions ou em outras funções a chamava (substituída por admin_list_admin_accounts).
drop function if exists public.admin_list_admins();
