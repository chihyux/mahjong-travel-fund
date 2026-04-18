import { useEffect } from 'react';

export default function Modal({ open, title, children, onClose, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[size];

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${width} card p-6 m-0 md:m-4 rounded-t-card md:rounded-card max-h-[92vh] overflow-y-auto`}>
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-[22px] font-bold">{title}</h2>
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-full hover:bg-hint flex items-center justify-center text-2xl text-ink-3"
              aria-label="關閉"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
