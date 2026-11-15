import React, { useState, useEffect } from 'react';

interface FullscreenButtonProps {
  className?: string;
  variant?: 'glass-floating' | 'glass-header';
  title?: string;
}

export const FullscreenButton: React.FC<FullscreenButtonProps> = ({
  className = '',
  variant = 'glass-floating',
  title,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as any;
    return Boolean(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
  });

  useEffect(() => {
    const checkFullscreen = () => {
      const doc = document as any;
      setIsFullscreen(
        Boolean(
          doc.fullscreenElement ||
          doc.webkitFullscreenElement ||
          doc.mozFullScreenElement ||
          doc.msFullscreenElement
        )
      );
    };

    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    document.addEventListener('mozfullscreenchange', checkFullscreen);
    document.addEventListener('MSFullscreenChange', checkFullscreen);

    checkFullscreen();

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
      document.removeEventListener('mozfullscreenchange', checkFullscreen);
      document.removeEventListener('MSFullscreenChange', checkFullscreen);
    };
  }, []);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const doc = document as any;
      const docEl = document.documentElement as any;

      const isCurrentlyFs = Boolean(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (isCurrentlyFs) {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      } else {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle request could not be completed:', err);
    }
  };

  const defaultClasses =
    variant === 'glass-header'
      ? 'w-[34px] h-[34px] rounded-full flex items-center justify-center bg-[rgba(55,75,96,0.42)] hover:bg-[rgba(68,90,114,0.58)] border border-[rgba(210,226,240,0.22)] hover:border-[rgba(210,226,240,0.45)] text-white backdrop-blur-md transition-all cursor-pointer shadow-sm active:scale-95'
      : 'w-9 h-9 rounded-full flex items-center justify-center bg-[rgba(10,14,20,0.78)] hover:bg-[rgba(20,28,38,0.92)] border border-[rgba(255,255,255,0.22)] hover:border-[rgba(255,255,255,0.48)] text-[#dfe7e0] hover:text-white backdrop-blur-md shadow-lg shadow-black/40 transition-all duration-200 cursor-pointer active:scale-95';

  const defaultTitle = isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen';

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`${defaultClasses} ${className}`}
      title={title || defaultTitle}
      aria-label={title || defaultTitle}
      data-testid="fullscreen-toggle-btn"
    >
      {isFullscreen ? (
        /* Exit Fullscreen Icon (Diagonal inward arrows) */
        <svg
          className="w-4 h-4 text-current transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Top-left inwards */}
          <polyline points="4 14 10 14 10 20" />
          <line x1="10" y1="14" x2="3" y2="21" />
          {/* Bottom-right inwards */}
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
        </svg>
      ) : (
        /* Enter Fullscreen Icon (Diagonal outward arrows - matches screenshot) */
        <svg
          className="w-4 h-4 text-current transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Top-Right Arrow (Outward) */}
          <polyline points="15 3 21 3 21 9" />
          <line x1="21" y1="3" x2="14" y2="10" />
          {/* Bottom-Left Arrow (Outward) */}
          <polyline points="9 21 3 21 3 15" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      )}
    </button>
  );
};

export default FullscreenButton;

