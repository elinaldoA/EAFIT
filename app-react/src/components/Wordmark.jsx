// Nome da marca em duas cores: "EA" na cor do tema da temporada (ou na cor do
// texto fora de temporada) e "FIT" em laranja. O texto continua "EAFIT" para
// leitores de tela.
export default function Wordmark() {
  return (
    <>
      <span className="wordmark__ea">EA</span><span className="wordmark__fit">FIT</span>
    </>
  );
}
