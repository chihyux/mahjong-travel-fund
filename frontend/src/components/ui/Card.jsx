export default function Card({ children, className = '', padding = 'p-6', ...props }) {
  return (
    <div className={`card ${padding} ${className}`} {...props}>
      {children}
    </div>
  );
}
