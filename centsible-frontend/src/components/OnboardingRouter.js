import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AIConversationWizard from './AIConversationWizard';
import OnboardingWizard from './OnboardingWizard';
import CalculationVisual from './CalculationVisual';
import api from '../utils/api';
import './OnboardingRouter.css';


const normalizeWizardData = (data) => {
  if (data.income && typeof data.income === 'object' && data.income.sources) {
    const totalIncome = data.income.total || 0;
    const expensesObj = {};
    data.expenses.forEach(exp => {
      if (exp.amount > 0) {
        const key = exp.category === 'rent' ? 'rent' :
                    exp.category === 'groceries' ? 'groceries' :
                    exp.category === 'transportation' ? 'transportation' :
                    exp.category === 'utilities' ? 'utilities' : exp.category;
        expensesObj[key] = (expensesObj[key] || 0) + exp.amount;
      }
    });
    return {
      income: totalIncome,
      expenses: expensesObj,
      wishlist: data.wishlist || [],
      savingsGoal: data.savingsGoal || 0,
      currency: data.currency || 'AED',
      raw: data,
    };
  }
  return {
    income: data.income || 0,
    expenses: data.expenses || {},
    wishlist: data.wishlist || [],
    savingsGoal: data.savingsGoal || 0,
    currency: data.currency || 'AED',
    raw: data.raw || data,
  };
};

