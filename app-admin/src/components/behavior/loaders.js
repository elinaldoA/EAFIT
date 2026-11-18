import {
  fetchSitePages, fetchSiteEngagement, buildSitePages, fetchEmailStats, buildEmailStats, fetchSessionStats, buildSessionStats, fetchAuthEvents, fetchUserEvents, fetchInstallRetention, fetchWorkoutCompletion, fetchWorkoutDropoff, fetchVisitorStages, fetchLostVisitors, fetchAccessTimeline, buildSignup, buildUserEvents, buildInstallRetention, buildCompletion, buildVisitorJourney, buildAccessTimeline, timelineBuckets,
} from '../../lib/behavior';
import { buildTutorialFunnel } from '../../lib/adoption';

export const loadAuth = days => fetchAuthEvents(days).then(buildSignup);
export const loadEvents = days => fetchUserEvents(days).then(rows => ({ ...buildUserEvents(rows), tutorial: buildTutorialFunnel(rows) }));
export const loadJourney = days => Promise.all([fetchVisitorStages(days), fetchLostVisitors(days, 50)])
  .then(([stages, lost]) => ({ ...buildVisitorJourney(stages), recent: lost }));
export const loadTimeline = ({ bucket, days }) => fetchAccessTimeline(bucket, timelineBuckets(bucket, days))
  .then(rows => buildAccessTimeline(rows, bucket));
// Engajamento é opcional: se a consulta falhar, a tabela segue só com os acessos.
// Comparação com o período anterior: busca o dobro do período e tira o atual
// (só para números que somam). Em “Todos” (0) não há comparação.
export const doubled = (fetch, days) => (days > 0 ? fetch(days * 2).catch(() => null) : Promise.resolve(null));
export const loadSitePages = days => Promise.all([fetchSitePages(days), fetchSiteEngagement(days).catch(() => []), doubled(fetchSitePages, days)])
  .then(([pages, engagement, big]) => buildSitePages(pages, engagement, big));
export const loadSessions = days => Promise.all([fetchSessionStats(days), doubled(fetchSessionStats, days)])
  .then(([rows, big]) => buildSessionStats(rows, big));
export const loadEmails = days => Promise.all([fetchEmailStats(days), doubled(fetchEmailStats, days)])
  .then(([rows, big]) => buildEmailStats(rows, big));
export const loadInstall = () => fetchInstallRetention().then(buildInstallRetention);
export const loadWorkouts = days => Promise.all([fetchWorkoutCompletion(days), fetchWorkoutDropoff(days, 10)])
  .then(([c, d]) => ({ completion: buildCompletion(c), dropoff: d }));
