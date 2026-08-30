import React, { useState, useMemo } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import EditableCard from './EditableCard';
import LoadingSpinner from './LoadingSpinner';
import RoomBalances from './RoomBalances';
import './Dashboard.css'; // Reuse existing dashboard styles

const SharedDashboard = ({ onNavigate }) => {
  const { user } = useAuth();
  const {
    roomData,
    transactions,
    balances,
    loading,
    addTransaction,
    isAdmin,
  } = useRoom();

  const [newExpense, setNewExpense] = useState({
    description: '',
    amount: '',
    paidBy: '',
    splitAmong: [], // array of userIds
    category: 'other',
    date: new Date().toISOString().split('T')[0],
  });

  const [showAddForm, setShowAddForm] = useState(false);


  const [newIncome, setNewIncome] = useState({
    description: '',
    amount: '',
     paidBy: '',  
    category: 'salary',
    date: new Date().toISOString().split('T')[0],
  });
  const [showIncomeForm, setShowIncomeForm] = useState(false);


  // --------------------------------------------------------------------
  // Calculate room totals from transactions
  // --------------------------------------------------------------------
  const roomTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpenses = 0;
    const expensesByCategory = {};

    (transactions || []).forEach(tx => {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'expense' && !tx.settlementBetween) {
        totalExpenses += tx.amount;
        const cat = tx.category || 'other';
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + tx.amount;
      }
    });

    return {
      totalIncome,
      totalExpenses,
      expensesByCategory,
      disposable: totalIncome - totalExpenses,
    };
  }, [transactions]);

  // --------------------------------------------------------------------
  // Budget totals (if budgets are set)
  // --------------------------------------------------------------------
  const budgetSummary = useMemo(() => {
    if (!roomData?.budgets) return null;
    const budgets = roomData.budgets;
    const totalBudgeted = Object.values(budgets).reduce((sum, val) => sum + val, 0);
    const totalSpent = roomTotals.totalExpenses;
    const remaining = totalBudgeted - totalSpent;
    return { totalBudgeted, totalSpent, remaining };
  }, [roomData, roomTotals]);

  // --------------------------------------------------------------------
  // Current user's balance
  // --------------------------------------------------------------------
  const myBalance = useMemo(() => {
    const myBal = balances?.find(b => b.userId === user?.id);
    return myBal?.balance || 0;
  }, [balances, user]);

  // --------------------------------------------------------------------
  // Format currency
  // --------------------------------------------------------------------
  const formatCurrency = (amount) => {
    const currency = roomData?.currency || 'AED';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };

  // --------------------------------------------------------------------
  // Handle adding a shared expense
  // --------------------------------------------------------------------
  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) {
      window.toast?.warning('Please fill in description, amount, and who paid');
      return;
    }

    const amount = parseFloat(newExpense.amount);
    const splitAmong = newExpense.splitAmong.length > 0
      ? newExpense.splitAmong
      : roomData.members.map(m => m.userId);

    const splits = splitAmong.map(userId => ({
      user: userId,
      amount: amount / splitAmong.length,
    }));

    const result = await addTransaction({
      description: newExpense.description,
      amount,
      type: 'expense',
      category: newExpense.category,
      paidBy: newExpense.paidBy,
      splits,
      date: newExpense.date,
    });

    if (result.success) {
      window.toast?.success('Expense added successfully');
      setNewExpense({
        description: '',
        amount: '',
        paidBy: '',
        splitAmong: [],
        category: 'other',
        date: new Date().toISOString().split('T')[0],
      });
      setShowAddForm(false);
    } else {
      window.toast?.error(result.error || 'Failed to add expense');
    }
  };
  
  // --------------------------------------------------------------------
  // Handle adding shared income
  // --------------------------------------------------------------------
  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!newIncome.description || !newIncome.amount) {
      window.toast?.warning('Description and amount required');
      return;
    }

    const result = await addTransaction({
      description: newIncome.description,
      amount: parseFloat(newIncome.amount),
      type: 'income',
      paidBy: newIncome.paidBy,
      category: newIncome.category,
      date: newIncome.date,
    });

    if (result.success) {
      window.toast?.success('Income added successfully');
      setNewIncome({
        description: '',
        amount: '',
        paidBy: '',  
        category: 'salary',
        date: new Date().toISOString().split('T')[0],
      });
      setShowIncomeForm(false);
    } else {
      window.toast?.error(result.error || 'Failed to add income');
    }
  };

  // --------------------------------------------------------------------
  // Toggle member selection for split
  // --------------------------------------------------------------------
  const toggleSplitMember = (userId) => {
    setNewExpense(prev => {
      const isSelected = prev.splitAmong.includes(userId);
      return {
        ...prev,
        splitAmong: isSelected
          ? prev.splitAmong.filter(id => id !== userId)
          : [...prev.splitAmong, userId],
      };
    });
  };

  // --------------------------------------------------------------------
  // Loading state
  // --------------------------------------------------------------------
  if (loading || !roomData) {
    return (
      <div className="dashboard-loading">
        <LoadingSpinner />
        <h3>Loading shared room...</h3>
      </div>
    );
  }

  // --------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------
  return (
    <div className="dashboard shared-dashboard">
      {/* Header with room info */}
      <div className="dashboard-header">
        <h2>📊 {roomData.roomName}</h2>
        <p className="room-type-badge">
          {roomData.roomType === 'roommates' && '🏠 Roommates'}
          {roomData.roomType === 'trip' && '✈️ Trip'}
          {roomData.roomType === 'wedding' && '💍 Wedding'}
          {roomData.roomType === 'event' && '🎉 Event'}
          {roomData.roomType === 'family' && '👨‍👩‍👧‍👦 Family'}
          {roomData.roomType === 'other' && '🎯 Other'}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="editable-cards-grid">
        <EditableCard
          title="Total Shared Income"
          amount={roomTotals.totalIncome}
          type="income"
          cardType="income"
          dueDate="-"
          onUpdate={() => {}}
          currency={roomData.currency}
        />
        <EditableCard
          title="Total Shared Expenses"
          amount={roomTotals.totalExpenses}
          type="expense"
          cardType="expense-total"
          dueDate="-"
          onUpdate={() => {}}
          currency={roomData.currency}
        />
        <EditableCard
          title="Room Disposable"
          amount={roomTotals.disposable}
          type="income"
          cardType="disposable"
          dueDate="-"
          onUpdate={() => {}}
          currency={roomData.currency}
        />
        {budgetSummary && (
          <EditableCard
            title="Budget Remaining"
            amount={budgetSummary.remaining}
            type="expense"
            cardType="budget"
            dueDate="-"
            onUpdate={() => {}}
            currency={roomData.currency}
          />
        )}
      </div>

      {/* My Balance Card */}
      <div className="my-balance-card">
        <h3>💰 Your Balance</h3>
        <div className={`balance-amount ${myBalance > 0 ? 'positive' : myBalance < 0 ? 'negative' : ''}`}>
          {myBalance > 0
            ? `You are owed ${formatCurrency(myBalance)}`
            : myBalance < 0
            ? `You owe ${formatCurrency(-myBalance)}`
            : 'You are all settled up!'}
        </div>
      </div>

            {/* Balances & Settlements */}
      <RoomBalances />

            {/* Action Buttons */}
      <div className="action-buttons-group">
        <button
          className="action-button add-expense"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <span>💸</span> Add Expense
        </button>
        
        <button
          className="action-button add-income"
          onClick={() => setShowIncomeForm(!showIncomeForm)}
        >
          <span>💰</span> Add Income
        </button>
        
        <button
          className="action-button view-reports"
          onClick={() => onNavigate && onNavigate('ledger')}
        >
          <span>📈</span> Reports
        </button>
      </div>

      {/* Expense Form */}
      {showAddForm && (
        <form className="expense-form-panel" onSubmit={handleAddExpense}>
          <h4>New Shared Expense</h4>
          <div className="form-row">
            <input
              type="text"
              placeholder="Description (e.g., Groceries, Rent)"
              value={newExpense.description}
              onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
              required
            />
          </div>
          <div className="form-row two-col">
            <input
              type="number"
              placeholder="Amount"
              value={newExpense.amount}
              onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
              min="0.01"
              step="0.01"
              required
            />
            <select
              value={newExpense.category}
              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
            >
              <option value="groceries">Groceries</option>
              <option value="rent">Rent</option>
              <option value="utilities">Utilities</option>
              <option value="transportation">Transportation</option>
              <option value="dining">Dining</option>
              <option value="entertainment">Entertainment</option>
              <option value="shopping">Shopping</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-row">
            <label>Paid by:</label>
            <select
              value={newExpense.paidBy}
              onChange={(e) => setNewExpense({ ...newExpense, paidBy: e.target.value })}
              required
            >
              <option value="">Select who paid</option>
              {roomData.members.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.name} {m.userId === user?.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Split between:</label>
            <div className="split-checkboxes">
              {roomData.members.map(m => (
                <label key={m.userId} className="split-checkbox">
                  <input
                    type="checkbox"
                    checked={newExpense.splitAmong.includes(m.userId)}
                    onChange={() => toggleSplitMember(m.userId)}
                  />
                  {m.name} {m.userId === user?.id ? '(You)' : ''}
                </label>
              ))}
            </div>
            <p className="helper-text">
              {newExpense.splitAmong.length === 0
                ? 'If none selected, expense will be split equally among all members.'
                : `Split equally among ${newExpense.splitAmong.length} member(s).`}
            </p>
          </div>
          <div className="form-row">
            <label>Date:</label>
            <input
              type="date"
              value={newExpense.date}
              onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="save-btn">Add Expense</button>
            <button type="button" className="cancel-btn" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

            {/* Income Form */}
      {showIncomeForm && (
        <form className="expense-form-panel" onSubmit={handleAddIncome}>
          <h4>Add Shared Income</h4>
          <div className="form-row">
            <input
              type="text"
              placeholder="Description (e.g., Salary, Refund)"
              value={newIncome.description}
              onChange={(e) => setNewIncome({ ...newIncome, description: e.target.value })}
              required
            />
          </div>
          <div className="form-row two-col">
            <input
              type="number"
              placeholder="Amount"
              value={newIncome.amount}
              onChange={(e) => setNewIncome({ ...newIncome, amount: e.target.value })}
              min="0.01"
              step="0.01"
              required
            />
            <select
              value={newIncome.category}
              onChange={(e) => setNewIncome({ ...newIncome, category: e.target.value })}
            >
              <option value="salary">Salary</option>
              <option value="freelance">Freelance</option>
              <option value="gift">Gift</option>
              <option value="investment">Investment</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-row">
            <label>Contributed by:</label>   {/* 👈 CHANGED LABEL */}
            <select
              value={newIncome.paidBy}
              onChange={(e) => setNewIncome({ ...newIncome, paidBy: e.target.value })}
              required
            >
              <option value="">Select who contributed</option>
              {roomData.members.map(m => (
                <option key={m.userId} value={m.userId}>
                  {m.name} {m.userId === user?.id ? '(You)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Date:</label>
            <input
              type="date"
              value={newIncome.date}
              onChange={(e) => setNewIncome({ ...newIncome, date: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="save-btn">Add Income</button>
            <button type="button" className="cancel-btn" onClick={() => setShowIncomeForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Recent Transactions */}
      <div className="recent-transactions">
        <h3>📋 Recent Shared Transactions</h3>
        {transactions.length === 0 ? (
          <p className="empty-state">No shared transactions yet.</p>
        ) : (
          <div className="transaction-list">
            {transactions.slice(0, 10).map(tx => {
             const paidById = tx.paidBy?._id || tx.paidBy;   // 👈 Handle both populated object and raw ID
const payer = roomData.members.find(m => String(m.userId) === String(paidById));
              const isSettlement = !!tx.settlementBetween;
              return (
                <div key={tx._id} className={`transaction-item ${tx.type}`}>
                  <div className="tx-info">
                    <span className="tx-description">
                      {isSettlement ? '💱 Settlement' : tx.description}
                    </span>
                    <span className="tx-category">{tx.category}</span>
                  </div>
                  <div className="tx-details">
                    <span>Paid by: {payer?.name || 'Unknown'}</span>
                    <span className={`tx-amount ${tx.type}`}>
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                  <div className="tx-splits">
                    {tx.splits?.map(split => {
                      const member = roomData.members.find(m => m.userId === split.user);
                      return (
                        <span key={split.user} className="split-chip">
                          {member?.name}: {formatCurrency(split.amount)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Budget Overview (if budgets set) */}
      {roomData.budgets && Object.keys(roomData.budgets).length > 0 && (
        <div className="budget-overview">
          <h3>📊 Shared Budgets</h3>
          <div className="budget-categories">
            {Object.entries(roomData.budgets).map(([cat, amount]) => {
              const spent = roomTotals.expensesByCategory[cat] || 0;
              const remaining = amount - spent;
              const percent = amount > 0 ? (spent / amount) * 100 : 0;
              return (
                <div key={cat} className="budget-item">
                  <div className="budget-header">
                    <span className="category-name">{cat}</span>
                    <span className="budget-amounts">
                      {formatCurrency(spent)} / {formatCurrency(amount)}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <span className="remaining">
                    {remaining >= 0 ? `${formatCurrency(remaining)} left` : `${formatCurrency(-remaining)} over`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedDashboard;
