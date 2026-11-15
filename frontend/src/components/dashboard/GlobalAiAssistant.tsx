import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAiAssistant } from '../../context/AiAssistantContext';
import { ChatWorkspace } from './ChatWorkspace';

export const GlobalAiAssistant: React.FC = () => {
  const location = useLocation();
  const { isDrawerOpen, setIsDrawerOpen } = useAiAssistant();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  // Normalize path to verify if on overview page
  const normalizedPath = location.pathname.replace(/\/$/, '') || '/dashboard';
  const isOverviewPage = normalizedPath === '/dashboard';

  // Keyboard accessibility: Close drawer on Escape
  useEffect(() => {
    if (!isDrawerOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsDrawerOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Prevent background scrolling while drawer is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus drawer container
    if (drawerRef.current) {
      drawerRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isDrawerOpen, setIsDrawerOpen]);

  // If on Overview page, do not render floating button (since full card is already on the page with expand button)
  const showFloatingButton = !isOverviewPage;

  return (
    <>
      {/* ── Global Floating Circular Button (on all other pages) ── */}
      {showFloatingButton && (
        <div className="fixed bottom-6 right-6 z-40 select-none">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open AI assistant"
            title="Open AI Plant Assistant"
            className="relative w-14 h-14 sm:w-15 sm:h-15 rounded-full bg-gradient-to-tr from-[#00d2ff] via-[#2563eb] to-[#00d2ff] flex items-center justify-center text-white shadow-[0_8px_32px_rgba(0,210,255,0.45)] border border-[rgba(255,255,255,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer group"
          >
            {/* Glowing ring animation */}
            <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-[#00d2ff] to-[#3b82f6] opacity-35 blur-sm group-hover:opacity-75 animate-pulse" />

            <div className="relative flex items-center justify-center">
              <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-md group-hover:rotate-12 transition-transform duration-300" />
            </div>
          </button>
        </div>
      )}

      {/* ── Right-Side Slide-Over Glass Drawer (available on all pages including Overview) ── */}
      {isDrawerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-end p-3 sm:p-4 md:p-5 glass-modal-overlay animate-fade-in select-none"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsDrawerOpen(false);
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="AI Plant Insights Assistant"
          >
            <div
              ref={drawerRef}
              tabIndex={-1}
              className="relative h-[92vh] w-full sm:w-[500px] md:w-[45vw] max-w-[760px] glass-modal flex flex-col overflow-hidden outline-none animate-in slide-in-from-right duration-300"
            >
              <ChatWorkspace
                mode="drawer"
                onClose={() => setIsDrawerOpen(false)}
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
