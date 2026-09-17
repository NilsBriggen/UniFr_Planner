import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function StatusNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="status">
      <span aria-hidden="true" className="notice-symbol">
        i
      </span>
      <div>{children}</div>
    </div>
  );
}