const OnboardingRouter = () => {
  const [mode, setMode] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [collectedData, setCollectedData] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
 const { addTransaction, refreshTransactions, userData, updateUserData, hasCompletedOnboarding, addWishlistItem } = useAuth();
  const navigate = useNavigate();

 // Redirect if onboarding already completed
useEffect(() => {
  if (hasCompletedOnboarding) {
    navigate('/dashboard');
  }
}, [hasCompletedOnboarding, navigate]);

  const handleWizardComplete = (data) => {
    const normalized = normalizeWizardData(data);
    setCollectedData(normalized);
    setShowSummary(true);
  };

 const saveAndContinue = async () => {
  if (!collectedData) return;
  setIsSaving(true);
  try {
    const raw = collectedData.raw || collectedData;
    const currency = collectedData.currency;

    console.log('📦 OnboardingRouter – Saving budget plan:', collectedData);

    //❌ NO income TRANSACTIONS CREATED when onboarding.

    // ❌ NO EXPENSE TRANSACTIONS CREATED
    // Expenses are budget allocations only, stored in userData.expenses

    // ----- WISHLIST -----
    if (raw.wishlist && raw.wishlist.length > 0) {
      for (const item of raw.wishlist) {
        await addWishlistItem({
          name: item.item || item.name,
          estimatedPrice: item.estimatedPrice,
          priority: item.priority || 'medium',
          category: item.category || 'other',
          notes: item.notes || '',
          currency: item.currency || currency,
          source: 'ai'
        });
      }
    }

// ----- INCOME TRANSACTION (baseline) -----
const mapIncomeCategory = (sourceDesc) => {
  const s = sourceDesc.toLowerCase();
  if (s.includes('freelance')) return 'freelance';
  if (s.includes('gift')) return 'gift';
  if (s.includes('investment')) return 'investment';
  if (s.includes('allowance')) return 'gift';
  return 'salary';
};

if (raw.income && raw.income.sources) {
  for (const source of raw.income.sources) {
    await addTransaction({
      amount: source.amount,
      type: 'income',
      category: mapIncomeCategory(source.source),
      description: source.source + ' (Planned)',
      currency: source.currency || currency,
      recurring: true,
      frequency: source.frequency,
      date: source.received ? new Date().toISOString() : (source.nextPayDate || new Date().toISOString()),
      source: 'onboarding'
    });
  }
} else if (raw.income > 0) {
  await addTransaction({
    amount: raw.income,
    type: 'income',
    category: 'salary',
    description: 'Monthly Income (Planned)',
    currency,
    recurring: true,
    frequency: 'monthly',
    date: new Date().toISOString(),
    source: 'onboarding'
  });
}

    // ----- UPDATE USER PROFILE (budget plan) -----
    const disposable = collectedData.income - Object.values(collectedData.expenses).reduce((a, b) => a + b, 0);
    const savingsGoal = raw.savingsGoal || Math.round(disposable * 0.3);

    console.log('💾 OnboardingRouter – About to call updateUserData with:', {
      income: collectedData.income,
      expenses: collectedData.expenses,
      disposable,
      savingsGoal,
      currency,
    });

    await updateUserData({
      ...userData,
      income: collectedData.income,
      expenses: collectedData.expenses,
      disposableIncome: disposable,
      savingsGoal,
      currency,
      lastUpdated: new Date().toISOString(),
    });

    await refreshTransactions();
    await new Promise(resolve => setTimeout(resolve, 1500));
    navigate('/dashboard');
  } catch (error) {
    console.error('Save failed:', error);
    alert('Something went wrong. Please try again.');
  } finally {
    setIsSaving(false);
  }
};

  const handleEdit = () => {
    if (isSaving) return; // prevent edit during save
    setShowSummary(false);
    setMode(null);
    setCollectedData(null);
  };

  // Quickstart effect
  useEffect(() => {
  if (mode === 'quick' && !isSaving && !collectedData && !showSummary && !hasCompletedOnboarding) {
      const quickData = {
        income: 5000,
        expenses: { rent: 2000, groceries: 800, utilities: 500, transportation: 300 },
      };
      const normalized = normalizeWizardData(quickData);
      setCollectedData(normalized);
      setShowSummary(true);
    }
  }, [mode, isSaving, collectedData, showSummary, hasCompletedOnboarding]);

  if (showSummary && collectedData) {
    return (
      <div className="onboarding-summary">
        <h2>🎉 Review Your Budget Setup</h2>
        <CalculationVisual
          income={collectedData.income}
          expenses={collectedData.expenses}
          currency={collectedData.currency}
        />
        <div className="summary-details">
  <h3>Budget Plan to be saved:</h3>
  <ul>
    <li><strong>Income:</strong> {collectedData.income} {collectedData.currency}</li>
    {Object.entries(collectedData.expenses).map(([cat, amt]) => (
      <li key={cat}>{cat}: {amt} {collectedData.currency} (budgeted)</li>
    ))}
    {collectedData.wishlist.length > 0 && (
      <li><strong>Wishlist items:</strong> {collectedData.wishlist.length}</li>
    )}
  </ul>
</div>
        <div className="summary-actions">
          <button onClick={handleEdit} className="edit-btn" disabled={isSaving}>
            ✏️ Edit All
          </button>
          <button onClick={saveAndContinue} className="continue-btn" disabled={isSaving}>
            {isSaving ? 'Saving...' : '✅ Continue to Dashboard'}
          </button>
        </div>
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="onboarding-choice">
        <h1>Welcome to Centsible! 👋</h1>
        <p>Choose how you'd like to set up your budget:</p>
        <div className="choice-cards">
          <div className="choice-card" onClick={() => setMode('ai')}>
            <span className="icon">🤖</span>
            <h3>AI Guided Setup</h3>
            <p>Chat with our AI assistant to set up your budget naturally</p>
            <span className="badge">Recommended</span>
          </div>
          <div className="choice-card" onClick={() => setMode('manual')}>
            <span className="icon">📝</span>
            <h3>Manual Setup</h3>
            <p>Enter your income and expenses step by step</p>
          </div>
          <div className="choice-card" onClick={() => setMode('quick')}>
            <span className="icon">⚡</span>
            <h3>Quick Start</h3>
            <p>Use default budget (you can edit later)</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'ai') {
    return <AIConversationWizard mode="onboarding" onComplete={handleWizardComplete} />;
  }
  if (mode === 'manual') {
    return <OnboardingWizard onComplete={handleWizardComplete} />;
  }
  if (mode === 'quick') {
    return <div className="loading-spinner">Preparing your budget...</div>;
  }
// Redirect if onboarding already completed (must be placed here, after all hooks)
  
  
};

export default OnboardingRouter;