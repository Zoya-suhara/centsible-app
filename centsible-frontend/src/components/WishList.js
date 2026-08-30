import React, { useState, useEffect, useCallback } from 'react';
import './WishList.css';
import { useAuth } from '../context/AuthContext';
import { wishlistAPI } from '../utils/api';
import { debounce } from 'lodash';

function WishList({ userCurrency = 'AED', availableBalance = 0, onOpenAIAssistant, onAddSavingsTransaction  }) {
  const { wishlist, addWishlistItem, updateWishlistItem, deleteWishlistItem, userData } = useAuth();
  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    priority: 'medium',
    targetDate: '',
    category: 'other',
    notes: ''
  });

  const [priceLoading, setPriceLoading] = useState(false);
const [suggestedPrice, setSuggestedPrice] = useState(null);
const [priceSource, setPriceSource] = useState('');


const fetchSuggestedPrice = useCallback(
  debounce(async (itemName, category) => {
    if (!itemName || itemName.length < 3) return;
    setPriceLoading(true);
    setSuggestedPrice(null);
    try {
      const response = await wishlistAPI.lookupPrice(itemName, category);
      if (response.data.success) {
        const { price, source } = response.data.data;
        setSuggestedPrice(price);
        setPriceSource(source);
        if (!newItem.price) {
          setNewItem(prev => ({ ...prev, price: price }));
        }
      }
    } catch (err) {
      console.warn('Price lookup failed, using fallback');
    } finally {
      setPriceLoading(false);
    }
  }, 500),
  [newItem.price]
);

