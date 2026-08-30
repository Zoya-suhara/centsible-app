import React from 'react';
import './WishlistPromptModal.css'; // We'll create this next

function WishlistPromptModal({
  availableBalance,
  wishlist,
  onClose,
  onAddFunds,
  formatCurrency,
  userCurrency = 'AED'
}) {
  // Filter items that are not fully funded
  const unfundedItems = wishlist
    .filter(item => (item.savedAmount || 0) < (item.estimatedPrice || item.price || 0))
    .sort((a, b) => {
      // Sort by priority (high > medium > low) then by remaining amount
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      const aRemaining = (a.estimatedPrice || a.price || 0) - (a.savedAmount || 0);
      const bRemaining = (b.estimatedPrice || b.price || 0) - (b.savedAmount || 0);
      return aRemaining - bRemaining;
    });

  // Affordable items (can be fully funded now)
  const affordableItems = unfundedItems.filter(item => {
    const remaining = (item.estimatedPrice || item.price || 0) - (item.savedAmount || 0);
    return remaining <= availableBalance;
  });

  // Items that need saving (not affordable now)
  const savingItems = unfundedItems.filter(item => {
    const remaining = (item.estimatedPrice || item.price || 0) - (item.savedAmount || 0);
    return remaining > availableBalance;
  });

  const monthlySavingsGoal = availableBalance * 0.2; // 20% of disposable

  return (
    <div className="wishlist-prompt-overlay" onClick={onClose}>
      <div className="wishlist-prompt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-modal-btn" onClick={onClose}>×</button>
        
        <div className="prompt-header">
          <span className="prompt-icon">🎉</span>
          <h2>You have extra funds!</h2>
          <p className="available-amount">
            Available balance: <strong>{formatCurrency(availableBalance, userCurrency)}</strong>
          </p>
        </div>

        {/* Affordable Items Section */}
        {affordableItems.length > 0 && (
          <div className="prompt-section">
            <h3>✅ You can afford these right now:</h3>
            <div className="prompt-items-list">
              {affordableItems.slice(0, 3).map(item => {
                const itemPrice = item.estimatedPrice || item.price || 0;
                const saved = item.savedAmount || 0;
                const remaining = itemPrice - saved;
                const canFullyFund = remaining <= availableBalance;
                
                return (
                  <div key={item.id} className="prompt-item">
                    <div className="prompt-item-info">
                      <span className="item-name">{item.name || item.item}</span>
                      <span className="item-remaining">
                        Needs {formatCurrency(remaining, item.currency || userCurrency)}
                      </span>
                    </div>
                    <div className="prompt-item-actions">
                      {canFullyFund && (
  <button
    className="fund-fully-btn"
    onClick={async () => {
      await onAddFunds(item.id, remaining);
      onClose();
    }}
  >
    Fund Fully
  </button>
)}
                      <button
  className="fund-partial-btn"
  onClick={async () => {
    await onAddFunds(item.id, availableBalance * 0.2);
    onClose();
  }}
>
  Add 20%
</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Savings Plan Section */}
        {savingItems.length > 0 && (
          <div className="prompt-section">
            <h3>⏳ Save toward these goals:</h3>
            <div className="prompt-items-list">
              {savingItems.slice(0, 3).map(item => {
                const itemPrice = item.estimatedPrice || item.price || 0;
                const saved = item.savedAmount || 0;
                const remaining = itemPrice - saved;
                const monthsNeeded = Math.ceil(remaining / monthlySavingsGoal);
                
                return (
                  <div key={item.id} className="prompt-item saving-item">
                    <div className="prompt-item-info">
                      <span className="item-name">{item.name || item.item}</span>
                      <span className="item-remaining">
                        Needs {formatCurrency(remaining, item.currency || userCurrency)}
                      </span>
                    </div>
                    <div className="savings-plan-info">
                      Save {formatCurrency(monthlySavingsGoal, userCurrency)}/mo for {monthsNeeded} months
                    </div>
                    <div className="prompt-item-actions">
                      <button
  className="fund-partial-btn"
  onClick={async () => {
    await onAddFunds(item.id, monthlySavingsGoal);
    onClose();
  }}
>
  Save This Month
</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No items case */}
        {unfundedItems.length === 0 && (
          <div className="prompt-section empty-state">
            <p>🎯 Your wishlist is fully funded! Consider adding new goals.</p>
          </div>
        )}

        <div className="prompt-footer">
          <button className="secondary-btn" onClick={onClose}>
            Not now
          </button>
          <button className="primary-btn" onClick={() => {
            // Navigate to full wishlist page
            window.location.href = '/wishlist';
          }}>
            View Full Wishlist
          </button>
        </div>
      </div>
    </div>
  );
}

export default WishlistPromptModal;