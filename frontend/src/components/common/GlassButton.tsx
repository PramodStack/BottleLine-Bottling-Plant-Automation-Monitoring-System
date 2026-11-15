import React from 'react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'circular' | 'pill' | 'active' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const GlassButton: React.FC<GlassButtonProps> = ({
  children,
  variant = 'pill',
  size = 'md',
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    circular: {
      sm: 'w-8 h-8 rounded-full',
      md: 'w-10 h-10 rounded-full',
      lg: 'w-12 h-12 rounded-full',
    },
    pill: {
      sm: 'px-3 py-1.5 text-xs rounded-full',
      md: 'px-4 py-2 text-sm rounded-full',
      lg: 'px-6 py-2.5 text-base rounded-full',
    },
  };

  const variantClasses = {
    circular: 'glass-btn flex items-center justify-center p-0',
    pill: 'glass-btn flex items-center justify-center gap-2 font-medium',
    active: 'glass-btn-active flex items-center justify-center gap-2 font-medium',
    outline: 'border border-[rgba(220,238,255,0.25)] hover:bg-[rgba(255,255,255,0.06)] text-[#EDF4FA] flex items-center justify-center gap-2 rounded-full',
    danger: 'bg-[rgba(239,119,116,0.18)] border border-[rgba(239,119,116,0.35)] text-[#EF7774] hover:bg-[rgba(239,119,116,0.28)] flex items-center justify-center gap-2 rounded-full',
  };

  const isCircular = variant === 'circular';
  const sizeClass = isCircular ? sizeClasses.circular[size] : sizeClasses.pill[size];
  const variantClass = variantClasses[variant];

  return (
    <button
      disabled={disabled}
      className={`cursor-pointer transition-all duration-200 select-none disabled:opacity-50 disabled:cursor-not-allowed ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </button>
  );
};
