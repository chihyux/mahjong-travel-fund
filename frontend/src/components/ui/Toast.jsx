export default function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'error' ? '#7F1D1D' : '#2F4A2F';
  const icon = toast.type === 'error' ? '✕' : '✓';
  return (
    <div
      className="toast-enter fixed bottom-24 md:bottom-8 left-1/2 z-50 px-5 py-3 rounded-2xl shadow-card text-white font-medium flex items-center gap-2"
      style={{ background: bg, transform: 'translateX(-50%)' }}
      key={toast.ts}
    >
      <span className="text-xl">{icon}</span>
      <span>{toast.msg}</span>
    </div>
  );
}
