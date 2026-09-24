import type { ElementType, ReactNode } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={["skeleton", className].filter(Boolean).join(" ")} style={style} aria-hidden="true" />;
}

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  as?: ElementType;
};

export function EmptyState({ icon, title, description, action, as = "div" }: EmptyStateProps) {
  const Tag = as;
  return (
    <Tag className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </Tag>
  );
}