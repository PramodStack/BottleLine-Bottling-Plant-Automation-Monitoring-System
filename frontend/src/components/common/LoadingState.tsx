import React from 'react';
import { RotateCw, AlertTriangle } from 'lucide-react';

export interface LoadingStateProps {
  /** Main loading line (e.g., "LOADING PACKAGING LINE") */
  title?: string;
  /** Subtitle (e.g., "Preparing production data…") */
  message?: string;
  /** Secondary status line alias */
  stage?: string;
  /** Legacy alias for systemLabel */
  systemLabel?: string;
  /** Current progress percentage if available */
  progress?: number;
  /** Error message if loading timed out or request failed */
  error?: string | null;
  /** Retry callback if error or timeout occurred */
  onRetry?: () => void;
  /** Sizing variant */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to fill the page container and center vertically */
  fullPage?: boolean;
  /** Additional custom class names */
  className?: string;
  /** Custom center icon override */
  icon?: React.ReactNode;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title,
  message,
  stage,
  error = null,
  onRetry,
  size = 'md',
  fullPage = true,
  className = '',
  icon,
}) => {
  const isSm = size === 'sm';

  // Format main title cleanly (e.g., "LOADING PACKAGING LINE")
  const getMainLabel = () => {
    if (title) {
      return title.replace(/^INITIALIZING\s+/i, 'LOADING ');
    }
    const raw = (message || '').toLowerCase();
    if (raw.includes('pack')) return 'LOADING PACKAGING LINE';
    if (raw.includes('inspect')) return 'LOADING QUALITY INSPECTION';
    if (raw.includes('track')) return 'LOADING BOTTLE TRACKING';
    if (raw.includes('hist')) return 'LOADING PRODUCTION HISTORY';
    if (raw.includes('user')) return 'LOADING USER DIRECTORY';
    if (raw.includes('cap')) return 'LOADING CAPPING OPERATIONS';
    if (raw.includes('wave') || raw.includes('product')) return 'LOADING PRODUCTION WAVE';
    if (raw.includes('report')) return 'LOADING PLANT REPORTS';
    if (raw.includes('overview') || raw.includes('scada')) return 'LOADING PLANT OVERVIEW';
    return 'LOADING PLANT DATA';
  };

  const mainLabel = error ? 'CONNECTION TIMEOUT' : getMainLabel();

  // Secondary subtitle text
  const subLabel = error
    ? error
    : stage
    ? stage
    : message && !message.toLowerCase().startsWith('loading')
    ? message
    : 'Preparing production data…';

  // Small variant for inline table rows
  if (isSm) {
    return (
      <div className={`flex items-center justify-center gap-3 p-4 text-center select-none ${className}`}>
        <div className="relative w-5 h-5 flex-shrink-0">
          <svg className="w-5 h-5" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="mini-cyan-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#53D3E2" />
                <stop offset="100%" stopColor="#00d2ff" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="12" stroke="rgba(215, 235, 255, 0.15)" strokeWidth="2" fill="none" />
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="url(#mini-cyan-grad)"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="22 55"
              className="circular-loader-arc"
              style={{ transformOrigin: '16px 16px' }}
            />
          </svg>
        </div>
        <span className="text-xs font-medium text-[#cbd5e1]">{message || 'Loading…'}</span>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MINIMAL GLOWING CIRCULAR LOADER DIRECTLY OVER BACKGROUND
  // (NO CARD, NO CONTAINER BOX, NO BULKY PROGRESS BAR)
  // ══════════════════════════════════════════════════════════════
  const content = (
    <div
      className={`relative flex flex-col items-center justify-center gap-3.5 text-center select-none animate-in fade-in duration-200 ${className}`}
    >
      {/* ── Circular Rotating Loader Visual ── */}
      <div className="relative flex items-center justify-center w-[72px] h-[72px]">
        {/* Soft Ambient Cyan Backlight Glow */}
        <div
          className={`absolute w-14 h-14 rounded-full blur-xl pointer-events-none transition-colors duration-300 ${
            error ? 'bg-rose-500/20' : 'bg-cyan-400/20'
          }`}
        />

        <svg
          className="w-[72px] h-[72px] select-none"
          viewBox="0 0 68 68"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Bright Cyan / Electric Blue Arc Gradient */}
            <linearGradient id="electric-cyan-arc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#53D3E2" stopOpacity="1" />
              <stop offset="55%" stopColor="#00d2ff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
            </linearGradient>

            {/* Error Arc Gradient */}
            <linearGradient id="error-coral-arc" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f87171" stopOpacity="1" />
              <stop offset="60%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
            </linearGradient>

            {/* Cyan Outer Glow Filter */}
            <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Faint Concentric Depth Ring (Outer) */}
          <circle
            cx="34"
            cy="34"
            r="30.5"
            stroke="rgba(83, 211, 226, 0.08)"
            strokeWidth="1"
            fill="none"
          />

          {/* Thin Circular Track */}
          <circle
            cx="34"
            cy="34"
            r="27"
            stroke="rgba(215, 235, 255, 0.14)"
            strokeWidth="2.2"
            fill="none"
          />

          {/* Continuous Rotating Arc + Traveling Glowing Cyan Dot */}
          <g className="circular-loader-arc" style={{ transformOrigin: '34px 34px' }}>
            {/* Bright Cyan Arc (approx 100° length) */}
            <circle
              cx="34"
              cy="34"
              r="27"
              stroke={error ? 'url(#error-coral-arc)' : 'url(#electric-cyan-arc)'}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              filter="url(#arc-glow)"
              strokeDasharray="48 122"
            />

            {/* Small Glowing Cyan Dot traveling along circular path */}
            <circle
              cx="61"
              cy="34"
              r="2.8"
              fill={error ? '#f87171' : '#53D3E2'}
              filter="url(#arc-glow)"
            />
            <circle
              cx="61"
              cy="34"
              r="1.3"
              fill="#ffffff"
            />
          </g>

          {/* Optional Tiny Center Silhouette */}
          {icon ? (
            <g transform="translate(26, 26)">{icon}</g>
          ) : error ? (
            <g transform="translate(26, 26)">
              <AlertTriangle className="w-4 h-4 text-[#EF7774]" />
            </g>
          ) : (
            <g opacity="0.65">
              {/* Bottle Cap */}
              <rect x="32.5" y="25" width="3" height="1.5" rx="0.4" fill="#EDF4FA" />
              {/* Neck */}
              <line x1="33" y1="26.5" x2="33" y2="29" stroke="rgba(83, 211, 226, 0.6)" strokeWidth="0.8" />
              <line x1="35" y1="26.5" x2="35" y2="29" stroke="rgba(83, 211, 226, 0.6)" strokeWidth="0.8" />
              {/* Bottle Body */}
              <path
                d="M31.5 29 L36.5 29 L36.5 40.5 C36.5 41.2 35.8 41.8 35 41.8 L33 41.8 C32.2 41.8 31.5 41.2 31.5 40.5 Z"
                stroke="rgba(83, 211, 226, 0.55)"
                strokeWidth="0.9"
                fill="rgba(83, 211, 226, 0.14)"
              />
              {/* Subtle Laser Beam */}
              <line x1="28.5" y1="35" x2="39.5" y2="35" stroke="rgba(0, 210, 255, 0.7)" strokeWidth="0.8" strokeDasharray="1 1" />
            </g>
          )}
        </svg>
      </div>

      {/* ── Refined Typography Below the Circle ── */}
      <div className="flex flex-col items-center gap-1 max-w-[280px]">
        {/* Main Text: small, medium-weight white with subtle tracking */}
        <span className="text-[12px] font-semibold text-white tracking-[0.16em] uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {mainLabel}
        </span>

        {/* Optional Secondary Text */}
        {subLabel && (
          <span className="text-[11px] font-normal text-[#9ebad6] tracking-wide drop-shadow-[0_1px_5px_rgba(0,0,0,0.75)]">
            {subLabel}
          </span>
        )}

        {/* Error Retry Button */}
        {error && onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 px-3.5 py-1 rounded-full bg-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.22)] border border-[rgba(255,255,255,0.28)] text-white text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md shadow-sm active:scale-95"
          >
            <RotateCw className="w-3 h-3 text-[#53D3E2]" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );

  if (fullPage && !isSm) {
    return (
      <div className="w-full flex-1 min-h-[400px] flex items-center justify-center p-4">
        {content}
      </div>
    );
  }

  return content;
};
