import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, SummaryData } from '../services/api';
import { usePlantData } from './PlantDataContext';

export interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
  isError?: boolean;
  failedQuery?: string;
}

interface AiAssistantContextType {
  messages: Message[];
  inputValue: string;
  setInputValue: (val: string) => void;
  isLoading: boolean;
  thinkingStatus: string;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  dataStatus: 'connected' | 'unavailable';
  aiStatus: 'ready' | 'unavailable';
  scenarioPrompts: string[];
  handleSend: (queryText?: string) => Promise<void>;
  handleCancel: () => void;
  handleExportTranscript: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextType | undefined>(undefined);

const INITIAL_MESSAGE: Message = {
  id: 'init-1',
  sender: 'ai',
  text: "Hey there! 👋 I'm your Bottling Plant AI companion. Whether you want to check live production stats, talk industrial automation, debug code, or just chat, I'm here for you! How can I help today? ✨",
  time: 'Ready',
};

export const AiAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = usePlantData();
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string>('Thinking');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<'connected' | 'unavailable'>('connected');
  const [aiStatus, setAiStatus] = useState<'ready' | 'unavailable'>('ready');
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Check backend AI service health on mount
  useEffect(() => {
    api.getAiHealth()
      .then((h: any) => {
        if (h?.production_data === 'connected' || h?.status === 'healthy') {
          setDataStatus('connected');
        } else {
          setDataStatus('unavailable');
        }
        if (h?.ai_assistant === 'ready' || h?.status === 'healthy') {
          setAiStatus('ready');
        } else {
          setAiStatus('unavailable');
        }
      })
      .catch(() => {
        setDataStatus('unavailable');
        setAiStatus('unavailable');
      });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Compute scenario-based contextual suggested questions based on real live state
  const scenarioPrompts = useMemo(() => {
    const summary = data?.summary;
    const batch = data?.batch;
    const recentLogs = data?.recent_logs || [];
    const prompts: string[] = [];

    const rejectedCount = summary?.rejected_bottles ?? 0;
    const rejectionRate = summary?.rejection_rate ?? 0;
    const passRate = summary?.quality_pass_rate ?? 100;
    const totalBottles = summary?.total_bottles ?? 0;

    // Check if any recent logs have rejection or underfill
    const hasRejectedLog = recentLogs.some(
      (l) => l.inspection_status?.toLowerCase().includes('reject') || l.weight_status?.toLowerCase().includes('under')
    );

    // Scenario 1: Rejection rate elevated or defects observed
    if (rejectedCount > 0 || rejectionRate > 0.8 || hasRejectedLog) {
      prompts.push("Why was Bottle #1 rejected?");
      prompts.push("What could be causing the rejection increase?");
      prompts.push("Which quality checks need attention?");
      prompts.push("How can we reduce rejected bottles?");
    }

    // Scenario 2: Active batch in progress or target remaining
    if (batch && (batch.batch_status === 'Running' || batch.batch_status === 'active' || (batch.target_quantity && totalBottles < batch.target_quantity))) {
      prompts.push("Summarize the current batch.");
      prompts.push("How much production remains to reach the target?");
      prompts.push("Estimate output by the end of the shift.");
    }

    // Scenario 3: Nominal / high yield operation
    if (passRate >= 98 && totalBottles > 0) {
      prompts.push("Analyze today's production.");
      prompts.push("How many boxes have been packed?");
      prompts.push("What improvements could increase efficiency?");
      prompts.push("Predict end-of-shift output.");
    }

    // Scenario 4: Historical / trend analysis
    prompts.push("Show the production trend.");
    prompts.push("Is any sensor reporting an abnormal state?");

    // Return the top 4 distinct suggestions
    return Array.from(new Set(prompts)).slice(0, 4);
  }, [data]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setThinkingStatus('');
  }, []);

  const handleSend = useCallback(
    async (queryText?: string) => {
      const rawText = queryText || inputValue;
      const textToSend = rawText.trim().slice(0, 1500);
      if (!textToSend || isLoading) return;

      // Abort any prior in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const userMessage: Message = {
        id: `usr-${Date.now()}`,
        sender: 'user',
        text: textToSend,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputValue('');
      setIsLoading(true);
      setThinkingStatus('Analyzing your question…');

      // Keep only last 4 turns for low prompt size and speed
      const historyPayload = messages.slice(-4).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      let aiMsgId: string | null = null;
      let accumulatedText = '';

      try {
        await api.streamAiChat(
          textToSend,
          historyPayload,
          {
            onStatus: (status) => {
              if (!aiMsgId) {
                setThinkingStatus(status);
              }
            },
            onDelta: (delta) => {
              if (!delta) return;
              accumulatedText += delta;

              if (!aiMsgId) {
                // First token arrived! Create response bubble and remove thinking indicator
                aiMsgId = `ai-${Date.now()}`;
                const newMsg: Message = {
                  id: aiMsgId,
                  sender: 'ai',
                  text: accumulatedText,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setThinkingStatus('');
                setMessages((prev) => [...prev, newMsg]);
              } else {
                // Progressive streaming into existing message bubble
                const currentId = aiMsgId;
                setMessages((prev) =>
                  prev.map((m) => (m.id === currentId ? { ...m, text: accumulatedText } : m))
                );
              }
            },
            onDone: () => {
              setIsLoading(false);
              setThinkingStatus('');
              abortControllerRef.current = null;
            },
            onError: (errMessage) => {
              if (!accumulatedText) {
                const errorMsg: Message = {
                  id: `err-${Date.now()}`,
                  sender: 'ai',
                  text: `⚠️ Operational Notice: ${errMessage}`,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  isError: true,
                  failedQuery: textToSend,
                };
                setMessages((prev) => [...prev, errorMsg]);
              }
              setIsLoading(false);
              setThinkingStatus('');
              abortControllerRef.current = null;
            },
          },
          controller.signal
        );
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Request intentionally cancelled by user
          return;
        }

        // If streaming failed completely before any tokens arrived, fallback to non-streaming request
        if (!accumulatedText) {
          try {
            setThinkingStatus('Checking production data…');
            const res = await api.sendAiChat(textToSend, historyPayload);
            if (res.success && res.reply) {
              const fallbackMsg: Message = {
                id: `ai-${Date.now()}`,
                sender: 'ai',
                text: res.reply,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              };
              setMessages((prev) => [...prev, fallbackMsg]);
            } else {
              throw new Error(res.message || 'Unable to retrieve production records.');
            }
          } catch (fallbackErr: any) {
            const errorMsg: Message = {
              id: `err-${Date.now()}`,
              sender: 'ai',
              text: '⚠️ Communication Notice: Could not connect to the plant telemetry service. Please verify system connectivity and try again.',
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isError: true,
              failedQuery: textToSend,
            };
            setMessages((prev) => [...prev, errorMsg]);
          }
        }
      } finally {
        setIsLoading(false);
        setThinkingStatus('');
        abortControllerRef.current = null;
      }
    },
    [inputValue, isLoading, messages]
  );

  const handleExportTranscript = useCallback(() => {
    const lines = [
      '=================================================================',
      '  BOTTLING PLANT MANAGEMENT SYSTEM — AI PLANT INSIGHTS AUDIT LOG',
      `  Generated: ${new Date().toLocaleString()}`,
      '=================================================================\n',
    ];

    messages.forEach((m) => {
      lines.push(`[${m.time}] ${m.sender === 'user' ? 'OPERATOR' : 'AI PLANT ADVISOR'}:`);
      lines.push(`${m.text}\n`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Plant_Insights_Log_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  return (
    <AiAssistantContext.Provider
      value={{
        messages,
        inputValue,
        setInputValue,
        isLoading,
        thinkingStatus,
        isExpanded,
        setIsExpanded,
        isDrawerOpen,
        setIsDrawerOpen,
        dataStatus,
        aiStatus,
        scenarioPrompts,
        handleSend,
        handleCancel,
        handleExportTranscript,
      }}
    >
      {children}
    </AiAssistantContext.Provider>
  );
};

export const useAiAssistant = () => {
  const context = useContext(AiAssistantContext);
  if (!context) {
    throw new Error('useAiAssistant must be used within an AiAssistantProvider');
  }
  return context;
};
