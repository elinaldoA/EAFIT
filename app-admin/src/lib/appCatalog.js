// ÚNICO ponto em que o painel lê código do app-react: o catálogo de exercícios
// (demonstrações padrão, vídeos, YouTube e o casamento de nomes). Uma cópia aqui
// sairia de sincronia a cada exercício novo, então o painel importa a mesma fonte
// que o app usa. Isso só funciona porque o deploy compila os dois a partir do
// mesmo repositório (ver .github/workflows/deploy.yml e `server.fs.allow` no
// vite.config.js). Se o app-react mover ou renomear esses arquivos, o erro
// aparece aqui (e em appCatalog.test.js), não espalhado pelo painel.
export { EXERCISE_MEDIA, normalizeExerciseName, getExerciseMedia } from '../../../app-react/src/data/exerciseMedia.js';
export { EXERCISE_VIDEOS, videoCredit } from '../../../app-react/src/data/exerciseVideos.js';
export { EXERCISE_YOUTUBE, youtubeEmbedUrl } from '../../../app-react/src/data/exerciseYoutube.js';
export { matchCatalogExercise } from '../../../app-react/src/data/exerciseMatch.js';
