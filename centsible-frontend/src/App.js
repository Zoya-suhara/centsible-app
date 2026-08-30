import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import { io } from 'socket.io-client';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import TransactionForm from './components/TransactionForm';
import CalculationVisual from './components/CalculationVisual';
import SharedRoomBackend from './components/SharedRoomBackend';
import WishList from './components/WishList';
import DailyDashboard from './components/DailyDashboard';
import BudgetLedger from './components/BudgetLedger';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Settings from './pages/Settings';
import ResetPassword from './pages/ResetPassword';
import ForgotPassword from './pages/ForgotPassword';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import OnboardingRouter from './components/OnboardingRouter';
import AIConversationWizard from './components/AIConversationWizard';
import SharedRoomContainer from './components/SharedRoomContainer';
import MyRooms from './components/MyRooms';
import { ToastContainer } from './components/ToastNotifications';


// ========== PROTECTED ROUTE COMPONENT ==========
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return children;
};

// ========== MAIN APP COMPONENT ==========
function App() {
  // ----- Auth from context -----
  const { 
    userData, 
    transactions, 
    wishlist,
    addTransaction, 
    updateTransaction, 
    deleteTransaction,
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    updateUserData,
    logout: authLogout,
    hasCompletedOnboarding, 
    clearAllTransactions 
  } = useAuth();

  // ----- Local state -----
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  
  const [showAIModal, setShowAIModal] = useState(false);
const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  
  const [socket, setSocket] = useState(null);

  const navigate = useNavigate();

  // ----- Transaction handlers -----
  const handleAddTransaction = (transactionData, source = 'manual') => {
    const newTransaction = {
      ...transactionData,
      source,
      date: transactionData.date || new Date().toISOString().split('T')[0],
    };
    addTransaction(newTransaction);
  };

  const handleEditTransaction = (id, updates) => {
  console.log('📝 App.handleEditTransaction called – ID:', id, 'Updates:', updates);
  updateTransaction(id, updates);
};

  const handleDeleteTransaction = (id) => {
  console.log('🗑️ App.handleDeleteTransaction called – ID:', id);
  if (window.confirm('Are you sure you want to delete this transaction?')) {
    deleteTransaction(id);
  }
};

  // ----- Wishlist handlers -----
  const handleAddWishlistFromAI = (wishlistData) => {
    const newItem = {
      ...wishlistData,
      savedAmount: 0,
      addedDate: new Date().toISOString(),
    };
    addWishlistItem(newItem);
  };

  const handleEditRecordFromAI = (recordId, updates) => {
    if (transactions.some(t => t.id === recordId)) {
      updateTransaction(recordId, updates);
    } else if (wishlist.some(w => w.id === recordId)) {
      updateWishlistItem(recordId, updates);
    }
  };

  const handleOpenAIAssistant = (initialPrompt = '') => {
  setAiInitialPrompt(initialPrompt);
  setShowAIModal(true);
};

// ----- Envelope budgeting: disposable after fixed bills -----
const envelopeDisposableIncome = useMemo(() => {
  const totalIncome = transactions
    .filter(t => t.type === 'income' && t.category !== 'savings_withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalBudgeted = userData?.expenses 
    ? Object.values(userData.expenses).reduce((sum, amt) => sum + (amt || 0), 0)
    : 0;
  return totalIncome - totalBudgeted;
}, [transactions, userData?.expenses]);

// ----- Total already saved toward wishlist this month -----
const wishlistSavingsAllocated = useMemo(() => {
  let allocated = 0;
  transactions.forEach(t => {
    if (t.type === 'expense' && t.category === 'savings') {
      allocated += t.amount;
    } else if (t.type === 'income' && t.category === 'savings_withdrawal') {
      allocated -= t.amount;
    }
  });
  return allocated;
}, [transactions]);

// ----- Available for new wishlist allocations -----
const availableForWishlist = envelopeDisposableIncome - wishlistSavingsAllocated;

// ----- Handler for wishlist savings (creates expense transaction) -----
const handleAddSavingsTransaction = (amount, description) => {
  if (amount > 0) {
    // Savings allocation -> expense
    addTransaction({
      amount,
      type: 'expense',
      category: 'savings',
      description: description || 'Wishlist savings',
      currency: userData?.currency || 'AED',
      date: new Date().toISOString()
    });
  } else if (amount < 0) {
    // Withdrawal -> income (refund)
    addTransaction({
      amount: -amount,
      type: 'income',
      category: 'savings_withdrawal',
      description: description || 'Wishlist withdrawal',
      currency: userData?.currency || 'AED',
      date: new Date().toISOString()
    });
  }
};
  // ----- Helper: format currency -----
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '0.00';
    const currency = userData?.currency || 'AED';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };

    // ----- Recalculate userData from transactions (after onboarding) -----
  const onboardingCompletedRef = useRef(hasCompletedOnboarding);
  const lastCalculationRef = useRef(Date.now());
  const pendingUpdateRef = useRef(null);
  const onboardingJustCompletedRef = useRef(false);

  // Helper: get current month's start and end dates
  const getCurrentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  };

