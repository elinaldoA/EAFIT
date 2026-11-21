-- Modelo de push e e-mail do pré-cadastro do Run: texto de suspense, sem citar funcionalidades do módulo.
update public.broadcast_templates
set title = '{nome}, vem aí algo novo no EAFIT 🏃',
    body = E'Para quem ama correr: dia 1º de dezembro, às 10h.\n\nQuer ser avisado? Abra o app, vá em Perfil › EAFIT Run e toque em “Quero ser avisado”.'
where name = 'Run: pré-cadastro (base do app)';
