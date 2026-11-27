import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { fetchHeroForm, trainingProfile } from '../lib/hero';
import { nutritionProfile } from '../lib/nutritionGoals';

// A forma física do herói: o objetivo e a meta semanal do perfil, mais a forma
// (0 a 100) calculada no servidor a partir dos treinos e corridas reais. Sem
// forma calculada (carregando ou sem a função publicada) o herói fica neutro.
// { form: número | null, goal, weeklyGoal, info: { score, target, this_week, weeks } | null }
export function useHeroForm() {
  const { user } = useAuth();
  const metadata = user?.user_metadata;
  const [state, setState] = useState(() => ({ form: null, info: null, ...trainingProfile(nutritionProfile(metadata)) }));

  useEffect(() => {
    let alive = true;
    const profile = trainingProfile(nutritionProfile(metadata));
    setState(prev => ({ ...prev, ...profile }));
    fetchHeroForm(profile.weeklyGoal)
      .then(info => { if (alive) setState({ ...profile, info: info || null, form: info ? info.score : null }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [metadata]);

  return state;
}
