import { type LucideIcon } from "lucide-react";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon-wrapper" aria-hidden="true">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      <div className="empty-state-text">{title}</div>
      <div className="empty-state-description">{description}</div>
      {action && (
        <div className="empty-state-actions">
          <button
            className="tool-button primary-empty-action"
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}