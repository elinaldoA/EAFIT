// Só a musculação muda com o local de treino: calistenia e corrida usam sempre o
// mesmo equipamento/programa, então o campo "Onde você treina" só vale nela.
export const usesLocal = modalidade => modalidade !== 'calistenia' && modalidade !== 'corrida';
