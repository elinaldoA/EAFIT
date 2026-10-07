// Dicionário pt -> en da interface: a chave é o texto em português exatamente
// como aparece em t('...'). Um arquivo por área; src/lib/i18n.test.js garante
// que todo t('...') do código tenha tradução aqui.
import components from './components';
import libs from './libs';
import pages from './pages';
import dates from './dates';
import extra from './extra';
import trainer from './trainer';

export default { ...components, ...libs, ...pages, ...dates, ...extra, ...trainer };
