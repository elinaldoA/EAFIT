// Só a musculação muda com o local de treino: a calistenia usa sempre o
// mesmo equipamento/programa, então o campo "Onde você treina" só vale nela.
export const usesLocal = modalidade => modalidade !== 'calistenia';
