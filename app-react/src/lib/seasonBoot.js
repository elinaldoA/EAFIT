// Primeiro import de main.jsx: liga o tema de temporada guardado no aparelho
// antes de qualquer outro módulo, pra textos montados na importação (t() em
// constantes) e a primeira tela já saírem com ele (lib/season.js).
import { bootSeason } from './season';

bootSeason();