const recalculateUserDataFromTransactions = useCallback(() => {
  if (!hasCompletedOnboarding) return;
  if (!transactions || transactions.length === 0) return;

  const { start, end } = getCurrentMonthRange();
  
  let totalIncome = 0;
  let totalExpenses = 0;

  transactions.forEach(tx => {
    const txDate = new Date(tx.date);
    if (txDate >= start && txDate <= end) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense') {
        totalExpenses += tx.amount;
      }
    }
  });

  if (totalIncome === 0 && totalExpenses === 0) {
    console.log('⏸️ Skipping recalculation – no transactions in current month yet.');
    return;
  }

  // ✅ Preserve existing savings goal or calculate default
  const existingSavingsGoal = userData?.savingsGoal || Math.round(totalIncome * 0.2);
  // ✅ Disposable income = income - expenses - savings goal
  const disposableIncome = totalIncome - totalExpenses;
  const existingExpenses = userData?.expenses || {};

  if (
    userData?.income !== totalIncome ||
    userData?.disposableIncome !== disposableIncome
  ) {
    console.log('🔄 Updating userData income/disposable (preserving budget plan):', { 
      totalIncome, 
      totalExpenses, 
      savingsGoal: existingSavingsGoal,
      disposableIncome 
    });
    updateUserData({
      ...userData,
      income: totalIncome,
      expenses: existingExpenses,
      disposableIncome,
      savingsGoal: existingSavingsGoal,
      lastUpdated: new Date().toISOString(),
    });
  }
}, [hasCompletedOnboarding, transactions, userData, updateUserData]);

 