useEffect(() => {
  if (newItem.name && !newItem.price) { // ✅ Only if price is empty
    fetchSuggestedPrice(newItem.name, newItem.category);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [newItem.name, newItem.category]); // ✅ No fetchSuggestedPrice dependency

  const formatCurrency = (amount, currency = userCurrency) => {
    if (!amount && amount !== 0) return '0.00';
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

const addWishItem = () => {
  if (newItem.name && newItem.price) {
    const item = {
      name: newItem.name,
      estimatedPrice: parseFloat(newItem.price),
      priority: newItem.priority,
      targetDate: newItem.targetDate || null,
      category: newItem.category,
      notes: newItem.notes || '',
      savedAmount: 0,
      currency: userCurrency,
      source: 'manual'
    };
    
    addWishlistItem(item);
    
    setNewItem({
      name: '',
      price: '',
      priority: 'medium',
      targetDate: '',
      category: 'other',
      notes: ''
    });
  }
};

 const addSavings = (itemId, amount) => {
  const item = wishlist.find(i => i.id === itemId);
  if (!item) return;
  
  const newSaved = Math.min(
    (item.savedAmount || 0) + amount,
    item.estimatedPrice
  );
  
  // Update wishlist item saved amount
  updateWishlistItem(itemId, { savedAmount: newSaved });
  
  // Create expense transaction to reduce available balance
  if (onAddSavingsTransaction && amount > 0) {
    onAddSavingsTransaction(amount, `Saved for ${item.name || item.item}`);
  }
};

const withdrawSavings = (itemId, amount) => {
  const item = wishlist.find(i => i.id === itemId);
  if (!item) return;
  
  const currentSaved = item.savedAmount || 0;
  const newSaved = Math.max(currentSaved - amount, 0);
  const withdrawnAmount = currentSaved - newSaved;
  
  if (withdrawnAmount <= 0) return;
  
  // Update wishlist item saved amount
  updateWishlistItem(itemId, { savedAmount: newSaved });
  
  // Create an income transaction to restore available balance
  if (onAddSavingsTransaction && withdrawnAmount > 0) {
    onAddSavingsTransaction(-withdrawnAmount, `Withdrew from ${item.name || item.item}`);
  }
};

const removeItem = (itemId) => {
  if (window.confirm('Remove this item from wishlist?')) {
    deleteWishlistItem(itemId);
  }
};

 const updateItem = (itemId, updates) => {
  updateWishlistItem(itemId, updates);
};

  const getAIRecommendation = () => {
    if (!wishlist || wishlist.length === 0) {
      return "🎯 **AI Suggestion:** Add items you're dreaming of! Try saying 'I want to buy iPhone 15' to the AI assistant.";
    }
    
    const totalWishPrice = wishlist.reduce((sum, item) => 
      sum + (item.estimatedPrice || item.price || 0), 0
    );
    const totalSaved = wishlist.reduce((sum, item) => 
      sum + (item.savedAmount || 0), 0
    );
    const remaining = totalWishPrice - totalSaved;
    
    if (availableBalance <= 0) {
      return "💡 **AI Suggestion:** Focus on building your income first. Start with small savings from any extra money you get.";
    }
    
    if (remaining === 0) {
      return "🎉 **AI Suggestion:** All wishes funded! Consider setting new goals or investing the extra money.";
    }
    
    const monthlyAllocation = availableBalance * 0.2; // 20% of disposable income
    const monthsNeeded = Math.ceil(remaining / monthlyAllocation);
    
    // Find highest priority item
    const highPriorityItems = wishlist.filter(item => 
      item.priority === 'high' && (item.savedAmount || 0) < (item.estimatedPrice || item.price || 0)
    );
    
    if (highPriorityItems.length > 0 && monthsNeeded <= 1) {
      return `🚀 AI Suggestion: Focus on "${highPriorityItems[0].item || highPriorityItems[0].name}". You can fund it this month with ${formatCurrency(remaining)}!`;
    } else if (monthsNeeded <= 3) {
      return `📅 AI Suggestion: Save ${formatCurrency(monthlyAllocation)} monthly to reach your goals in ${monthsNeeded} months.`;
    } else {
      return `🏦 AI Suggestion: Consider increasing income or reducing lower-priority wishes to reach goals faster.`;
    }
  };

  const calculateProgress = (item) => {
    const price = item.estimatedPrice || item.price || 0;
    const saved = item.savedAmount || 0;
    if (price <= 0) return 0;
    return Math.round((saved / price) * 100);
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'medium': return '#ffd166';
      case 'low': return '#06d6a0';
      default: return '#118ab2';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high': return '🔴 High';
      case 'medium': return '🟡 Medium';
      case 'low': return '🟢 Low';
      default: return priority;
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      electronics: '💻',
      fashion: '👕',
      home: '🏠',
      vehicle: '🚗',
      property: '🏢',
      travel: '✈️',
      education: '📚',
      other: '🎁'
    };
    return icons[category] || '🎁';
  };

  // Calculate total wishlist value
  const totalWishValue = wishlist?.reduce((sum, item) => 
    sum + (item.estimatedPrice || item.price || 0), 0
  ) || 0;

  const totalSaved = wishlist?.reduce((sum, item) => 
    sum + (item.savedAmount || 0), 0
  ) || 0;

  const remaining = totalWishValue - totalSaved;
  const overallProgress = totalWishValue > 0 ? Math.round((totalSaved / totalWishValue) * 100) : 0;

  return (
    <div className="wish-list">
      <div className="wish-header">
        <h2>🎁 Your Wish List</h2>
        <p>Track things you want to buy and save towards them</p>
        
        <div className="wishlist-stats-bar">
          <div className="stat-item">
            <div className="stat-label">Total Value</div>
            <div className="stat-value">{formatCurrency(totalWishValue)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Saved</div>
            <div className="stat-value saved">{formatCurrency(totalSaved)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Remaining</div>
            <div className="stat-value remaining">{formatCurrency(remaining)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Progress</div>
            <div className="stat-value progress">{overallProgress}%</div>
          </div>
        </div>
        
        <div className="available-balance">
          Available to allocate: <strong>{formatCurrency(availableBalance)}</strong>
        </div>
      </div>

      {/* AI Suggestion */}
      <div className="ai-suggestion">
        <div className="suggestion-icon">🤖</div>
        <div className="suggestion-content">
          {getAIRecommendation()}
        </div>
        <button 
  className="ai-assistant-button"
  onClick={() => onOpenAIAssistant && onOpenAIAssistant()}
>
  Open AI Assistant
</button>
      </div>

      {/* Add New Wish */}
      <div className="add-wish-section">
        <h3><span className="section-icon">✨</span> Add New Wish</h3>
        <div className="wish-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="What do you wish for? (e.g., MacBook Pro, Trip to Bali)"
              value={newItem.name}
              onChange={(e) => setNewItem({...newItem, name: e.target.value})}
              className="wish-input"
            />
          </div>
          
                    <div className="form-row two-columns">
            <div className="input-group">
  <label>Target Date (Optional)</label>
  <input
    type="date"
    value={newItem.targetDate}
    onChange={(e) => setNewItem({...newItem, targetDate: e.target.value})}
    className="wish-input"
    placeholder="When do you want it?"
  />
</div>
            
            <div className="input-group">
              <label>Priority</label>
              <select
                value={newItem.priority}
                onChange={(e) => setNewItem({...newItem, priority: e.target.value})}
                className="wish-select"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>
            </div>
          </div>
          
          <div className="form-row two-columns">
            <div className="input-group">
              <label>Category</label>
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                className="wish-select"
              >
                <option value="electronics">💻 Electronics</option>
                <option value="fashion">👕 Fashion</option>
                <option value="home">🏠 Home</option>
                <option value="vehicle">🚗 Vehicle</option>
                <option value="travel">✈️ Travel</option>
                <option value="education">📚 Education</option>
                <option value="other">🎁 Other</option>
              </select>
            </div>
            
            <div className="input-group">
  <label>Price ({userCurrency}) {priceLoading && <span className="price-loading">🔍 Searching...</span>}</label>
  <input
    type="number"
    placeholder="Estimated cost"
    value={newItem.price}
    onChange={(e) => setNewItem({...newItem, price: e.target.value})}
    className="wish-input"
  />
  {suggestedPrice && !newItem.price && (
    <div className="suggested-price">
      <span>Suggested: {formatCurrency(suggestedPrice)} {priceSource && `(via ${priceSource})`}</span>
      <button 
        type="button"
        className="use-suggested-btn"
        onClick={() => setNewItem({...newItem, price: suggestedPrice})}
      >
        Use this price
      </button>
    </div>
  )}
</div>
          </div>
          
          <div className="form-row">
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newItem.notes}
              onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
              className="wish-input"
            />
          </div>
          
          <button onClick={addWishItem} className="add-wish-btn" disabled={!newItem.name || !newItem.price}>
            <span className="btn-icon">+</span> Add to Wish List
          </button>
          
          <div className="ai-tip">
            <span className="tip-icon">💡</span>
            <span>Try saying to AI: "Add iPhone 15 to my wishlist" or "I want to buy a new laptop"</span>
          </div>
        </div>
      </div>

      {/* Wish Items */}
      <div className="wish-items-section">
        <div className="section-header">
          <h3><span className="section-icon">📋</span> Your Wishes ({wishlist?.length || 0})</h3>
          <div className="section-actions">
            <button 
  className="action-btn" 
  onClick={() => {
    if (window.confirm('Clear all wishlist items?')) {
      wishlist.forEach(item => deleteWishlistItem(item.id));
    }
  }} 
  disabled={!wishlist?.length}
>
  Clear All
</button>

          </div>
        </div>
        {(!wishlist || wishlist.length === 0) ? (
  <div className="empty-wishlist">
    <div className="empty-icon">🎯</div>
    <h4>Your wishlist is empty</h4>
    <p>Add something you're dreaming of buying or saving for!</p>
    <div className="example-wishes">
      <div className="example-chip">iPhone 15 Pro</div>
      <div className="example-chip">Trip to Bali</div>
      <div className="example-chip">New Laptop</div>
      <div className="example-chip">Gym Membership</div>
    </div>
  </div>
) : (
  <div className="wish-items-grid">
    {wishlist.map(item => {
      const progress = calculateProgress(item);
      const itemPrice = item.estimatedPrice || item.price || 0;
      const savedAmount = item.savedAmount || 0;
      const itemCurrency = item.currency || userCurrency;
      
      return (
        <div key={item.id} className="wish-item-card">
          <div className="wish-item-header">
            <div className="wish-info">
              <div className="wish-category">
                <span className="category-icon">
                  {getCategoryIcon(item.category)}
                </span>
                <span className="category-label">{item.category}</span>
                {item.source === 'ai_wizard' && (
                  <span className="ai-badge">🤖 AI</span>
                )}
              </div>
              <div className="wish-name">
                <span className="priority-dot" style={{backgroundColor: getPriorityColor(item.priority)}}></span>
                {item.item || item.name}
              </div>
            </div>
            <div className="wish-header-actions">
              <button 
                className="ai-advice-item-btn"
                onClick={() => onOpenAIAssistant && onOpenAIAssistant(`Should I buy ${item.name || item.item} now?`)}
                title="Ask AI about this purchase"
              >
                🤖
              </button>
              <button 
                onClick={() => removeItem(item.id)}
                className="remove-wish-btn"
                title="Remove item"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="wish-details">
            <div className="wish-price">
              <span className="price-label">Price:</span>
              <span className="price-value">{formatCurrency(itemPrice, itemCurrency)}</span>
              <button 
                className="edit-inline-btn"
                onClick={() => {
                  const newPrice = prompt('Enter new price:', itemPrice);
                  if (newPrice && !isNaN(newPrice)) {
                    updateItem(item.id, { estimatedPrice: parseFloat(newPrice) });
                  }
                }}
                title="Edit price"
              >
                ✏️
              </button>
            </div>
            
            <div className="wish-meta">
              <span className="priority-badge" style={{backgroundColor: getPriorityColor(item.priority)}}>
                {getPriorityLabel(item.priority)}
              </span>
              <button 
                className="edit-inline-btn"
                onClick={() => {
                  const priorities = ['low', 'medium', 'high'];
                  const currentIndex = priorities.indexOf(item.priority);
                  const nextPriority = priorities[(currentIndex + 1) % priorities.length];
                  updateItem(item.id, { priority: nextPriority });
                }}
                title="Cycle priority"
              >
                🔄
              </button>
              {item.targetDate && (
                <span className="target-date">
                  🗓️ {new Date(item.targetDate).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Affordability and savings plan */}
            {(() => {
              const isAffordable = availableBalance >= (itemPrice - savedAmount);
              const monthlySavings = userData?.savingsGoal || (availableBalance * 0.2);
              const monthsNeeded = monthlySavings > 0 
                ? Math.ceil((itemPrice - savedAmount) / monthlySavings) 
                : Infinity;
              return (
                <div className="affordability-badge">
                  {isAffordable ? (
                    <span className="affordable-tag">✅ You can afford this now!</span>
                  ) : (
                    <span className="saving-plan-tag">
                      ⏳ Save {formatCurrency(monthlySavings)}/mo for {monthsNeeded} months
                    </span>
                  )}
                </div>
              );
            })()}
            
            {item.notes && (
              <div className="wish-notes">
                <span className="notes-icon">📝</span>
                {item.notes}
              </div>
            )}
          </div>
          
          {/* Progress Bar */}
          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Progress</span>
              <span className="progress-percentage">{progress}%</span>
            </div>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-text">
              {formatCurrency(savedAmount, itemCurrency)} / {formatCurrency(itemPrice, itemCurrency)}
            </div>
          </div>
          
          {/* Quick Save Actions */}
          <div className="wish-actions">
            <div className="quick-save-title">Quick Save:</div>
            <div className="save-buttons">
              <button 
                onClick={() => addSavings(item.id, availableBalance * 0.1)}
                className="save-btn"
                disabled={availableBalance <= 0}
                title="Add 10% of available balance"
              >
                +10%
              </button>
              <button 
                onClick={() => addSavings(item.id, availableBalance * 0.2)}
                className="save-btn"
                disabled={availableBalance <= 0}
                title="Add 20% of available balance"
              >
                +20%
              </button>
              <button 
                onClick={() => addSavings(item.id, itemPrice - savedAmount)}
                className="save-btn full"
                disabled={savedAmount >= itemPrice}
                title="Fund fully from available balance"
              >
                Fund Fully
              </button>
            </div>
            
            {/* Quick Withdraw Buttons */}
            <div className="quick-withdraw-title" style={{ marginTop: '8px' }}>Quick Withdraw:</div>
<div className="withdraw-buttons" style={{ display: 'flex', gap: '8px' }}>
  <button 
    onClick={() => withdrawSavings(item.id, savedAmount * 0.1)}
    className="save-btn withdraw"
    disabled={savedAmount <= 0}
    title="Withdraw 10% of saved amount"
  >
    -10%
  </button>
  <button 
    onClick={() => withdrawSavings(item.id, savedAmount * 0.2)}
    className="save-btn withdraw"
    disabled={savedAmount <= 0}
    title="Withdraw 20% of saved amount"
  >
    -20%
  </button>
  <button 
    onClick={() => withdrawSavings(item.id, savedAmount)}
    className="save-btn withdraw full"
    disabled={savedAmount <= 0}
    title="Withdraw all savings"
  >
    Withdraw All
  </button>
</div>

            {/* Manual Save Input */}
            <div className="manual-save">
              <input
                type="number"
                placeholder={`Amount in ${itemCurrency}`}
                className="manual-save-input"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && e.target.value) {
                    addSavings(item.id, parseFloat(e.target.value));
                    e.target.value = '';
                  }
                }}
              />
              <button 
                className="manual-save-btn"
                onClick={(e) => {
                  const input = e.target.previousElementSibling;
                  if (input.value) {
                    addSavings(item.id, parseFloat(input.value));
                    input.value = '';
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Manual Withdraw Input */}
<div className="manual-withdraw" style={{ marginTop: '8px' }}>
  <input
    type="number"
    placeholder="Withdraw amount"
    className="manual-withdraw-input"
    onKeyPress={(e) => {
      if (e.key === 'Enter' && e.target.value) {
        withdrawSavings(item.id, parseFloat(e.target.value));
        e.target.value = '';
      }
    }}
  />
  <button 
    className="manual-withdraw-btn"
    onClick={(e) => {
      const input = e.target.previousElementSibling;
      if (input.value) {
        withdrawSavings(item.id, parseFloat(input.value));
        input.value = '';
      }
    }}
  >
    Withdraw
  </button>
</div>
          


          {/* Added Date */}
          {item.addedDate && (
            <div className="added-date">
              Added: {new Date(item.addedDate).toLocaleDateString()}
            </div>
          )}
        </div>
      );
    })}
  </div>
)}
</div> 


      {/* Savings Plan */}
      <div className="savings-plan">
        <h3><span className="section-icon">📈</span> Savings Plan</h3>
        <div className="plan-details">
          <div className="plan-item">
            <div className="plan-label">Recommended Monthly Savings</div>
            <div className="plan-value">{formatCurrency(availableBalance * 0.2)}</div>
            <div className="plan-description">(20% of available balance)</div>
          </div>
          
          <div className="plan-item">
            <div className="plan-label">Time to Fund All Wishes</div>
            <div className="plan-value">
              {(() => {
                const monthlyAllocation = availableBalance * 0.2;
                return monthlyAllocation > 0 ? `${Math.ceil(remaining / monthlyAllocation)} months` : 'N/A';
              })()}
            </div>
            <div className="plan-description">at current savings rate</div>
          </div>
          
          <div className="plan-item">
            <div className="plan-label">Monthly Target</div>
            <div className="plan-value">{formatCurrency(remaining / 12)}</div>
            <div className="plan-description">to fund in 1 year</div>
          </div>
        </div>
        
        <div className="plan-advice">
          <h4>💡 AI Financial Advice</h4>
          <p>
            {remaining > availableBalance * 6 ? 
              "Consider prioritizing your highest-value wishes first, or look for ways to increase your monthly savings rate." :
              "Great! Your wishlist is achievable within a reasonable timeframe. Stay consistent with your savings!"
            }
          </p>
          <ul>
            <li>Set up automatic transfers to your savings account</li>
            <li>Review your wishlist monthly and adjust priorities</li>
            <li>Look for discounts or second-hand options for high-cost items</li>
            <li>Consider if each purchase aligns with your long-term financial goals</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default WishList;