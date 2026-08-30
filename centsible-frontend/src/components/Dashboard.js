import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EditableCard from './EditableCard';
import LoadingSpinner from './LoadingSpinner';
import './Dashboard.css';

function Dashboard({ onAddTransactionClick }) {
  const navigate = useNavigate();
  const { 
    user,                  // auth user (id, email, name)
    userData,              // financial data (income, expenses, savingsGoal, currency)
    transactions, 
    loading: authLoading, 
    reminders, 
    setReminder, 
    updateUserData,        // use this to update savingsGoal & currency
    updateUser,             // keep for profile updates (name, email, etc.)
    hasCompletedOnboarding
  } = useAuth();

  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');

  const showNotificationMessage = (message) => {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  // Calculate totals from transactions
  const dashboardTotals = useMemo(() => {
  let totalIncome = 0;
  let totalExpenses = 0;
  const expensesByCategory = {};

  (transactions || []).forEach(tx => {
    if (tx.type === 'income' && tx.category !== 'savings_withdrawal') {  // ✅ EXCLUDE withdrawals
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpenses += tx.amount;
      const cat = tx.category || 'other';
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + tx.amount;
    }
  });

  // ✅ If no income transactions yet, fall back to planned income from userData
  if (totalIncome === 0 && userData?.income > 0) {
    totalIncome = userData.income;
  }

  return {
    totalIncome,
    totalExpenses,
    expensesByCategory,
    disposableIncome: totalIncome - totalExpenses
  };
}, [transactions, userData?.income]); // ✅ Add userData?.income as dependency

  // ---------- ENVELOPE BUDGET CALCULATIONS ----------
  const budgetedCategories = ['rent', 'groceries', 'utilities', 'transportation'];

  // Total allocated to budgeted categories (from userData)
  const totalBudgetedAllocated = budgetedCategories.reduce((sum, cat) => {
    return sum + (userData?.expenses?.[cat] || 0);
  }, 0);

  // Available disposable income after setting aside budgeted allocations
  const availableDisposable = dashboardTotals.totalIncome - totalBudgetedAllocated;

  // Unbudgeted spending (categories not in budgetedCategories)
  const unbudgetedSpending = Object.entries(dashboardTotals.expensesByCategory)
    .filter(([cat]) => !budgetedCategories.includes(cat))
    .reduce((sum, [, amt]) => sum + amt, 0);

  // Remaining disposable income after unbudgeted spending
  const remainingDisposable = availableDisposable - unbudgetedSpending;

  // Remaining budget per category
  const remainingBudgets = {};
  budgetedCategories.forEach(cat => {
    const budgeted = userData?.expenses?.[cat] || 0;
    const spent = dashboardTotals.expensesByCategory[cat] || 0;
    remainingBudgets[cat] = budgeted - spent;
  });

  // Reminder notification checker (every hour) - FIX: compare date strings safely
  useEffect(() => {
    const checkReminders = () => {
      if (!reminders || reminders.length === 0) return;
      const today = new Date().toDateString(); // e.g., "Mon Apr 13 2026"
      reminders.forEach(reminder => {
        // Normalize reminder.date (could be ISO string or already formatted)
        let reminderDateStr = reminder.date;
        try {
          if (reminderDateStr && reminderDateStr.includes('T')) {
            reminderDateStr = new Date(reminderDateStr).toDateString();
          }
        } catch(e) { /* ignore */ }
        if (reminderDateStr === today) {
          showNotificationMessage(`🔔 Reminder: ${reminder.type} is due today!`);
        }
      });
    };
    checkReminders();
    const interval = setInterval(checkReminders, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [reminders]);
  const handleCardUpdate = async (cardData) => {
    // Handle old-style calls where a number is passed (backward compatibility)
    if (typeof cardData === 'number') {
      cardData = { amount: cardData, cardType: 'savings' };
    }

    if (cardData.cardType === 'income') {
      showNotificationMessage('💡 To change your total income, please use the "Add Income" button below.');
      return false;
    } else if (cardData.cardType === 'savings') {
      const amount = cardData.amount || cardData;
      const updatedUserData = { ...userData, savingsGoal: parseFloat(amount) || 0 };
      await updateUserData(updatedUserData);
      showNotificationMessage(`✅ Savings goal updated to: ${formatCurrency(amount)}`);
      return true;
    } else if (cardData.cardType === 'expense') {
      // NEW: Allow editing budgeted amount for expense categories
      const category = cardData.category;
      const newBudgeted = cardData.budgeted;
      if (category && !isNaN(newBudgeted)) {
        const updatedExpenses = { ...userData.expenses, [category]: newBudgeted };
        const updatedUserData = { ...userData, expenses: updatedExpenses };
        await updateUserData(updatedUserData);
        showNotificationMessage(`✅ ${category} budget updated to ${formatCurrency(newBudgeted)}`);
        return true;
      }
      return false;
    }
    return false;
  };

  const handleSetReminder = async (type, date) => {
    if (!date || date.trim() === '') {
      showNotificationMessage('⚠️ Please enter a valid date');
      return;
    }
    const result = await setReminder(type, date);
    if (result.success) {
      showNotificationMessage(`✅ Reminder set for ${type} on ${date}`);
    } else {
      showNotificationMessage(`❌ Failed to set reminder: ${result.error}`);
    }
  };

  const getDueDateForCategory = (category) => {
    const dueDates = {
      rent: '1st of month',
      utilities: '15th of month',
      transportation: 'Monthly',
      groceries: 'Weekly',
      entertainment: 'Flexible',
      other: 'As needed'
    };
    return dueDates[category] || 'Monthly';
  };

  // FIX: use currency from userData, fallback to 'AED'
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '0.00';
    const currency = userData?.currency || 'AED';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      return `${amount} ${currency}`;
    }
  };

  if (authLoading) {
    return (
      <div className="dashboard-loading">
        <LoadingSpinner />
        <h3>Loading your dashboard...</h3>
        <p>Please wait while we prepare your financial data</p>
      </div>
    );
  }

  if (!hasCompletedOnboarding || !userData || !userData.income) {
  return (
    <div className="dashboard-empty">
      <h3>📊 Complete Your Financial Setup</h3>
      <p>You haven't set up your budget plan yet.</p>
      <button className="setup-button" onClick={() => navigate('/onboarding')}>
        Start Onboarding
      </button>
    </div>
  );
}

  // FIX: use userData.savingsGoal (not user.savingsGoal)
  const savingsGoal = userData?.savingsGoal || Math.round(dashboardTotals.totalIncome * 0.3);

  return (
    <div className="dashboard">
      {showNotification && (
        <div className="notification">
          {notificationMessage}
        </div>
      )}

      <div className="dashboard-header">
        <h2>📊 Your Financial Dashboard</h2>
        <p className="last-updated">
          Last updated: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="editable-cards-grid">
        <EditableCard 
          title="Monthly Income" 
          amount={dashboardTotals.totalIncome}
          type="income"
          cardType="income"
          dueDate="5th of month"
          onUpdate={handleCardUpdate}
          onSetReminder={(date) => handleSetReminder('income', date)}
          currency={userData?.currency || 'AED'}
        />
        
        <EditableCard 
          title="Total Expenses" 
          amount={dashboardTotals.totalExpenses}
          type="expense"
          cardType="expense-total"
          dueDate="Various"
          onUpdate={() => {
            showNotificationMessage('💡 Edit individual expenses in the section below');
            return false;
          }}
          onSetReminder={() => {
            const date = prompt('Set a general reminder date (e.g., "End of month"):', 'End of month');
            if (date) handleSetReminder('expenses', date);
          }}
          currency={userData?.currency || 'AED'}
        />
        
                <EditableCard 
          title="Disposable Income" 
           amount={remainingDisposable}
          type="income"
          cardType="disposable"
          dueDate="Available now"
          onUpdate={() => {
            showNotificationMessage('ℹ️ Disposable income is calculated automatically:\n\n(Income - Expenses) = Disposable Income');
            return false;
          }}
          onSetReminder={() => {}}
          currency={userData?.currency || 'AED'}
        />
        
        <EditableCard 
          title="Savings Goal" 
          amount={savingsGoal}
          type="income"
          cardType="savings"
          dueDate="End of month"
          onUpdate={handleCardUpdate}
          onSetReminder={(date) => handleSetReminder('savings', date)}
          currency={userData?.currency || 'AED'}
        />
      </div>

            <div className="expense-breakdown">
        <div className="expense-header">
          <h3>📋 Monthly Budget Status</h3>
        </div>
        {budgetedCategories.length > 0 ? (
          <div className="expense-cards-grid">
            {budgetedCategories.map(category => {
              const spent = dashboardTotals.expensesByCategory[category] || 0;
              const budgeted = userData?.expenses?.[category] || 0;
              const remaining = remainingBudgets[category];
              return (
                <EditableCard
                  key={category}
                  title={category.charAt(0).toUpperCase() + category.slice(1)}
                  amount={remaining}
                  spent={spent}
                  budgeted={budgeted}
                  type="expense"
                  cardType="expense"
                  category={category.toLowerCase()}
                  dueDate={getDueDateForCategory(category)}
                  onUpdate={handleCardUpdate}
                  onSetReminder={(date) => handleSetReminder(category, date)}
                  currency={userData?.currency || 'AED'}
                />
              );
            })}
          </div>
        ) : (
          <p className="no-expenses-message">No budgeted categories set. Complete onboarding first.</p>
        )}
        
        {unbudgetedSpending > 0 && (
          <div className="unbudgeted-summary" style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
            <p>💡 Other spending: <strong>{formatCurrency(unbudgetedSpending)}</strong> (deducted from Disposable Income)</p>
          </div>
        )}
      </div>

      <div className="dashboard-actions">
        <button 
          className="action-button add-income"
          onClick={() => onAddTransactionClick && onAddTransactionClick('income')}
        >
          <span>💰</span> Add Income
        </button>
        <button 
          className="action-button add-expense"
          onClick={() => onAddTransactionClick && onAddTransactionClick('expense')}
        >
          <span>💸</span> Add Expense
        </button>
     <button 
  className="action-button ask-ai"
  onClick={() => navigate('/daily')}
>
  <span>🤖</span> Ask AI
</button>

        <button 
          className="action-button view-reports"
          onClick={() => navigate('/reports')}
        >
          <span>📈</span> Reports
        </button>
      </div>
    </div>
  );
}

export default Dashboard;