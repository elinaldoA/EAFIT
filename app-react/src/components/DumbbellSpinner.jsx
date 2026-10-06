// Spinner de carregamento: um halter fazendo repetições (sobe e desce).
export default function DumbbellSpinner({ size = 'md' }) {
  return (
    <span className={`dumbbell dumbbell--${size}`} aria-hidden="true">
      <svg className="dumbbell__svg" viewBox="0 0 64 32" aria-hidden="true">
        <rect x="18" y="14" width="28" height="4" rx="2" fill="currentColor" opacity=".55" />
        <rect x="14" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
        <rect x="45" y="6" width="5" height="20" rx="2" fill="var(--primary, #f97316)" />
        <rect x="8" y="10" width="5" height="12" rx="2" fill="currentColor" />
        <rect x="51" y="10" width="5" height="12" rx="2" fill="currentColor" />
      </svg>
    </span>
  );
}
