import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  variant?: 'default' | 'elevated' | 'deep';
  headerAction?: React.ReactNode;
  title?: string;
  subtitle?: string;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  elevated = false,
  variant = 'default',
  headerAction,
  title,
  subtitle,
  onClick,
}) => {
  const panelClass = variant === 'deep'
    ? 'glass-panel-deep'
    : (variant === 'elevated' || elevated)
    ? 'glass-panel-elevated'
    : 'glass-panel';

  return (
    <div
      onClick={onClick}
      className={`rounded-[24px] relative overflow-hidden flex flex-col ${panelClass} ${className}`}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <div>
            {title && <h3 className="text-sm font-bold text-white tracking-wide drop-shadow-sm">{title}</h3>}
            {subtitle && <p className="text-[11px] text-[#cbd5e1] mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div className="flex items-center gap-2">{headerAction}</div>}
        </div>
      )}
      <div className={title ? 'px-5 pb-5 pt-1 flex-1 min-h-0 flex flex-col' : 'flex-1 min-h-0 flex flex-col'}>
        {children}
      </div>
    </div>
  );
};
