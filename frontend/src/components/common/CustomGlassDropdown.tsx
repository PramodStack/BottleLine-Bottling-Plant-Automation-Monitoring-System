import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
}

export interface CustomGlassDropdownProps {
  value: string;
  onChange: (val: string) => void;
  options: (string | Option)[];
  className?: string;
  size?: 'sm' | 'md';
  placeholder?: string;
  align?: 'left' | 'right';
  menuWidth?: string;
}

export const CustomGlassDropdown: React.FC<CustomGlassDropdownProps> = ({
  value,
  onChange,
  options,
  className = '',
  size = 'sm',
  placeholder,
  align = 'right',
  menuWidth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalizedOptions: Option[] = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const currentOption = normalizedOptions.find((opt) => opt.value === value);
  const currentLabel = currentOption ? currentOption.label : (placeholder || value || 'Select');

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${isOpen ? 'z-50' : 'z-20'} ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 rounded-full font-medium tracking-wide transition-all duration-200 cursor-pointer select-none whitespace-nowrap ${
          size === 'sm'
            ? 'h-8 px-3 text-xs'
            : 'h-9 px-4 text-xs'
        } ${
          isOpen
            ? 'bg-[rgba(145,165,188,0.38)] text-white border border-[rgba(255,255,255,0.35)] shadow-[0_0_12px_rgba(255,255,255,0.15)]'
            : 'bg-[rgba(133,153,174,0.24)] hover:bg-[rgba(145,165,188,0.34)] text-[#f1f5f9] hover:text-white border border-[rgba(225,237,248,0.22)] shadow-sm'
        } backdrop-blur-md`}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#cbd5e1] transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Floating Animated Menu */}
      {isOpen && (
        <div
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-1.5 ${
            menuWidth || 'min-w-[140px] w-max max-w-[240px]'
          } rounded-2xl bg-[rgba(36,58,84,0.92)] backdrop-blur-2xl border border-[rgba(215,235,255,0.25)] shadow-[0_16px_36px_rgba(10,24,38,0.45)] py-1.5 overflow-hidden animate-fade-in z-50`}
        >
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-1.5 text-xs transition-colors duration-150 text-left cursor-pointer ${
                  isSelected
                    ? 'text-white bg-[rgba(255,255,255,0.16)] font-semibold'
                    : 'text-[#cbd5e1] hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#53D3E2] flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
