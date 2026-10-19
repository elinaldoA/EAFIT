-- Formulário de contato do site ganha o assunto "Quero ser embaixador"
-- (/sobre/#embaixadores leva direto a ele com ?assunto=embaixador). O check
-- precisa bater com as opções do <select> em public/landing/sobre/index.html e
-- com TOPIC_LABELS em app-admin/src/lib/contactMessages.js.

alter table public.contact_messages drop constraint if exists contact_messages_topic_check;
alter table public.contact_messages add constraint contact_messages_topic_check
  check (topic in ('duvida', 'suporte', 'personal', 'embaixador', 'sugestao', 'outro'));
