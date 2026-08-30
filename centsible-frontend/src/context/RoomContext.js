import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../utils/api';

const RoomContext = createContext();

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};

export const RoomProvider = ({ children, roomCode, socket }) => {
  const { user, fetchUserRooms } = useAuth() || {};
  const [roomData, setRoomData] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [budgets, setBudgets] = useState(null);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ----------------------------------------------------------------------
  // Fetch all room data
  // ----------------------------------------------------------------------
  const fetchAllRoomData = useCallback(async () => {
    if (!roomCode) return;

    setLoading(true);
    setError(null);

    try {
      const [roomRes, txRes, wishlistRes, budgetsRes, balancesRes] = await Promise.all([
        api.get(`/rooms/${roomCode}`),
        api.get(`/rooms/${roomCode}/transactions`),
        api.get(`/rooms/${roomCode}/wishlist`),
        api.get(`/rooms/${roomCode}/budgets`),
        api.get(`/rooms/${roomCode}/transactions/balances`),
      ]);

      setRoomData(roomRes.data.data);
      setTransactions(txRes.data.data);
      setWishlist(wishlistRes.data.data);
      setBudgets(budgetsRes.data.data);
      setBalances(balancesRes.data.data);
    } catch (err) {
      console.error('Failed to fetch room data:', err);
      setError(err.response?.data?.error || 'Failed to load room data');
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    fetchAllRoomData();
  }, [fetchAllRoomData]);

  // ----------------------------------------------------------------------
  // Socket.io real‑time listeners
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!socket || !roomCode) return;

    socket.emit('join-room', roomCode);

    const handleRoomUpdated = (updatedRoom) => {
      if (updatedRoom.roomCode === roomCode) {
        setRoomData(updatedRoom);
      }
    };

    const handleTransactionAdded = () => fetchAllRoomData();
    const handleTransactionUpdated = () => fetchAllRoomData();
    const handleTransactionDeleted = () => fetchAllRoomData();
    const handleBudgetUpdated = (newBudgets) => setBudgets(newBudgets);
    const handleWishlistUpdated = () => fetchAllRoomData();

    socket.on('room-updated', handleRoomUpdated);
    socket.on('room-transaction-added', handleTransactionAdded);
    socket.on('room-transaction-updated', handleTransactionUpdated);
    socket.on('room-transaction-deleted', handleTransactionDeleted);
    socket.on('room-budget-updated', handleBudgetUpdated);
    socket.on('room-wishlist-updated', handleWishlistUpdated);

    return () => {
      socket.off('room-updated', handleRoomUpdated);
      socket.off('room-transaction-added', handleTransactionAdded);
      socket.off('room-transaction-updated', handleTransactionUpdated);
      socket.off('room-transaction-deleted', handleTransactionDeleted);
      socket.off('room-budget-updated', handleBudgetUpdated);
      socket.off('room-wishlist-updated', handleWishlistUpdated);
    };
  }, [socket, roomCode, fetchAllRoomData]);

  // ----------------------------------------------------------------------
  // Transaction CRUD
  // ----------------------------------------------------------------------
  const addTransaction = async (txData) => {
    try {
      const res = await api.post(`/rooms/${roomCode}/transactions`, txData);
      await fetchAllRoomData();
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to add transaction' };
    }
  };

  const updateTransaction = async (txId, updates) => {
    try {
      const res = await api.put(`/rooms/${roomCode}/transactions/${txId}`, updates);
      await fetchAllRoomData();
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to update transaction' };
    }
  };

  const deleteTransaction = async (txId) => {
    try {
      await api.delete(`/rooms/${roomCode}/transactions/${txId}`);
      await fetchAllRoomData();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to delete transaction' };
    }
  };

  // ----------------------------------------------------------------------
  // Wishlist CRUD
  // ----------------------------------------------------------------------
  const addWishlistItem = async (item) => {
    try {
      const res = await api.post(`/rooms/${roomCode}/wishlist`, item);
      setWishlist((prev) => [...prev, res.data.data]);
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to add item' };
    }
  };

  const updateWishlistItem = async (itemId, updates) => {
    try {
      const res = await api.put(`/rooms/${roomCode}/wishlist/${itemId}`, updates);
      setWishlist((prev) => prev.map((item) => (item._id === itemId ? res.data.data : item)));
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to update item' };
    }
  };

  const deleteWishlistItem = async (itemId) => {
    try {
      await api.delete(`/rooms/${roomCode}/wishlist/${itemId}`);
      setWishlist((prev) => prev.filter((item) => item._id !== itemId));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to delete item' };
    }
  };

  // ----------------------------------------------------------------------
  // Budgets
  // ----------------------------------------------------------------------
  const updateBudgets = async (newBudgets) => {
    try {
      const res = await api.put(`/rooms/${roomCode}/budgets`, { budgets: newBudgets });
      setBudgets(res.data.data);
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to update budgets' };
    }
  };

  // ----------------------------------------------------------------------
  // Settle balances
  // ----------------------------------------------------------------------
  const settleUp = async (fromUserId, toUserId, amount) => {
    try {
      const res = await api.post(`/rooms/${roomCode}/transactions/settle`, {
        from: fromUserId,
        to: toUserId,
        amount,
      });
      await fetchAllRoomData();
      return { success: true, data: res.data.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Failed to settle' };
    }
  };

  // ----------------------------------------------------------------------
  // Leave room – FIXED: use DELETE method and await room list update
  // ----------------------------------------------------------------------
  const leaveRoom = async () => {
    try {
      await api.delete(`/rooms/${roomCode}/leave`); // Backend expects DELETE, not POST
      if (fetchUserRooms) {
        await fetchUserRooms(); // Wait for rooms list to refresh
      }
      // Clear local room state
      setRoomData(null);
      setTransactions([]);
      setWishlist([]);
      setBudgets(null);
      setBalances([]);
      return { success: true };
    } catch (err) {
      console.error('Leave room error:', err);
      return { success: false, error: err.response?.data?.error || 'Failed to leave room' };
    }
  };

  // ----------------------------------------------------------------------
  // Helper: current user role
  // ----------------------------------------------------------------------
  const currentMember = roomData?.members?.find((m) => m.userId === user?.id);
  const isAdmin = currentMember && (currentMember.role === 'owner' || currentMember.role === 'admin');
  const isOwner = currentMember?.role === 'owner';

  const value = {
    roomCode,
    roomData,
    transactions,
    wishlist,
    budgets,
    balances,
    loading,
    error,
    currentMember,
    isAdmin,
    isOwner,
    refreshRoom: fetchAllRoomData,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    updateBudgets,
    settleUp,
    leaveRoom,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};

export default RoomContext;