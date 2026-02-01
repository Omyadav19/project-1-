import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AppContext = createContext(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('authUser');
      if (stored) return JSON.parse(stored);
    } catch (err) {
      console.warn('Failed to parse stored user:', err);
      localStorage.removeItem('authUser');
    }
    return null;
  });

  const [currentEmotion, setCurrentEmotion] = useState(null);
  const [emotionHistory, setEmotionHistory] = useState([]);
  const [therapySessions, setTherapySessions] = useState([]);
  const [sadDetectionCount, setSadDetectionCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [apiProvider, setApiProvider] = useState('groq');

  const fetchHistory = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !user) return;

    setIsLoading(true);
    try {
      const [emotionsRes, sessionsRes] = await Promise.all([
        fetch('/api/emotion-history', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/therapy-sessions', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (emotionsRes.ok) {
        const emotions = await emotionsRes.json();
        setEmotionHistory(emotions);
      }
      if (sessionsRes.ok) {
        const sessions = await sessionsRes.json();
        setTherapySessions(sessions);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchHistory();
    } else {
      setEmotionHistory([]);
      setTherapySessions([]);
      setIsLoading(false);
    }
  }, [user, fetchHistory]);

  const addEmotionData = async (emotionData) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const res = await fetch('/api/emotion-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(emotionData)
      });
      if (res.ok) {
        const newEntry = await res.json();
        setEmotionHistory(prev => [newEntry, ...prev]);
      }
    } catch (err) {
      console.error('Error saving emotion:', err);
    }
  };

  const addTherapySession = async (session) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const res = await fetch('/api/therapy-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(session)
      });
      if (res.ok) {
        const newSession = await res.json();
        setTherapySessions(prev => [newSession, ...prev]);
      }
    } catch (err) {
      console.error('Error saving session:', err);
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setUser(null);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        logout,
        currentEmotion,
        setCurrentEmotion,
        emotionHistory,
        addEmotionData,
        therapySessions,
        addTherapySession,
        sadDetectionCount,
        setSadDetectionCount,
        isLoading,
        apiProvider,
        setApiProvider,
        refreshHistory: fetchHistory
      }}
    >
      {children}
    </AppContext.Provider>
  );
};