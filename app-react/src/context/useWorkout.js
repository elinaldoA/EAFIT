import { createContext, useContext } from 'react';

// Context + hook ficam fora de WorkoutContext.jsx (que só exporta o
// WorkoutProvider) pra o Fast Refresh do Vite conseguir atualizar o provider
// sem recarregar a página — arquivo .jsx que exporta componente e não-componente
// juntos perde o hot reload (regra react/only-export-components do oxlint).
export const WorkoutContext = createContext(null);

export function useWorkout() {
  return useContext(WorkoutContext);
}
