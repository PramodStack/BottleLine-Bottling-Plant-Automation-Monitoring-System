import React, { useEffect, useRef } from 'react';

export const KageLandingPage: React.FC = () => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'PULSE — Smart Bottling & Industrial Intelligence';

    // Prevent outer window scrollbars entirely
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlScrollbar = document.documentElement.style.scrollbarWidth;
    const prevBodyScrollbar = document.body.style.scrollbarWidth;

    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.scrollbarWidth = 'none';
    document.body.style.overflow = 'hidden';
    document.body.style.scrollbarWidth = 'none';

    // Focus iframe for immediate keyboard and scroll interaction
    const timer = setTimeout(() => {
      if (iframeRef.current) {
        try {
          iframeRef.current.focus();
        } catch {
          // ignore focus restrictions if cross-origin
        }
      }
    }, 250);

    return () => {
      document.title = prevTitle;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.scrollbarWidth = prevHtmlScrollbar;
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.scrollbarWidth = prevBodyScrollbar;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-[#05070a] overflow-hidden m-0 p-0 select-none"
      style={{ overflow: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <iframe
        ref={iframeRef}
        src="/landing-pages/kage.html"
        title="PULSE — Smart Bottling & Industrial Intelligence"
        className="w-full h-full border-0 block"
        style={{
          width: '100vw',
          height: '100vh',
          border: 'none',
          display: 'block',
          backgroundColor: '#05070a',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          scrollbarWidth: 'none',
        }}
        allow="fullscreen; accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
};

export default KageLandingPage;
