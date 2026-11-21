-- Marketing do Run: reativa as peças de lançamento (requires_module = 'corrida'), que estavam todas
-- marcadas como puladas desde 2026-11-19. Elas só saem quando o módulo estiver ligado para todos
-- (app_settings.modules.enabled inclui 'corrida', o que o job liberar-modulo-corrida faz em 2026-12-01 10h BRT);
-- o teste fechado (app_metadata.beta_modules) não as libera. Sem isso, o lançamento ficaria sem nenhum post.
update public.marketing_autopost_queue
set skipped_at = null
where requires_module = 'corrida'
  and posted_at is null
  and skipped_at is not null;
