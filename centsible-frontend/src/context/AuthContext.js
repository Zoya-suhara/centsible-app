// centsible-frontend/src/context/AuthContext.js
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import api, { setAuthToken, clearAuthData, transactionAPI, wishlistAPI, reminderAPI } from '../utils/api';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [loadingWishlist, setLoadingWishlist] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false); 
  const [token, setToken] = useLocalStorage('token', null);
  const [transactions, setTransactions] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [userRooms, setUserRooms] = useState([]); 

  // ---------- HELPER: Save/Load financial data (localStorage fallback) ----------
  const saveFinancialData = (data) => {
    if (data) {
      localStorage.setItem('centsible_user', JSON.stringify(data));
    } else {
      localStorage.removeItem('centsible_user');
    }
  };

  const loadFinancialData = () => {
    const saved = localStorage.getItem('centsible_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse financial data', e);
        return null;
      }
    }
    return null;
  };

  const updateUserData = (newData) => {
    setUserData(newData);
    saveFinancialData(newData);
  };

  // Store both access token and refresh token
  const setTokensAndStore = (accessToken, refreshToken) => {
    if (accessToken) {
      setToken(accessToken);
      setAuthToken(accessToken);
    } else {
      setToken(null);
      clearAuthData();
    }
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    } else {
      localStorage.removeItem('refreshToken');
    }
  };

  // ---------- LOAD FUNCTIONS (extract data from response.data.data) ----------
 const loadTransactionsFromBackend = useCallback(async () => {
  setLoadingTransactions(true);
  try {
    const response = await transactionAPI.getAll();
    if (response.data && Array.isArray(response.data.data)) {
      // ✅ Normalize _id → id
      const normalized = response.data.data.map(t => ({
        ...t,
        id: t._id || t.id
      }));
      setTransactions(normalized);
      return normalized;
    }
    return [];
  } catch (error) {
    console.error('Failed to load transactions:', error);
    return [];
  } finally {
    setLoadingTransactions(false);
  }
}, []);

  const loadWishlistFromBackend = useCallback(async () => {
  setLoadingWishlist(true);
  try {
    const response = await wishlistAPI.getAll();
    if (response.data && Array.isArray(response.data.data)) {
      const normalized = response.data.data.map(item => ({
        ...item,
        id: item._id || item.id,
        name: item.name || item.item // handle old data with 'item' property
      }));
      setWishlist(normalized);
      return normalized;
    }
    return [];
  } catch (error) {
    console.error('Failed to load wishlist:', error);
    return [];
  } finally {
    setLoadingWishlist(false);
  }
}, []);

  const loadRemindersFromBackend = useCallback(async () => {
    setLoadingReminders(true);
    try {
      const response = await reminderAPI.getAll();
      if (response.data.success && Array.isArray(response.data.reminders)) {
        setReminders(response.data.reminders);
        return response.data.reminders;
      }
      return [];
    } catch (error) {
      console.error('Failed to load reminders:', error);
      return [];
    } finally {
      setLoadingReminders(false);
    }
  }, []);

   // ---------- FETCH USER'S ROOMS ----------
