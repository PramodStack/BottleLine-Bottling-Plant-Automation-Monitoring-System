import React from 'react';
import { useAiAssistant } from '../../context/AiAssistantContext';
import { ChatWorkspace } from './ChatWorkspace';
import { SummaryData } from '../../services/api';

interface IndustrialAssistantProps {
  summary?: SummaryData;
}

export const IndustrialAssistant: React.FC<IndustrialAssistantProps> = () => {
  const { setIsDrawerOpen } = useAiAssistant();

  return (
    <ChatWorkspace
      mode="card"
      onExpand={() => setIsDrawerOpen(true)}
    />
  );
};
