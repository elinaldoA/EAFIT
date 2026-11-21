// Marketing: redes da EAFIT conectadas (Facebook, Instagram, TikTok), fila de
// publicação, biblioteca de mídia e comentários. Tabelas e RPCs em
// supabase/migrations/20261222010000_marketing.sql; quem fala com as redes são
// as Edge Functions marketing-oauth e marketing (tokens nunca chegam aqui).
// O código fica em lib/marketing/*.js; este arquivo só reexporta, para os
// imports de "../lib/marketing" continuarem iguais.

export { SITE, BUCKET, MAX_BYTES, PLATFORMS, STATUS_LABEL, QUICK_REPLIES } from './marketing/common';
export { APP_PRINTS, REEL_DEFAULTS, printUrl, exerciseVideoList, publicUrl, fetchMedia, validateUpload, uploadMedia, removeMedia, ACTIVE_TARGET_STATUS, fetchMediaInUse, unusedMedia, removeMediaBatch } from './marketing/media';
export { ART_FORMATS, wrapLines, createArt, createTextArt } from './marketing/art';
export { fetchAccounts, accountLabel, startConnect, disconnectAccount } from './marketing/accounts';
export { finalCaption, countHashtags, validatePost, TIKTOK_PRIVACY_LABEL, EMPTY_TIKTOK, validateTikTok, tiktokPayload, tiktokLabel, fetchTikTokCreator, createPost, runPost, fetchPosts, fetchScheduledPosts, cancelPost, deletePost, editPost, deleteExternalPost, editExternalPost, editSummary, retryTarget } from './marketing/posts';
export { fetchComments, firstName, fillReply, syncComments, replyComment, hideComment } from './marketing/comments';
export { POSTED_SHOWN, fetchAutopost, publishableNow, setAutopostEnabled, SLOT_LABEL, NUTRI_SLOTS, AUTOPOST_LANES, laneWhen, laneAt, laneRuns, laneKey, laneLabel, SEASON_LABEL, seasonTag, seasonOnDay, brtDay, autopostTheme, THEME_GAP_DAYS, autopostSchedule, nextAutopostSlots, splitCaption } from './marketing/autopost';
export { KIND_LABEL, MEDIUM_LABEL, fetchMetrics, refreshMetrics, fetchConversion, fetchContentConversion, postScore, averageByKind, conversionRate } from './marketing/results';
export { QUEUE_ERRORS, updateQueueCaption, moveQueueItem, removeQueueItem, restoreQueueItem, addQueueItem, queuePosition } from './marketing/queue';
export { fetchAds, AD_STATUS_LABEL, adTotals, promoCandidates } from './marketing/ads';
export { WEEKDAYS, PERIODS_OF_DAY, bestTimes, hashtagStats, trendingPosts, fetchAdsConversion, adSignups, weeklySummary } from './marketing/analytics';
