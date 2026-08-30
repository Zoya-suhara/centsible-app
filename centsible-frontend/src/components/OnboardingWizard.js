import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import './OnboardingWizard.css';

function OnboardingWizard({ onComplete, initialData }) {
  const navigate = useNavigate();
  const { user, updateUserData } = useAuth();
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const [income, setIncome] = useState(initialData?.income || '');
  const [expenses, setExpenses] = useState(initialData?.expenses || {
    rent: '',
    groceries: '',
    transportation: '',
    utilities: ''
  });

  const questions = [
    {
      id: 1,
      question: "What is your monthly income (in AED)?",
      type: "income",
      tip: "Enter your total monthly take-home pay"
    },
    {
      id: 2,
      question: "How much do you pay for rent/mortgage?",
      type: "rent",
      tip: "Recommended: ≤30% of your income"
    },
    {
      id: 3,
      question: "Monthly grocery budget?",
      type: "groceries",
      tip: "Average for one person: 800-1500 AED"
    },
    {
      id: 4,
      question: "Transportation costs (fuel, taxi, public transit)?",
      type: "transportation",
      tip: "Includes fuel, parking, Uber/Careem, metro cards"
    },
    {
      id: 5,
      question: "Utilities (electricity, water, internet, mobile)?",
      type: "utilities",
      tip: "DEWA + Du/Etisalat + mobile plans"
    }
  ];

  // Transform manual data to match AI wizard output format
  const transformToAIDataFormat = (manualData) => {
    const { income, expenses } = manualData;
    const currency = user?.currency || 'AED';

    const expenseItems = [];
    if (expenses.rent > 0) {
      expenseItems.push({
        category: 'rent',
        amount: expenses.rent,
        description: 'Monthly rent/mortgage',
        currency,
        dueDate: '1st of month'
      });
    }
    if (expenses.groceries > 0) {
      expenseItems.push({
        category: 'groceries',
        amount: expenses.groceries,
        description: 'Monthly food/groceries',
        currency
      });
    }
    if (expenses.transportation > 0) {
      expenseItems.push({
        category: 'transportation',
        amount: expenses.transportation,
        description: 'Monthly transportation',
        currency
      });
    }
    if (expenses.utilities > 0) {
      expenseItems.push({
        category: 'utilities',
        amount: expenses.utilities,
        description: 'Monthly utilities (electricity, water, internet, mobile)',
        currency
      });
    }

    return {
      userType: 'manual',
      income: {
        sources: [{
          amount: income,
          source: 'Monthly Income',
          frequency: 'monthly',
          currency,
          notes: 'Manual onboarding'
        }],
        total: income
      },
      expenses: expenseItems,
      savingsGoal: manualData.savingsGoal || 0,
      currency,
      wishlist: [],
      setupComplete: true,
      lastUpdated: new Date().toISOString()
    };
  };

 const handleNext = async () => {
  if (step < questions.length) {
    setStep(step + 1);
    return;
  }

  setIsSaving(true);
  setError(null);

  try {
    const numericIncome = Number(income) || 0;
    const numericExpenses = {
      rent: Number(expenses.rent) || 0,
      groceries: Number(expenses.groceries) || 0,
      transportation: Number(expenses.transportation) || 0,
      utilities: Number(expenses.utilities) || 0
    };

   

    const currency = user?.currency || 'AED';

    // ❌ NO INCOME TRANSACTION CREATED
    // ❌ NO EXPENSE TRANSACTIONS CREATED
    

        // 2. NO expense transactions created — expenses are budget allocations only.

    // 3. Update user data (disposable income, savings goal)
    const totalExpenses = Object.values(numericExpenses).reduce((a, b) => a + b, 0);
    const disposable = numericIncome - totalExpenses;
    const savingsGoal = Math.round(disposable * 0.3);

    await updateUserData({
      income: numericIncome,
      expenses: numericExpenses,
      disposableIncome: disposable,
      savingsGoal,
      currency,
      lastUpdated: new Date().toISOString()
    });

    // 4. Call onComplete if provided (transformed data for consistency)
    if (onComplete) {
      const finalData = transformToAIDataFormat({ income: numericIncome, expenses: numericExpenses, savingsGoal });
      onComplete(finalData);
    }

    // 5. Navigate to dashboard
    navigate('/dashboard');

  } catch (err) {
    console.error('Failed to save onboarding data:', err);
    setError(err.response?.data?.error || err.message || 'Failed to save your data. Please try again.');
  } finally {
    setIsSaving(false);
  }
};

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkip = () => {
    // Set current expense to 0 and move to next step
    handleInputChange('0');
    if (step < questions.length) {
      setStep(step + 1);
    } else {
      handleNext();
    }
  };

  const currentQuestion = questions[step - 1];

  const handleInputChange = (value) => {
    if (currentQuestion.type === 'income') {
      setIncome(value);
    } else {
      setExpenses({
        ...expenses,
        [currentQuestion.type]: value
      });
    }
  };

  const isNextDisabled = () => {
    if (currentQuestion.type === 'income') {
      return !income;
    } else {
      return !expenses[currentQuestion.type];
    }
  };

  return (
    <div className="onboarding-wizard">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(step / questions.length) * 100}%` }}
        ></div>
      </div>

      <div className="question-card">
        <h2>Step {step} of {questions.length}</h2>
        <h3>{currentQuestion.question}</h3>

        {currentQuestion.tip && (
          <div className="tip-box">
            💡 {currentQuestion.tip}
          </div>
        )}

        <input
          type="number"
          min="0"
          step="0.01"
          value={currentQuestion.type === 'income' ? income : expenses[currentQuestion.type]}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Enter amount in AED"
          className="amount-input"
        />

        {error && (
          <div className="error-message" style={{ color: '#dc2626', marginTop: '1rem' }}>
            ⚠️ {error}
          </div>
        )}

        <div className="wizard-buttons">
          {step > 1 && (
            <button onClick={handleBack} className="back-button">
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="next-button"
            disabled={isNextDisabled() || isSaving}
          >
            {isSaving ? 'Saving...' : (step === questions.length ? 'Finish Setup →' : 'Next →')}
          </button>
        </div>

        {/* Skip button for expense steps */}
        {currentQuestion.type !== 'income' && (
          <div style={{ marginTop: '10px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={handleSkip}
              className="skip-button"
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Skip (set to 0)
            </button>
          </div>
        )}
      </div>

      <div className="step-indicators">
        {questions.map((q, index) => (
          <div
            key={q.id}
            className={`step-dot ${index + 1 <= step ? 'active' : ''}`}
          ></div>
        ))}
      </div>
    </div>
  );
}

export default OnboardingWizard;