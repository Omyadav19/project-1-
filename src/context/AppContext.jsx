import { createContext, useContext, useState } from 'react';

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
    // Load persisted user (stored at login) to survive page reloads.
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

  const addEmotionData = (emotion) => {
    setEmotionHistory(prev => [...prev, emotion]);
  };

  const addTherapySession = (session) => {
    setTherapySessions(prev => [...prev, session]);
  };
  
  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    setUser(null);
  };

  // Debug user state
  console.log('AppContext user state:', user ? { id: user.id, username: user.username } : 'null');
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};