const fetchUserRooms = useCallback(async () => {
  // Don't fetch if no user ID yet
  if (!user?.id) {
    console.log('⏭️ Skipping fetchUserRooms - no user ID');
    return [];
  }
  
  setLoadingRooms(true);
  try {
    const response = await api.get('/rooms/user/my-rooms');
    if (response.data.success) {
      const rooms = response.data.data.map(room => ({
        ...room,
        currentUserId: user.id
      }));
      setUserRooms(rooms);
      console.log(`📋 Fetched ${rooms.length} user rooms`);
      return rooms;
    }
    return [];
  } catch (error) {
    // 401/403 are expected if not logged in - don't log as errors
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.log('🔒 Not authenticated for room fetch');
    } else {
      console.error('Failed to load user rooms:', error);
    }
    return [];
  } finally {
    setLoadingRooms(false);
  }
}, [user?.id]); // Depend only on user.id, not whole user object

  // ---------- TRANSACTION CRUD ----------
 const addTransaction = async (transactionData) => {
  const tempId = `temp_${Date.now()}`;
  const tempTransaction = { ...transactionData, id: tempId, _optimistic: true };
  
  setTransactions(prev => [tempTransaction, ...prev]);
  
  try {
    const response = await transactionAPI.create(transactionData);
    const savedTransaction = response.data.data || response.data;
    // ✅ Normalize _id → id
    const normalizedTransaction = {
      ...savedTransaction,
      id: savedTransaction._id || savedTransaction.id
    };
    setTransactions(prev => prev.map(t => t.id === tempId ? normalizedTransaction : t));
    return { success: true, transaction: normalizedTransaction };
  } catch (error) {
    setTransactions(prev => prev.filter(t => t.id !== tempId));
    const errorMsg = error.response?.data?.error || error.message;
    alert(`Failed to save: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
};

  const updateTransaction = async (id, updates) => {
  try {
    const response = await transactionAPI.update(id, updates);
    const updated = response.data.data;
    // ✅ Normalize _id → id
    const normalizedUpdated = {
      ...updated,
      id: updated._id || updated.id
    };
    setTransactions(prev => prev.map(t => t.id === id ? normalizedUpdated : t));
    return { success: true, transaction: normalizedUpdated };
  } catch (error) {
    console.error('Failed to update transaction:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};

  const deleteTransaction = async (id) => {
    try {
      await transactionAPI.delete(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
      return { success: true };
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return { success: false, error: error.response?.data?.error || error.message };
    }
  };
const clearAllTransactions = async () => {
  try {
    const txList = [...transactions];
    const errors = [];
    
    for (const tx of txList) {
      // Skip temporary/optimistic IDs – they don't exist on the server
      if (tx.id?.toString().startsWith('temp_')) {
        continue;
      }
      try {
        await transactionAPI.delete(tx.id);
      } catch (err) {
        // Log the error but continue with other deletions
        console.warn(`Failed to delete transaction ${tx.id}:`, err.message);
        errors.push({ id: tx.id, error: err.message });
      }
    }
    
    // Clear local state regardless of server errors
    setTransactions([]);
    
    if (errors.length > 0) {
      console.error(`⚠️ ${errors.length} deletions failed`, errors);
      return { 
        success: false, 
        error: `${errors.length} items could not be deleted from server` 
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to clear all transactions:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};

  // ---------- WISHLIST CRUD ----------
  const addWishlistItem = async (itemData) => {
  try {
    // Remove any id/_id to avoid strict mode errors
    const { id, _id, ...cleanItem } = itemData;
    const response = await wishlistAPI.create(cleanItem);
    const newItem = response.data.data;
    const normalizedItem = {
      ...newItem,
      id: newItem._id || newItem.id,
      name: newItem.name || newItem.item
    };
    setWishlist(prev => [...prev, normalizedItem]);
    return { success: true, item: normalizedItem };
  } catch (error) {
    console.error('Failed to add wishlist item:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};

 const updateWishlistItem = async (id, updates) => {
  try {
    const response = await wishlistAPI.update(id, updates);
    const updated = response.data.data;
    const normalizedUpdated = {
      ...updated,
      id: updated._id || updated.id,
      name: updated.name || updated.item
    };
    setWishlist(prev => prev.map(item => (item.id === id || item._id === id) ? normalizedUpdated : item));
    return { success: true, item: normalizedUpdated };
  } catch (error) {
    console.error('Failed to update wishlist item:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};


  const deleteWishlistItem = async (id) => {
  try {
    await wishlistAPI.delete(id);
    setWishlist(prev => prev.filter(item => item.id !== id && item._id !== id));
    return { success: true };
  } catch (error) {
    console.error('Failed to delete wishlist item:', error);
    return { success: false, error: error.response?.data?.error || error.message };
  }
};

  // ---------- REMINDER CRUD (FIXED: pass two arguments, not an object) ----------
  const setReminder = async (type, date) => {
    try {
      // ✅ Correct: pass type and date as separate arguments
      const response = await reminderAPI.create(type, date);
      if (response.data.success) {
        setReminders(prev => {
          const filtered = prev.filter(r => r.type !== type);
          return [...filtered, response.data.reminder];
        });
        return { success: true };
      }
      return { success: false, error: response.data.error };
    } catch (error) {
      console.error('Failed to set reminder:', error);
      return { success: false, error: error.message };
    }
  };

  const deleteReminder = async (type) => {
    try {
      await reminderAPI.delete(type);
      setReminders(prev => prev.filter(r => r.type !== type));
      return { success: true };
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      return { success: false, error: error.message };
    }
  };

  // ---------- ONBOARDING STATUS ----------
  const getOnboardingStatus = () => {
    if (!userData) return { hasCompletedOnboarding: false, isFirstTimeUser: true };
    const hasIncome = userData.income > 0;
    const hasExpenses = userData.expenses && Object.keys(userData.expenses).length > 0;
    const hasCompletedOnboarding = hasIncome || hasExpenses;
    return {
      hasCompletedOnboarding,
      isFirstTimeUser: !hasCompletedOnboarding
    };
  };

  // ---------- REGISTER ----------
  const register = async (userDataPayload) => {
    try {
      const response = await api.post('/auth/register', userDataPayload);
      if (response.data.success) {
        setTokensAndStore(response.data.token, response.data.refreshToken);
        setUser(response.data.user);
        const defaultFinancial = {
          id: response.data.user.id,
          income: 0,
          expenses: {},
          disposableIncome: 0,
          savingsGoal: 0,
          currency: 'AED',
          setupDate: new Date().toISOString(),
        };
        updateUserData(defaultFinancial);
        await loadTransactionsFromBackend();
        await loadWishlistFromBackend();
        await loadRemindersFromBackend();
        if (response.data.user?.id) {
          await fetchUserRooms();
        }
        return { success: true, user: response.data.user };
      } else {
        return { success: false, error: response.data.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      const message = error.response?.data?.error || error.message || 'Network error. Please try again.';
      return { success: false, error: message };
    }
  };

  // ---------- LOGIN ----------
  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      if (response.data.success) {
        setTokensAndStore(response.data.token, response.data.refreshToken);
        setUser(response.data.user);
        const existingFinancial = loadFinancialData();
        if (existingFinancial && existingFinancial.id === response.data.user.id) {
          setUserData(existingFinancial);
        } else {
          const defaultFinancial = {
            id: response.data.user.id,
            income: 0,
            expenses: {},
            disposableIncome: 0,
            savingsGoal: 0,
            currency: 'AED',
            setupDate: new Date().toISOString(),
          };
          updateUserData(defaultFinancial);
        }
        await loadTransactionsFromBackend();
        await loadWishlistFromBackend();
        await loadRemindersFromBackend();
                if (response.data.user?.id) {
          await fetchUserRooms();
        }
        return { success: true, user: response.data.user };
      } else {
        return { success: false, error: response.data.error || 'Invalid credentials' };
      }
    } catch (error) {
      console.error('Login error:', error);
      const message = error.response?.data?.error || error.message || 'Network error. Please try again.';
      return { success: false, error: message };
    }
  };

  // ---------- LOGOUT ----------
  const logout = () => {
    setTokensAndStore(null, null);
    setUser(null);
    setUserData(null);
    setTransactions([]);
    setWishlist([]);
    setReminders([]);
    setUserRooms([]);
    localStorage.removeItem('centsible_user');
    localStorage.removeItem('centsible_transactions');
    localStorage.removeItem('centsible_wishlist');
    localStorage.removeItem('centsible_reminders');
    localStorage.removeItem('centsible_roomCode');
    localStorage.removeItem('centsible_userName');
    localStorage.removeItem('centsible_userId');
  };

  // ---------- GET CURRENT USER ----------
  const getCurrentUser = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.user);
        const financialData = loadFinancialData();
        if (financialData && financialData.id === response.data.user.id) {
          setUserData(financialData);
        } else {
          const defaultFinancial = {
            id: response.data.user.id,
            income: 0,
            expenses: {},
            disposableIncome: 0,
            savingsGoal: 0,
            currency: 'AED',
            setupDate: new Date().toISOString(),
          };
          updateUserData(defaultFinancial);
        }
        await loadTransactionsFromBackend();
        await loadWishlistFromBackend();
        await loadRemindersFromBackend();
                if (response.data.user?.id) {
          await fetchUserRooms();
        }
      } else {
        setTokensAndStore(null, null);
        setUser(null);
        setUserData(null);
      }
    } catch (error) {
      console.error('Get user error:', error);
      setTokensAndStore(null, null);
      setUser(null);
      setUserData(null);
    } finally {
      setLoading(false);
    }
  };

  // ---------- UPDATE USER PROFILE ----------
  const updateUser = async (updates) => {
    try {
      const response = await api.put('/auth/update', updates);
      if (response.data.success) {
        setUser(response.data.user);
        if (userData) {
          let updatedUserData = { ...userData };
          if (updates.currency !== undefined) updatedUserData.currency = updates.currency;
          if (updates.savingsGoal !== undefined) updatedUserData.savingsGoal = updates.savingsGoal;
          if (updates.weeklyBudget !== undefined) updatedUserData.weeklyBudget = updates.weeklyBudget;
          updateUserData(updatedUserData);
        }
        return { success: true, user: response.data.user };
      } else {
        return { success: false, error: response.data.error || 'Update failed' };
      }
    } catch (error) {
      console.error('Update user error:', error);
      const message = error.response?.data?.error || error.message || 'Network error. Please try again.';
      return { success: false, error: message };
    }
  };

  // ---------- CHANGE PASSWORD ----------
  const changePassword = async (passwordData) => {
    try {
      const response = await api.post('/auth/change-password', passwordData);
      if (response.data.success) {
        return { success: true };
      } else {
        return { success: false, error: response.data.error || 'Password change failed' };
      }
    } catch (error) {
      console.error('Change password error:', error);
      const message = error.response?.data?.error || error.message || 'Network error. Please try again.';
      return { success: false, error: message };
    }
  };

    // Auto-load user on mount
  useEffect(() => {
    getCurrentUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { hasCompletedOnboarding, isFirstTimeUser } = getOnboardingStatus();

  const refreshTransactions = useCallback(() => loadTransactionsFromBackend(), [loadTransactionsFromBackend]);
  const refreshWishlist = useCallback(() => loadWishlistFromBackend(), [loadWishlistFromBackend]);
  const refreshReminders = useCallback(() => loadRemindersFromBackend(), [loadRemindersFromBackend]);

  const value = {
    user,
    setUser,
    userData,
    updateUserData,
    loading,
    token,
    register,
    login,
    logout,
    updateUser,
    changePassword,
    isAuthenticated: !!user,
    hasCompletedOnboarding,
    isFirstTimeUser,
    transactions,
    wishlist,
    reminders,
    loadingTransactions,
    loadingWishlist,
    loadingReminders,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    clearAllTransactions,
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    setReminder,
    deleteReminder,
    refreshTransactions,
    refreshWishlist,
    refreshReminders,
    userRooms,           
    loadingRooms,        
    fetchUserRooms,   
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};