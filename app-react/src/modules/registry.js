import { lazy } from 'react';
import { t } from '../lib/i18n';
import { importPage } from '../lib/chunkReload';
import { RUN_NAV_ITEMS } from './corrida/nav';
import { subscribeLiveRun, isRunActive } from './corrida/liveRun';

// Módulos de esporte: um app só, e cada esporte é uma versão dele com
// identidade própria (nome, cor, ícone, abas e telas) sob a marca EAFIT, que
// aparece em todos ("EAFIT · Run"). A escolha da pessoa fica na conta
// (user_metadata.esporte) e a regra de qual módulo vale está em
// lib/sportModule.js.
//
// Para criar um módulo, acrescente uma entrada aqui com:
//   id         chave gravada na conta e em <html data-module> (cores em styles/modules.css)
//   name       sufixo da marca: 'Run' vira "EAFIT · Run"; vazio = só "EAFIT"
//   label      nome do esporte no seletor do cadastro e do Perfil
//   icon       emoji do seletor e do card do Perfil
//   tabs       abas da navegação inferior, na ordem (chaves de BottomNav/App.jsx)
//   defaultTab aba que abre primeiro
//   released   true = qualquer pessoa pode escolher; false = só aparece depois
//              de liberado no painel admin (app_settings.modules.enabled)
//   navItems   abas próprias do módulo: [{ key, label, icon }] (BottomNav)
//   pages      telas das abas próprias: { chave: componente lazy }
//   Host       componente sempre montado no app do módulo (ex.: corrida ao vivo)
//   workoutPlan   false = o módulo não usa plano de musculação: o cadastro não
//                 pergunta objetivo/local nem gera treino
//   busy       { subscribe, get }: true trava manutenção/atualização obrigatória
//              (ex.: corrida rodando — trocar a tela mataria o GPS)
//   tutorial   mostra o tutorial guiado da musculação
//
// Nada fora deste registro deve perguntar "qual é o esporte?": cada diferença
// entre as versões vira um campo do módulo.

export const DEFAULT_MODULE_ID = 'musculacao';

export const BASE_TABS = Object.freeze(['treino', 'historico', 'hidratacao', 'nutricao', 'dash', 'perfil']);

export const MODULES = Object.freeze([
  Object.freeze({
    id: DEFAULT_MODULE_ID,
    name: '',
    label: t('Musculação'),
    icon: '🏋️',
    tabs: BASE_TABS,
    defaultTab: 'treino',
    released: true,
    tutorial: true,
  }),
  Object.freeze({
    id: 'corrida',
    name: 'Run',
    label: t('Corrida'),
    icon: '🏃',
    tabs: Object.freeze(['inicio', 'gravar', 'desafios', 'voce', 'perfil']),
    defaultTab: 'inicio',
    released: false,
    navItems: RUN_NAV_ITEMS,
    pages: {
      inicio: lazy(() => importPage(() => import('./corrida/RunFeedPage'))),
      gravar: lazy(() => importPage(() => import('./corrida/RunHomePage'))),
      desafios: lazy(() => importPage(() => import('./corrida/RunChallengesPage'))),
      voce: lazy(() => importPage(() => import('./corrida/RunHistoryPage'))),
    },
    Host: lazy(() => importPage(() => import('./corrida/LiveRunHost'))),
    workoutPlan: false,
    busy: { subscribe: subscribeLiveRun, get: isRunActive },
  }),
]);
