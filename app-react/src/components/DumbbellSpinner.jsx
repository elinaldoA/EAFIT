import { currentSeason } from '../lib/season';

// Spinner de carregamento: um halter fazendo repetições (sobe e desce).
// No Dia das Bruxas as anilhas viram abóboras.
export default function DumbbellSpinner({ size = 'md' }) {
  const pumpkins = currentSeason() === 'halloween';
  return (
    <span className={`dumbbell dumbbell--${size}`} aria-hidden="true">
      <svg className="dumbbell__svg" viewBox="0 0 64 32" aria-hidden="true">
        <rect x="18" y="14" width="28" height="4" rx="2" fill="currentColor" opacity=".55" />
        {pumpkins ? (
          <>
            <path d="M12 6.5l1.5-3M52 6.5l-1.5-3" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="12" cy="17" rx="8" ry="10" fill="var(--primary, #f97316)" />
            <ellipse cx="52" cy="17" rx="8" ry="10" fill="var(--primary, #f97316)" />
            <path d="M12 7.5c-3 3-3 16 0 19M12 7.5c3 3 3 16 0 19M52 7.5c-3 3-3 16 0 19M52 7.5c3 3 3 16 0 19" stroke="#c2410c" strokeWidth="1.2" fill="none" />
          </>
        ) : (
          <>
            <rect x="14" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
            <rect x="45" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
            <rect x="8" y="10" width="5" height="12" rx="2" fill="currentColor" />
            <rect x="51" y="10" width="5" height="12" rx="2" fill="currentColor" />
          </>
        )}
      </svg>
    </span>
  );
}
