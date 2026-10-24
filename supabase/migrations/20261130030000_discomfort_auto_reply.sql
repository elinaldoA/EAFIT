-- Resposta automática aos relatos de dor/desconforto (aba Segurança do
-- painel). Assim que o aluno registra o relato, uma orientação conforme a
-- severidade chega na central de avisos (sino), sem depender de alguém do
-- time ler a aba. O push de acompanhamento de 3-4 dias depois
-- (send-reminders) continua igual.

alter table public.exercise_discomfort
  add column if not exists auto_reply_id bigint references public.user_notifications(id) on delete set null;

create index if not exists exercise_discomfort_auto_reply_idx
  on public.exercise_discomfort (auto_reply_id);

-- Texto da orientação. Em inglês sem o nome do exercício: o banco só tem o
-- nome em português (a tradução fica em _shared/exerciseI18n.ts).
create or replace function public.discomfort_reply_text(p_severity text, p_exercise text, p_lang text)
returns table (title text, body text)
language sql
immutable
set search_path = public
as $$
  select
    case
      when p_lang = 'en' then case p_severity
        when 'lesao' then '🩹 About the injury you reported'
        when 'forte' then '🩹 About the pain you reported'
        else '🩹 We got your report' end
      else case p_severity
        when 'lesao' then '🩹 Sobre a lesão que você relatou'
        when 'forte' then '🩹 Sobre a dor que você relatou'
        else '🩹 Recebemos seu relato' end
    end,
    case
      when p_lang = 'en' then case p_severity
        when 'lesao' then 'Stop the exercises that strain the injured area and see a doctor or physical therapist before going back. If there is intense pain, swelling or loss of movement, get care today.'
        when 'forte' then 'Strong pain is a sign to stop. Don''t repeat this exercise until the pain is gone and swap it for one that doesn''t hurt. If it lasts more than a few days, see a doctor or physical therapist.'
        when 'moderada' then 'Next session, lower the load or swap the exercise for a variation. If the discomfort keeps coming back, stop doing it and talk to a professional.'
        else 'Mild discomfort usually goes away with small tweaks: lower the load a little and focus on warm-up and form. If it gets worse, report it again.' end
      else case p_severity
        when 'lesao' then 'Você relatou lesão em ' || p_exercise || '. Interrompa os exercícios que forçam essa região e procure um médico ou fisioterapeuta antes de voltar. Se houver dor intensa, inchaço ou perda de movimento, procure atendimento hoje.'
        when 'forte' then 'Dor forte em ' || p_exercise || ' é sinal para parar. Não repita esse exercício até a dor passar e troque por um que não incomode. Se durar mais de alguns dias, procure um médico ou fisioterapeuta.'
        when 'moderada' then 'Na próxima sessão, diminua a carga de ' || p_exercise || ' ou troque por uma variação. Se o desconforto voltar, pare o exercício e converse com um profissional.'
        else 'Desconforto leve em ' || p_exercise || ' costuma passar com ajustes: reduza um pouco a carga e capriche no aquecimento e na execução. Se piorar, registre de novo.' end
    end;
$$;

revoke execute on function public.discomfort_reply_text(text, text, text) from public, anon, authenticated;

-- Grava a orientação e liga ao relato. Clique repetido (mesmo exercício e
-- severidade em 12 h) reaproveita a resposta em vez de mandar outra igual.
create or replace function public.discomfort_auto_reply()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_lang text;
  v_reply bigint;
begin
  select d.auto_reply_id into v_reply
  from public.exercise_discomfort d
  where d.user_id = new.user_id
    and d.exercise_name = new.exercise_name
    and d.severity = new.severity
    and d.auto_reply_id is not null
    and d.created_at > now() - interval '12 hours'
  order by d.created_at desc
  limit 1;

  if v_reply is null then
    select case when u.raw_user_meta_data->>'lang' = 'en' then 'en' else 'pt' end
      into v_lang
    from auth.users u where u.id = new.user_id;

    insert into public.user_notifications (user_id, kind, title, body)
    select new.user_id, 'seguranca', r.title, r.body
    from public.discomfort_reply_text(new.severity, new.exercise_name, coalesce(v_lang, 'pt')) r
    returning id into v_reply;
  end if;

  new.auto_reply_id := v_reply;
  return new;
end;
$$;

revoke execute on function public.discomfort_auto_reply() from public, anon, authenticated;

drop trigger if exists exercise_discomfort_auto_reply on public.exercise_discomfort;
create trigger exercise_discomfort_auto_reply
  before insert on public.exercise_discomfort
  for each row execute function public.discomfort_auto_reply();

-- Relatos recentes que chegaram antes da resposta automática existir.
do $$
declare
  r record;
  v_reply bigint;
begin
  for r in
    select d.id, d.user_id, d.exercise_name, d.severity,
           case when u.raw_user_meta_data->>'lang' = 'en' then 'en' else 'pt' end as lang
    from public.exercise_discomfort d
    join auth.users u on u.id = d.user_id
    where d.auto_reply_id is null
      and d.created_at > now() - interval '7 days'
    order by d.created_at
  loop
    insert into public.user_notifications (user_id, kind, title, body)
    select r.user_id, 'seguranca', t.title, t.body
    from public.discomfort_reply_text(r.severity, r.exercise_name, r.lang) t
    returning id into v_reply;

    update public.exercise_discomfort set auto_reply_id = v_reply where id = r.id;
  end loop;
end;
$$;

-- Aba Segurança: mostra a resposta enviada e se o aluno já leu. O join exige
-- o mesmo dono porque o aluno pode editar as próprias linhas do relato.
drop function if exists public.admin_list_discomfort(boolean, int, int);
create function public.admin_list_discomfort(
  only_severe boolean default true,
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id bigint,
  user_id uuid,
  user_email text,
  exercise_name text,
  log_date date,
  severity text,
  note text,
  reply_title text,
  reply_body text,
  reply_at timestamptz,
  reply_read_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with base as (
      select d.id, d.user_id, u.email::text as user_email, d.exercise_name, d.log_date, d.severity, d.note,
             n.title as reply_title, n.body as reply_body, n.created_at as reply_at, n.read_at as reply_read_at
      from public.exercise_discomfort d
      join auth.users u on u.id = d.user_id
      left join public.user_notifications n on n.id = d.auto_reply_id and n.user_id = d.user_id
      where (not only_severe or d.severity in ('forte', 'lesao'))
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by b.log_date desc, b.id desc
    limit page_size offset page_offset;
end;
$$;

revoke execute on function public.admin_list_discomfort(boolean, int, int) from public, anon;
grant execute on function public.admin_list_discomfort(boolean, int, int) to authenticated;
