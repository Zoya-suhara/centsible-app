import React, { useState, useEffect } from 'react';
import './TransactionForm.css';
import { autoCategorizeExpense, getCategorizationConfidence } from '../utils/autoCategorize';

function TransactionForm({ onAddTransaction, onClose, previousTransactions = [] }) {
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('groceries');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setHours(today.getHours() + 4); // UAE timezone adjustment
    return today.toISOString().split('T')[0];
  });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [confidence, setConfidence] = useState(0);
  const [suggestedCategory, setSuggestedCategory] = useState('');
  const [isAutoCategory, setIsAutoCategory] = useState(true);

    const categories = {
    expense: [
      { value: 'groceries', label: '🛒 Groceries & Food' },
      { value: 'rent', label: '🏠 Rent & Housing' },
      { value: 'transportation', label: '🚗 Transportation' },
      { value: 'utilities', label: '⚡ Bills & Utilities' },
      { value: 'entertainment', label: '🎬 Entertainment' },
      { value: 'shopping', label: '🛍️ Shopping' },
      { value: 'healthcare', label: '💊 Health & Medical' },
      { value: 'education', label: '📚 Education' },
      { value: 'other', label: '📦 Other' }
    ],

    income: [
      { value: 'salary', label: '💰 Salary' },
      { value: 'freelance', label: '💼 Freelance' },
      { value: 'investment', label: '📈 Investment' },
      { value: 'gift', label: '🎁 Gift' },
      { value: 'other', label: '📦 Other Income' }
    ]
  };

    const paymentMethods = [
    { value: 'cash', label: '💵 Cash' },
    { value: 'card', label: '💳 Credit/Debit Card' },
    { value: 'bank_transfer', label: '🏦 Bank Transfer' },
    { value: 'digital_wallet', label: '📱 Digital Wallet' }
  ];

  // Auto-categorization effect
  useEffect(() => {
    if (description.trim() && isAutoCategory && type === 'expense') {
      const category = autoCategorizeExpense(description, amount, previousTransactions);
      const conf = getCategorizationConfidence(description, category);
      
      setSuggestedCategory(category);
      setCategory(category);
      setConfidence(conf);
    }
  }, [description, amount, type, isAutoCategory, previousTransactions]);
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const transaction = {
      type,
      amount: Number(amount),
      category,
      description,
      date: new Date(date).toISOString(),
      paymentMethod,
    };

    onAddTransaction(transaction);
    
    // Reset form
    setAmount('');
    setDescription('');
    setCategory(type === 'expense' ? 'groceries' : 'salary');
    setConfidence(0);
    setSuggestedCategory('');
    
    // Show success message
    alert(`${type === 'income' ? 'Income' : 'Expense'} added successfully!`);
    
    // Close form if needed
    if (onClose) onClose();
  };

  return (
    <div className="transaction-form-container">
      <div className="transaction-form-header">
        <h2>{type === 'income' ? '➕ Add Income' : '💸 Add Expense'}</h2>
        {onClose && (
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="transaction-form">
        {/* Type Toggle */}
        <div className="type-toggle">
          <button
            type="button"
            className={`type-button ${type === 'income' ? 'active' : ''}`}
            onClick={() => {
              setType('income');
              setIsAutoCategory(false); // Turn off auto for income
            }}
          >
            💰 Income
          </button>
          <button
            type="button"
            className={`type-button ${type === 'expense' ? 'active' : ''}`}
            onClick={() => setType('expense')}
          >
            💸 Expense
          </button>
        </div>

        {/* Amount Input */}
        <div className="form-group">
          <label>Amount (د.إ)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
          />
        </div>

        {/* Category Select */}
        <div className="form-group">
          <label>Category</label>
          
          {/* Auto-Categorization Toggle */}
          {type === 'expense' && (
            <div className="auto-category-toggle">
              <button
                type="button"
                className={`toggle-button ${isAutoCategory ? 'active' : ''}`}
                onClick={() => setIsAutoCategory(true)}
              >
                🤖 Auto
              </button>
              <button
                type="button"
                className={`toggle-button ${!isAutoCategory ? 'active' : ''}`}
                onClick={() => setIsAutoCategory(false)}
              >
                ✏️ Manual
              </button>
              {isAutoCategory && suggestedCategory && (
                <span className="auto-suggestion">
                  Suggested: {categories.expense.find(c => c.value === suggestedCategory)?.label}
                </span>
              )}
            </div>
          )}
          
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setIsAutoCategory(false); // User manually selected, turn off auto
            }}
            required
          >
            {categories[type].map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Confidence Display */}
        {isAutoCategory && confidence > 0 && type === 'expense' && (
          <div className="confidence-display">
            <div className="confidence-label">
              AI Confidence: {Math.round(confidence * 100)}%
            </div>
            <div className="confidence-bar">
              <div 
                className="confidence-fill"
                style={{ width: `${confidence * 100}%` }}
              ></div>
            </div>
            {confidence < 0.7 && (
              <div className="low-confidence-warning">
                ⚠️ Low confidence. Consider selecting category manually.
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this for? (e.g., 'Dinner at restaurant', 'Fuel for car')"
            maxLength="100"
          />
        </div>

        {/* Date */}
        <div className="form-group">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        {/* Payment Method */}
        <div className="form-group">
          <label>Payment Method</label>
          <div className="payment-methods">
            {paymentMethods.map((method) => (
              <label key={method.value} className="payment-method">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.value}
                  checked={paymentMethod === method.value}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                />
                <span className="method-label">{method.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Smart Suggestions */}
        {type === 'expense' && description.trim() && (
          <div className="smart-suggestions">
            <h4>💡 Smart Suggestions</h4>
            <div className="suggestion-chips">
              {[
                { text: '🍔 Food & Dining', cat: 'groceries' },
                { text: '⛽ Fuel', cat: 'transportation' },
                { text: '🏠 Rent', cat: 'rent' },
                { text: '⚡ Bill', cat: 'utilities' },
                { text: '🎬 Entertainment', cat: 'entertainment' }
              ].map((suggestion) => (
                <button
                  key={suggestion.cat}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => {
                    setCategory(suggestion.cat);
                    setIsAutoCategory(false);
                  }}
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className="form-actions">
          <button type="submit" className="submit-button">
            {type === 'income' ? '💾 Add Income' : '💾 Add Expense'}
          </button>
          {onClose && (
            <button type="button" className="cancel-button" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Quick Amount Buttons (for expenses) */}
      {type === 'expense' && (
        <div className="quick-amounts">
          <p>Quick Add:</p>
          <div className="quick-buttons">
            {[10, 20, 50, 100, 200, 500].map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                className="quick-button"
                onClick={() => setAmount(quickAmount)}
              >
                د.إ {quickAmount}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionForm;