import React, { useRef, useEffect, useState } from 'react';
import {
  Send,
  Sparkles,
  FileText,
  ArrowUpRight,
  CheckCheck,
  RefreshCw,
  X,
  ChevronDown,
  User as UserIcon,
} from 'lucide-react';
import { useAiAssistant } from '../../context/AiAssistantContext';
import { useAuth } from '../../context/AuthContext';
import { User } from '../../services/api';
import { InlineAiChart } from './InlineAiChart';

interface ChatWorkspaceProps {
  mode: 'card' | 'drawer' | 'expanded';
  onClose?: () => void;
  onExpand?: () => void;
  onMinimize?: () => void;
}

// Helper to render basic markdown syntax (bold, code, lists, tables) in chat bubbles
const FormattedMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let inTable = false;

  const flushTable = (keyPrefix: string) => {
    if (tableRows.length === 0) return;
    const headerRow = tableRows[0];
    const dataRows = tableRows.slice(2); // Skip header and separator

    const parseCells = (row: string) =>
      row
        .split('|')
        .map((c) => c.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    const headers = parseCells(headerRow);

    elements.push(
      <div key={`${keyPrefix}-table`} className="my-2 overflow-x-auto rounded-xl border border-[rgba(220,236,252,0.18)] bg-[rgba(44,66,90,0.38)] backdrop-blur-sm">
        <table className="w-full text-left text-[10px] sm:text-[11px]">
          <thead className="bg-[rgba(195,222,248,0.20)] text-white font-bold border-b border-[rgba(220,236,252,0.20)]">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="py-1.5 px-2.5 whitespace-nowrap">
                  {renderInlineFormatting(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgba(220,236,252,0.10)]">
            {dataRows.map((r, ri) => {
              const cells = parseCells(r);
              return (
                <tr key={ri} className="hover:bg-[rgba(255,255,255,0.05)]">
                  {cells.map((c, ci) => (
                    <td key={ci} className="py-1.5 px-2.5 text-[#cbd5e1] whitespace-nowrap">
                      {renderInlineFormatting(c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  const renderInlineFormatting = (text: string) => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={index}
            className="px-1 py-0.5 rounded bg-[rgba(255,255,255,0.12)] text-[#53d3e2] font-mono text-[9.5px] sm:text-[10px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={index} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Table detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableRows.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(`table-${idx}`);
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={idx} className="text-xs sm:text-sm font-bold mt-2 mb-1 flex items-center gap-1 text-[#00d2ff]">
          {renderInlineFormatting(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={idx} className="text-xs sm:text-sm font-bold text-white mt-2.5 mb-1.5">
          {renderInlineFormatting(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={idx} className="flex items-start gap-1.5 ml-1 my-0.5 text-[#e2e8f0]">
          <span className="text-[#00d2ff] leading-none mt-1">•</span>
          <div className="flex-1">{renderInlineFormatting(trimmed.slice(2))}</div>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      if (match) {
        elements.push(
          <div key={idx} className="flex items-start gap-1.5 ml-1 my-0.5 text-[#e2e8f0]">
            <span className="font-bold text-[#00d2ff] text-[10px] sm:text-[11px]">{match[1]}.</span>
            <div className="flex-1">{renderInlineFormatting(match[2])}</div>
          </div>
        );
      }
    } else if (trimmed === '') {
      elements.push(<div key={idx} className="h-1.5" />);
    } else {
      elements.push(
        <p key={idx} className="my-0.5 leading-relaxed text-[#f1f5f9]">
          {renderInlineFormatting(trimmed)}
        </p>
      );
    }
  });

  if (inTable) {
    flushTable('table-final');
  }

  return <div className="space-y-0.5">{elements}</div>;
};

// Operator user avatar badge with profile picture support and graceful initial fallback
const UserAvatarBadge: React.FC<{ user: User | null }> = ({ user }) => {
  const [imgError, setImgError] = useState(false);
  const avatarSrc = user?.avatar_url || user?.avatar;

  useEffect(() => {
    setImgError(false);
  }, [avatarSrc]);

  return (
    <div
      className="w-6 h-6 rounded-full overflow-hidden border border-[rgba(210,226,240,0.3)] flex-shrink-0 mt-0.5 bg-[rgba(55,75,96,0.85)] flex items-center justify-center text-white text-[10px] font-semibold shadow-sm select-none"
      title={user?.full_name || 'Operator Profile'}
    >
      {avatarSrc && !imgError ? (
        <img
          src={avatarSrc}
          alt={user?.full_name || 'Operator'}
          className="w-full h-full object-cover rounded-full"
          onError={() => setImgError(true)}
        />
      ) : user?.full_name ? (
        <span>{user.full_name.trim().charAt(0).toUpperCase()}</span>
      ) : (
        <UserIcon className="w-3.5 h-3.5 text-white/90" />
      )}
    </div>
  );
};

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  mode,
  onClose,
  onExpand,
}) => {
  let user: User | null = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch {
    // Graceful fallback if rendered outside AuthProvider
  }

  const {
    messages,
    inputValue,
    setInputValue,
    isLoading,
    thinkingStatus,
    dataStatus,
    aiStatus,
    scenarioPrompts,
    handleSend,
    handleExportTranscript,
  } = useAiAssistant();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const checkScrollPosition = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 80;
    isUserScrolledUpRef.current = isUp;
    setShowScrollBottomBtn(isUp);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isUserScrolledUpRef.current = false;
    setShowScrollBottomBtn(false);
  };

  // Monitor DOM height changes (e.g. charts rendered asynchronously or text expansion)
  useEffect(() => {
    const wrapper = contentWrapperRef.current;
    if (!wrapper) return;

    const ro = new ResizeObserver(() => {
      if (!isUserScrolledUpRef.current) {
        scrollToBottom('smooth');
      }
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll when messages update or assistant starts/stops loading
  useEffect(() => {
    if (!isUserScrolledUpRef.current) {
      scrollToBottom('smooth');
    }
  }, [messages, isLoading]);

  const onSendSubmit = (text?: string) => {
    isUserScrolledUpRef.current = false;
    setShowScrollBottomBtn(false);
    handleSend(text);
    setTimeout(() => scrollToBottom('smooth'), 50);
  };

  const isDrawerMode = mode === 'drawer' || mode === 'expanded';

  return (
    <div className={`w-full h-full flex flex-col ${isDrawerMode ? 'p-5 sm:p-6' : 'p-4'} select-none`} style={{ minHeight: 0 }}>
      {/* ── Fixed Compact Header ── */}
      <div className="flex items-center justify-between pb-2.5 mb-1.5 flex-shrink-0 border-b border-[rgba(220,236,252,0.14)]">
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-tr from-[#00d2ff] to-[#3b82f6] flex items-center justify-center text-white shadow-[0_0_8px_rgba(0,210,255,0.4)] flex-shrink-0">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-white tracking-wide drop-shadow-sm">
              AI Plant Insights
            </h3>
            {isDrawerMode && (
              <span className="text-[11px] text-[#cbd5e1] font-normal hidden sm:inline">
                • Real-time telemetry advisor
              </span>
            )}
          </div>

          {/* Discreet Status Badges */}
          <div className="flex items-center gap-1.5 ml-1">
            <span
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                dataStatus === 'connected'
                  ? 'bg-[rgba(34,197,94,0.12)] text-[#22c55e] border-[rgba(34,197,94,0.22)]'
                  : 'bg-[rgba(239,119,116,0.12)] text-[#ef7774] border-[rgba(239,119,116,0.22)]'
              }`}
            >
              {dataStatus === 'connected' ? 'Production Data' : 'Unavailable'}
            </span>
            <span
              className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                aiStatus === 'ready'
                  ? 'bg-[rgba(0,210,255,0.12)] text-[#00d2ff] border-[rgba(0,210,255,0.22)]'
                  : 'bg-[rgba(239,119,116,0.12)] text-[#ef7774] border-[rgba(239,119,116,0.22)]'
              }`}
            >
              {aiStatus === 'ready' ? 'AI Assistant' : 'Unavailable'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 text-[#cbd5e1]">
          <button
            onClick={handleExportTranscript}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(255,255,255,0.12)] hover:text-white transition-colors cursor-pointer"
            title="Export Conversation Audit Log"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>

          {mode === 'card' && onExpand && (
            <button
              onClick={onExpand}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(255,255,255,0.12)] hover:text-white transition-colors cursor-pointer"
              title="Open AI Assistant"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}

          {isDrawerMode && onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[rgba(239,68,68,0.2)] hover:text-[#f87171] transition-colors cursor-pointer"
              title="Close Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Refined Contextual Scenario-Based Suggestions Chips ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1.5 mb-2 flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider whitespace-nowrap pl-0.5">
          Suggested:
        </span>
        {scenarioPrompts.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onSendSubmit(prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-full text-[10px] sm:text-[10.5px] font-medium whitespace-nowrap bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(0,210,255,0.16)] hover:text-[#00d2ff] hover:border-[rgba(0,210,255,0.38)] border border-[rgba(220,236,252,0.20)] text-[#cbd5e1] transition-all cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* ── Central Conversation & Visualization Area ── */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          onScroll={checkScrollPosition}
          className="w-full h-full overflow-y-auto scrollbar-none pr-1.5 space-y-3"
          style={{ minHeight: 0 }}
        >
          <div ref={contentWrapperRef} className="space-y-3 pb-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* AI Glowing Orb Avatar */}
                {m.sender === 'ai' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#00d2ff] to-[#3b82f6] flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-[0_0_8px_rgba(0,210,255,0.4)] border border-[rgba(255,255,255,0.25)]">
                    <Sparkles className="w-3 h-3" />
                  </div>
                )}

                <div className={`max-w-[85%] sm:max-w-[76%] md:max-w-[640px] flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-3 sm:p-3.5 rounded-2xl text-[11px] sm:text-xs leading-relaxed backdrop-blur-md shadow-sm ${
                      m.sender === 'user'
                        ? 'bg-[rgba(68,96,124,0.62)] border border-[rgba(220,236,252,0.28)] text-white'
                        : m.isError
                        ? 'bg-[rgba(239,68,68,0.22)] border border-[rgba(239,68,68,0.32)] text-[#fca5a5]'
                        : 'bg-[rgba(54,78,104,0.50)] hover:bg-[rgba(58,84,112,0.54)] border border-[rgba(220,236,252,0.22)] text-[#f1f5f9]'
                    }`}
                  >
                    <FormattedMarkdown content={m.text} />

                    {/* Inline Interactive Charts */}
                    {m.sender === 'ai' && !m.isError && (
                      <InlineAiChart content={m.text} />
                    )}

                    {/* Retry action on error */}
                    {m.isError && m.failedQuery && (
                      <button
                        onClick={() => onSendSubmit(m.failedQuery)}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#00d2ff] hover:underline cursor-pointer"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Retry Request
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 mt-1 px-1">
                    <span className="text-[9.5px] text-[#94a3b8] font-medium">{m.time}</span>
                    {m.sender === 'user' && <CheckCheck className="w-3 h-3 text-[#00d2ff]" />}
                  </div>
                </div>

                {/* Operator portrait badge */}
                {m.sender === 'user' && (

                  <UserAvatarBadge user={user} />
                )}
              </div>
            ))}

            {/* Assistant Thinking / Loading Indicator */}
            {isLoading && thinkingStatus && (
              <div className="flex items-start gap-2.5 justify-start">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#00d2ff] to-[#3b82f6] flex items-center justify-center text-white flex-shrink-0 shadow-[0_0_8px_rgba(0,210,255,0.4)] border border-[rgba(255,255,255,0.25)]">
                  <Sparkles className="w-3 h-3" />
                </div>
                <div className="px-3.5 py-2.5 rounded-2xl bg-[rgba(54,78,104,0.50)] border border-[rgba(220,236,252,0.22)] flex items-center justify-center shadow-sm">
                  <div className="ai-jumping-dots" aria-label="Thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating "Scroll to latest" button when user scrolled up */}
        {showScrollBottomBtn && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-2 right-4 px-3 py-1 rounded-full bg-[rgba(56,82,110,0.88)] hover:bg-[rgba(68,96,124,0.95)] border border-[rgba(220,236,252,0.25)] text-white text-[10px] font-medium shadow-lg backdrop-blur-md flex items-center gap-1 transition-all cursor-pointer animate-fade-in"
          >
            <span>Latest</span>
            <ChevronDown className="w-3 h-3 text-[#00d2ff]" />
          </button>
        )}
      </div>

      {/* ── Fixed Anchored Message Composer ── */}
      <div className="pt-2.5 flex-shrink-0 border-t border-[rgba(220,236,252,0.14)]">
        <div className="w-full flex items-center rounded-full bg-[rgba(56,82,110,0.48)] hover:bg-[rgba(65,92,122,0.56)] border border-[rgba(220,236,252,0.24)] focus-within:border-[rgba(0,210,255,0.45)] focus-within:bg-[rgba(65,92,122,0.62)] backdrop-blur-md px-3 py-1.5 transition-all shadow-inner">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendSubmit();
              }
            }}
            placeholder="Ask AI about production, batches, rejections, forecasts..."
            className="w-full bg-transparent border-none outline-none text-xs sm:text-sm text-white placeholder-[#94a3b8] px-2"
            disabled={isLoading}
          />

          {/* Send Button */}
          <button
            type="button"
            onClick={() => onSendSubmit()}
            disabled={!inputValue.trim() || isLoading}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-90 flex-shrink-0 bg-gradient-to-tr from-[#00d2ff] to-[#3b82f6] text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isLoading ? 'AI response in progress...' : 'Send Message'}
          >
            <Send className="w-3.5 h-3.5 translate-x-px" />
          </button>
        </div>
      </div>
    </div>
  );
};
