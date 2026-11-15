import React from 'react';
import { useLocation } from 'react-router-dom';
import { FullscreenButton } from './FullscreenButton';

export const GlobalFullscreenButton: React.FC = () => {
  const location = useLocation();
  const pathname = location.pathname.toLowerCase();

  // If inside the authenticated dashboard layout, it is embedded neatly in the top-right header controls
  const isDashboardLayout =
    pathname.startsWith('/dashboard') || pathname === '/profile';

  if (isDashboardLayout) {
    return null;
  }

  return (
    <div
      className="fixed top-4 right-5 z-[99999] select-none pointer-events-auto"
      data-testid="global-fullscreen-pill"
    >
      <FullscreenButton variant="glass-floating" />
    </div>
  );
};

export default GlobalFullscreenButton;

