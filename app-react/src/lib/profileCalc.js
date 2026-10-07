import { t } from './i18n';
export function imcInfo(peso, altura) {
  if (!peso || !altura || peso < 30 || altura < 100) return null;
  const imc = peso / ((altura / 100) ** 2);
  const cls =
    imc < 18.5 ? t('Abaixo do peso') :
    imc < 25 ? t('Peso normal') :
    imc < 30 ? t('Sobrepeso') :
    imc < 35 ? t('Obesidade grau I') : t('Obesidade grau II+');
  return { value: imc.toFixed(1), cls };
}

export function metaProgress(pesoAtual, pesoAlvo, weightLogs) {
  if (!pesoAtual || !pesoAlvo) return null;
  const diff = pesoAtual - pesoAlvo;
  if (Math.abs(diff) < 0.1) return { done: true, msg: t('🎉 Meta de peso alcançada!') };

  const first = weightLogs[0]?.peso ?? pesoAtual;
  const totalSpan = Math.abs(first - pesoAlvo) || 1;
  const covered = Math.abs(first - pesoAtual);
  const pct = Math.max(0, Math.min(100, (covered / totalSpan) * 100));
  const msg = t('Faltam {v1}kg para a meta de {pesoAlvo}kg', { v1: Math.abs(diff).toFixed(1), pesoAlvo });
  return { done: false, pct, msg };
}
