export function GraSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}
