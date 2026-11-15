import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface DropdownOption {
  label: string;
  value: string;
}

export interface StatusDropdownConfig {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
}

interface ToolbarContextType {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusDropdown: StatusDropdownConfig | null;
  setStatusDropdown: (cfg: StatusDropdownConfig | null) => void;
  registerDownloadHandler: (fn: (() => void) | null) => void;
  triggerDownload: () => void;
  registerRefreshHandler: (fn: (() => Promise<void> | void) | null) => void;
  triggerRefresh: () => Promise<void>;
  isRefreshing: boolean;
  isNewBatchOpen: boolean;
  setIsNewBatchOpen: (open: boolean) => void;
}

const ToolbarContext = createContext<ToolbarContextType | undefined>(undefined);

export const ToolbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusDropdown, setStatusDropdown] = useState<StatusDropdownConfig | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isNewBatchOpen, setIsNewBatchOpen] = useState(false);

  const downloadHandlerRef = useRef<(() => void) | null>(null);
  const refreshHandlerRef = useRef<(() => Promise<void> | void) | null>(null);

  const registerDownloadHandler = useCallback((fn: (() => void) | null) => {
    downloadHandlerRef.current = fn;
  }, []);

  const triggerDownload = useCallback(() => {
    if (downloadHandlerRef.current) {
      downloadHandlerRef.current();
    }
  }, []);

  const registerRefreshHandler = useCallback((fn: (() => Promise<void> | void) | null) => {
    refreshHandlerRef.current = fn;
  }, []);

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (refreshHandlerRef.current) {
        await refreshHandlerRef.current();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <ToolbarContext.Provider
      value={{
        searchTerm,
        setSearchTerm,
        statusDropdown,
        setStatusDropdown,
        registerDownloadHandler,
        triggerDownload,
        registerRefreshHandler,
        triggerRefresh,
        isRefreshing,
        isNewBatchOpen,
        setIsNewBatchOpen,
      }}
    >
      {children}
    </ToolbarContext.Provider>
  );
};

export const useToolbar = () => {
  const ctx = useContext(ToolbarContext);
  if (!ctx) {
    throw new Error('useToolbar must be used within a ToolbarProvider');
  }
  return ctx;
};
