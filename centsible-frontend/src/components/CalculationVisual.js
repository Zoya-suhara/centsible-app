import React, { useState, useEffect } from 'react';
import './CalculationVisual.css';

function CalculationVisual({ income = 0, expenses = {}, currency = 'AED' }) {
  const [showCalculation, setShowCalculation] = useState(false);
  const [animatedIncome, setAnimatedIncome] = useState(0);
  
  // Safely calculate totals (prevent negative disposable income)
  const totalExpenses = Object.values(expenses).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const disposableIncome = Math.max(0, income - totalExpenses);
  const savingsGoal = disposableIncome * 0.3;
  
  // Currency symbol mapping
  const getCurrencySymbol = (curr) => {
    const symbols = { AED: 'د.إ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return symbols[curr] || curr;
  };
  const currencySymbol = getCurrencySymbol(currency);

  useEffect(() => {
    let incomeTimer = null;
    const timer = setTimeout(() => {
      setShowCalculation(true);
      
      // Animate income counting (only if income > 0)
      if (income > 0) {
        let current = 0;
        const increment = income / 50;
        incomeTimer = setInterval(() => {
          current += increment;
          if (current >= income) {
            clearInterval(incomeTimer);
            setAnimatedIncome(income);
          } else {
            setAnimatedIncome(current);
          }
        }, 20);
      } else {
        setAnimatedIncome(0);
      }
    }, 500);
    
    return () => {
      clearTimeout(timer);
      if (incomeTimer) clearInterval(incomeTimer);
    };
  }, [income]);

  return (
    <div className="calculation-visual">
      <h3>📊 How Your Budget is Calculated</h3>
      
      <div className="calculation-steps">
        {/* Step 1: Income */}
        <div className="calculation-step">
          <div className="step-header">
            <span className="step-number">1</span>
            <span className="step-title">Monthly Income</span>
          </div>
          <div className="step-amount income-amount">
            + {currencySymbol} {Math.floor(animatedIncome || income).toLocaleString()}
          </div>
        </div>

        {/* Step 2: Expenses */}
        <div className="calculation-step">
          <div className="step-header">
            <span className="step-number">2</span>
            <span className="step-title">Monthly Expenses</span>
          </div>
          
          <div className="expense-breakdown">
            {Object.entries(expenses).map(([category, amount]) => (
              Number(amount) > 0 && (
                <div key={category} className="expense-line">
                  <span className="expense-category">
                    {category === 'rent' ? '🏠 Rent' : 
                     category === 'groceries' ? '🛒 Groceries' : 
                     category === 'transportation' ? '🚗 Transportation' : 
                     '⚡ Utilities'}
                  </span>
                  <span className="expense-amount">- {currencySymbol} {Number(amount).toLocaleString()}</span>
                </div>
              )
            ))}
            <div className="expense-total">
              <strong>Total Expenses</strong>
              <strong className="negative">- {currencySymbol} {totalExpenses.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Step 3: Calculation */}
        {showCalculation && (
          <div className="calculation-step highlight">
            <div className="step-header">
              <span className="step-number">3</span>
              <span className="step-title">Disposable Income</span>
            </div>
            <div className="calculation-formula">
              <div className="formula-line">
                <span>Income</span>
                <span>{currencySymbol} {income.toLocaleString()}</span>
              </div>
              <div className="formula-line">
                <span>− Total Expenses</span>
                <span>{currencySymbol} {totalExpenses.toLocaleString()}</span>
              </div>
              <div className="formula-divider"></div>
              <div className="formula-result">
                <strong>= Disposable Income</strong>
                <strong className="positive">{currencySymbol} {disposableIncome.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Savings Goal */}
        {showCalculation && disposableIncome > 0 && (
          <div className="calculation-step">
            <div className="step-header">
              <span className="step-number">4</span>
              <span className="step-title">Recommended Savings</span>
            </div>
            <div className="savings-calculation">
              <div className="savings-formula">
                <span>{currencySymbol} {disposableIncome.toLocaleString()} × 30% =</span>
                <span className="savings-amount">{currencySymbol} {Math.floor(savingsGoal).toLocaleString()}</span>
              </div>
              <div className="savings-tip">
                💡 Saving 30% of your disposable income is recommended for financial security
              </div>
            </div>
          </div>
        )}

        {/* Show message if no disposable income */}
        {showCalculation && disposableIncome === 0 && (
          <div className="calculation-step warning">
            <div className="step-header">
              <span className="step-number">⚠️</span>
              <span className="step-title">Budget Alert</span>
            </div>
            <div className="savings-tip warning-tip">
              Your expenses equal or exceed your income. Consider reducing expenses or increasing income.
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="calculation-progress">
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: showCalculation ? '100%' : '30%' }}
          ></div>
        </div>
        <div className="progress-label">
          {showCalculation ? '✓ Calculation Complete' : 'Calculating...'}
        </div>
      </div>
    </div>
  );
}

export default CalculationVisual;