// Track when onboarding completes to trigger initial calculation
 useEffect(() => {
  if (hasCompletedOnboarding && !onboardingCompletedRef.current) {
    onboardingCompletedRef.current = true;
    onboardingJustCompletedRef.current = true;
    
    // Reset flag after 5 seconds (allow manual recalculations later)
    setTimeout(() => { onboardingJustCompletedRef.current = false; }, 5000);
  }
}, [hasCompletedOnboarding, recalculateUserDataFromTransactions]);

  // ----- Socket.IO -----
  useEffect(() => {
    const newSocket = io('http://localhost:5000', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => console.log('✅ Connected to backend server with ID:', newSocket.id));
    newSocket.on('welcome', (data) => console.log('📨 Server welcome:', data.message));
    newSocket.on('connect_error', (error) => console.error('❌ Socket connection error:', error.message));
    newSocket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') setTimeout(() => newSocket.connect(), 1000);
    });

    return () => newSocket.disconnect();
  }, []);

  const testBackendConnection = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/test', { mode: 'cors' });
      console.log('✅ Backend API test:', await res.json());
      const socketRes = await fetch('http://localhost:5000/api/socket-health', { mode: 'cors' });
      console.log('✅ Socket.IO health:', await socketRes.json());
      return true;
    } catch (error) {
      console.error('❌ Backend connection test failed:', error);
      return false;
    }
  };

  // ----- Main JSX -----
  return (
    <div className="App">
      <header className="App-header">
        <ToastContainer position="top-right" />   {/* 👈 ADD THIS LINE EXACTLY HERE */}
        <h1>💸 Centsible</h1>
        <p className="subtitle">Your AI-Powered Financial Mentor</p>

        {socket && (
          <div className="connection-status">
            <span className={`status-dot ${socket.connected ? 'connected' : 'disconnected'}`}></span>
            {socket.connected ? 'Connected' : 'Connecting...'}
            <button
              onClick={testBackendConnection}
              style={{ marginLeft: '10px', fontSize: '12px', padding: '2px 8px' }}
            >
              🔍 Test
            </button>
          </div>
        )}

        {hasCompletedOnboarding && userData && (
          <div className="nav-bar">
            <button className="nav-button" onClick={() => navigate('/daily')}>
              🏠 Daily
            </button>
            <button className="nav-button" onClick={() => navigate('/dashboard')}>
              📊 Dashboard
            </button>
            <button className="nav-button" onClick={() => navigate('/rooms')}>
              👥 Shared Rooms
            </button>
            <button className="nav-button" onClick={() => navigate('/wishlist')}>
              🎁 Wish List
            </button>
            <button className="nav-button" onClick={() => navigate('/budget-ledger')}>
              📒 Budget Ledger
            </button>
            <button className="nav-button" onClick={() => setShowTransactionForm(true)}>
              ➕ Add Transaction
            </button>
            <button className="nav-button" onClick={() => navigate('/settings')}>
              ⚙️ Settings
            </button>
            <button className="nav-button" onClick={() => navigate('/profile')}>
              👤 Profile
            </button>
          </div>
        )}

        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <OnboardingRouter />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard 
                  userData={userData}
                  transactions={transactions}
                  onAddTransactionClick={() => setShowTransactionForm(true)}
                />
              </ProtectedRoute>
            }
          />
          <Route
            path="/daily"
            element={
              <ProtectedRoute>
                <div className="daily-dashboard-container">
                  <DailyDashboard
                    userData={userData}
                    transactions={transactions}
                    onAddTransaction={(tx) => handleAddTransaction(tx, 'manual')}
                    onEditTransaction={handleEditTransaction}
                    onDeleteTransaction={handleDeleteTransaction}
                    onAddWishlist={handleAddWishlistFromAI}
                    onEditRecord={handleEditRecordFromAI}
                    onAskAI={() => {}} // AI wizard is now in OnboardingRouter only
                    formatCurrency={formatCurrency}
                    onAddSavingsTransaction={handleAddSavingsTransaction}   // ✅ ADD THIS
                    onOpenAIAssistant={handleOpenAIAssistant}
                  />
                  {userData?.income > 0 && (
                    <div style={{ marginTop: '20px' }}>
                      <CalculationVisual income={userData.income} expenses={userData.expenses || {}} />
                    </div>
                  )}
                </div>
              </ProtectedRoute>
            }
          />
                   {/* Shared Rooms – List (My Rooms + Create/Join) */}
          <Route
            path="/rooms"
            element={
              <ProtectedRoute>
                <MyRooms />
              </ProtectedRoute>
            }
          />

          {/* Active Shared Room (with room code) */}
          <Route
            path="/room/:roomCode"
            element={
              <ProtectedRoute>
                <SharedRoomContainer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/wishlist"
            element={
              <ProtectedRoute>
                <div className="component-container">
                  <button className="back-button" onClick={() => navigate('/daily')}>
                    ← Back to Daily Dashboard
                  </button>
                  <WishList
  userCurrency={userData?.currency || 'AED'}
  availableBalance={availableForWishlist}
  onOpenAIAssistant={handleOpenAIAssistant}
  onAddSavingsTransaction={handleAddSavingsTransaction}
/>
                </div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/budget-ledger"
            element={
              <ProtectedRoute>
                <div className="component-container">
                  <button className="back-button" onClick={() => navigate('/daily')}>
                    ← Back to Daily Dashboard
                  </button>
                 <BudgetLedger
  transactions={transactions}
  userData={userData}
  onEditTransaction={handleEditTransaction}
  onDeleteTransaction={handleDeleteTransaction}
  onClearAllTransactions={clearAllTransactions}
/>
                </div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                {hasCompletedOnboarding ? <Navigate to="/dashboard" /> : <Navigate to="/onboarding" />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports transactions={transactions} userData={userData} />
              </ProtectedRoute>
            }
          />
        </Routes>

        {showTransactionForm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <TransactionForm
                onAddTransaction={(tx) => handleAddTransaction(tx, 'manual')}
                onClose={() => setShowTransactionForm(false)}
                previousTransactions={transactions.slice(0, 10)}
              />
            </div>
          </div>
        )}

        {showAIModal && (
        <div className="modal-overlay">
          <div className="modal-content ai-modal-content">
            <AIConversationWizard
              mode="daily"
              onComplete={() => setShowAIModal(false)}
              onAddTransaction={(tx) => {
                handleAddTransaction(tx, 'ai_wizard');
                setShowAIModal(false);
              }}
              onAddWishlist={handleAddWishlistFromAI}
              onEditRecord={handleEditRecordFromAI}
              onDeleteTransaction={handleDeleteTransaction}
              recentTransactions={transactions.slice(0, 10)}
              userData={userData}
            />
            <button 
  className="close-modal-btn"
  onClick={() => setShowAIModal(false)}
  style={{ 
    position: 'absolute', 
    top: '10px', 
    right: '10px', 
    zIndex: 1000,
    background: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    fontSize: '18px',
    cursor: 'pointer',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
  }}
>
  ✕
</button>
          </div>
        </div>
      )}


      </header>
    </div>
  );
}

export default App;