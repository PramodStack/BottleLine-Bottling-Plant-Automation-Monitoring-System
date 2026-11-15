import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, DashboardResponse } from '../services/api';
import { useAuth } from './AuthContext';

interface PlantDataContextType {
  data: DashboardResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => Promise<void>;
  pollingInterval: number;
  setPollingInterval: (ms: number) => void;
}

const PlantDataContext = createContext<PlantDataContextType | undefined>(undefined);

export const PlantDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number>(4000); // 4s polling matching physical tick rhythm

  const isFetchingRef = useRef(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (!isAuthenticated || isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isManual) setRefreshing(true);

    try {
      const res = await api.getDashboardSummary();
      if (res.success) {
        setData(res);
        setError(null);
        setLastUpdated(res.last_updated);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to communicate with plant telemetry');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [isAuthenticated, pollingInterval, fetchData]);

  const refresh = async () => {
    await fetchData(true);
  };

  return (
    <PlantDataContext.Provider
      value={{
        data,
        loading,
        refreshing,
        error,
        lastUpdated,
        refresh,
        pollingInterval,
        setPollingInterval,
      }}
    >
      {children}
    </PlantDataContext.Provider>
  );
};

export const usePlantData = () => {
  const context = useContext(PlantDataContext);
  if (!context) {
    throw new Error('usePlantData must be used within a PlantDataProvider');
  }
  return context;
};
