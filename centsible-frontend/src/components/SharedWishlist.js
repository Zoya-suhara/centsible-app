import React, { useState, useMemo } from 'react';
import { useRoom } from '../context/RoomContext';
import { useAuth } from '../context/AuthContext';
import './WishList.css'; // Reuse existing styles

const SharedWishlist = () => {
  const { user } = useAuth();
  const {
    roomData,
    wishlist = [],
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    isAdmin,
  } = useRoom();

  const [newItem, setNewItem] = useState({
    name: '',
    price: '',
    category: 'other',
    priority: 'medium',
    targetDate: '',
    notes: '',
  });

  const [contributionItemId, setContributionItemId] = useState(null);
  const [contributionAmount, setContributionAmount] = useState('');

  // Helper: format currency
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

  const toast = (message, type = 'info') => {
    if (window.toast) {
      window.toast[type]?.(message) || window.toast.info(message);
    } else {
      console.log(`[Toast] ${type}: ${message}`);
    }
  };

  // Add a new wishlist item
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItem.name || !newItem.price) {
      toast('Name and estimated price are required', 'warning');
      return;
    }

    const result = await addWishlistItem({
      name: newItem.name,
      estimatedPrice: parseFloat(newItem.price),
      category: newItem.category,
      priority: newItem.priority,
      targetDate: newItem.targetDate || null,
      notes: newItem.notes,
    });

    if (result.success) {
      toast('Item added to shared wishlist', 'success');
      setNewItem({
        name: '',
        price: '',
        category: 'other',
        priority: 'medium',
        targetDate: '',
        notes: '',
      });
    } else {
      toast(result.error || 'Failed to add item', 'error');
    }
  };

  // Add contribution to an item
  const handleContribute = async (itemId) => {
    if (!contributionAmount || isNaN(contributionAmount) || parseFloat(contributionAmount) <= 0) {
      toast('Enter a valid amount', 'warning');
      return;
    }

    const result = await updateWishlistItem(itemId, {
      contributionAmount: parseFloat(contributionAmount),
    });

    if (result.success) {
      toast(`Contributed ${formatCurrency(parseFloat(contributionAmount))}`, 'success');
      setContributionItemId(null);
      setContributionAmount('');
    } else {
      toast(result.error || 'Contribution failed', 'error');
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Remove this item from the shared wishlist?')) return;
    const result = await deleteWishlistItem(itemId);
    if (result.success) {
      toast('Item removed', 'success');
    } else {
      toast(result.error || 'Delete failed', 'error');
    }
  };

  // Calculate total wishlist value and overall progress
  const stats = useMemo(() => {
    const totalValue = wishlist.reduce((sum, item) => sum + (item.estimatedPrice || 0), 0);
    const totalSaved = wishlist.reduce((sum, item) => sum + (item.totalSaved || 0), 0);
    const progress = totalValue > 0 ? (totalSaved / totalValue) * 100 : 0;
    return { totalValue, totalSaved, progress };
  }, [wishlist]);

  // Check if user can edit/delete an item
  const canEditItem = (item) => {
    if (isAdmin) return true;
    return item.addedBy?.userId === user?.id;
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ff6b6b';
      case 'medium': return '#ffd166';
      case 'low': return '#06d6a0';
      default: return '#118ab2';
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      electronics: '💻',
      fashion: '👕',
      home: '🏠',
      vehicle: '🚗',
      travel: '✈️',
      education: '📚',
      other: '🎁',
    };
    return icons[category] || '🎁';
  };

  if (!roomData) {
    return <div className="loading">Loading room data...</div>;
  }

  return (
    <div className="wish-list shared-wishlist">
      <div className="wish-header">
        <h2>🎁 Shared Wishlist</h2>
        <p>Save together for things the room wants or needs</p>

        <div className="wishlist-stats-bar">
          <div className="stat-item">
            <div className="stat-label">Total Value</div>
            <div className="stat-value">{formatCurrency(stats.totalValue)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Total Saved</div>
            <div className="stat-value saved">{formatCurrency(stats.totalSaved)}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Progress</div>
            <div className="stat-value progress">{stats.progress.toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* Add New Item Form */}
      <div className="add-wish-section">
        <h3><span className="section-icon">✨</span> Add New Wish</h3>
        <form onSubmit={handleAddItem} className="wish-form">
          <div className="form-row">
            <input
              type="text"
              placeholder="What do you wish for? (e.g., New TV, Vacation)"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="wish-input"
            />
          </div>
          <div className="form-row two-columns">
            <div className="input-group">
              <label>Price ({roomData.currency})</label>
              <input
                type="number"
                placeholder="Estimated cost"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                className="wish-input"
                min="0"
                step="0.01"
              />
            </div>
            <div className="input-group">
              <label>Category</label>
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
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
          </div>
          <div className="form-row two-columns">
            <div className="input-group">
              <label>Priority</label>
              <select
                value={newItem.priority}
                onChange={(e) => setNewItem({ ...newItem, priority: e.target.value })}
                className="wish-select"
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div className="input-group">
              <label>Target Date (Optional)</label>
              <input
                type="date"
                value={newItem.targetDate}
                onChange={(e) => setNewItem({ ...newItem, targetDate: e.target.value })}
                className="wish-input"
              />
            </div>
          </div>
          <div className="form-row">
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newItem.notes}
              onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
              className="wish-input"
            />
          </div>
          <button type="submit" className="add-wish-btn" disabled={!newItem.name || !newItem.price}>
            + Add to Shared Wishlist
          </button>
        </form>
      </div>

      {/* Wishlist Items */}
      <div className="wish-items-section">
        <div className="section-header">
          <h3><span className="section-icon">📋</span> Shared Wishes ({wishlist.length})</h3>
        </div>
        {wishlist.length === 0 ? (
          <div className="empty-wishlist">
            <div className="empty-icon">🎯</div>
            <h4>No shared wishes yet</h4>
            <p>Add something the room wants to save for together!</p>
          </div>
        ) : (
          <div className="wish-items-grid">
            {wishlist.map(item => {
              const progress = item.estimatedPrice > 0
                ? ((item.totalSaved || 0) / item.estimatedPrice) * 100
                : 0;
              const remaining = (item.estimatedPrice || 0) - (item.totalSaved || 0);
              const isFullyFunded = remaining <= 0;

              return (
                <div key={item._id} className={`wish-item-card ${isFullyFunded ? 'completed' : ''}`}>
                  <div className="wish-item-header">
                    <div className="wish-info">
                      <div className="wish-category">
                        <span className="category-icon">{getCategoryIcon(item.category)}</span>
                        <span className="category-label">{item.category}</span>
                      </div>
                      <div className="wish-name">
                        <span className="priority-dot" style={{ backgroundColor: getPriorityColor(item.priority) }}></span>
                        {item.name}
                      </div>
                    </div>
                    <div className="wish-header-actions">
                      {canEditItem(item) && (
                        <button
                          className="remove-wish-btn"
                          onClick={() => handleDeleteItem(item._id)}
                          title="Remove item"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="wish-details">
                    <div className="wish-price">
                      <span className="price-label">Price:</span>
                      <span className="price-value">{formatCurrency(item.estimatedPrice)}</span>
                    </div>
                    <div className="wish-meta">
                      <span className="priority-badge" style={{ backgroundColor: getPriorityColor(item.priority) }}>
                        {item.priority === 'high' ? '🔴 High' : item.priority === 'medium' ? '🟡 Medium' : '🟢 Low'}
                      </span>
                      {item.targetDate && (
                        <span className="target-date">
                          🗓️ {new Date(item.targetDate).toLocaleDateString()}
                        </span>
                      )}
                      <span className="added-by">
                        Added by: {item.addedBy?.name || 'Unknown'}
                      </span>
                    </div>
                    {item.notes && (
                      <div className="wish-notes">
                        <span className="notes-icon">📝</span> {item.notes}
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="progress-container">
                    <div className="progress-header">
                      <span className="progress-label">Progress</span>
                      <span className="progress-percentage">{progress.toFixed(0)}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="progress-text">
                      {formatCurrency(item.totalSaved || 0)} / {formatCurrency(item.estimatedPrice)}
                    </div>
                  </div>

                  {/* Contributions */}
                  {item.contributions?.length > 0 && (
                    <div className="contributions-list">
                      <div className="contributions-title">Recent contributions:</div>
                      {item.contributions.slice(-3).map((c, idx) => {
                        const member = roomData.members?.find(m => m.userId === c.userId);
                        return (
                          <div key={idx} className="contribution-item">
                            {member?.name || 'Someone'} contributed {formatCurrency(c.amount)}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Contribute Section */}
                  {!isFullyFunded && (
                    <div className="contribute-section">
                      {contributionItemId === item._id ? (
                        <div className="contribute-input-group">
                          <input
                            type="number"
                            placeholder="Amount"
                            value={contributionAmount}
                            onChange={(e) => setContributionAmount(e.target.value)}
                            min="0.01"
                            step="0.01"
                            className="contribute-input"
                          />
                          <button
                            className="contribute-submit"
                            onClick={() => handleContribute(item._id)}
                          >
                            Add
                          </button>
                          <button
                            className="contribute-cancel"
                            onClick={() => {
                              setContributionItemId(null);
                              setContributionAmount('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="contribute-btn"
                          onClick={() => setContributionItemId(item._id)}
                        >
                          💰 Contribute
                        </button>
                      )}
                      <div className="remaining-amount">
                        Remaining: {formatCurrency(remaining)}
                      </div>
                    </div>
                  )}

                  {isFullyFunded && (
                    <div className="fully-funded-badge">🎉 Fully Funded!</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary / Suggestions */}
      <div className="savings-plan">
        <h3><span className="section-icon">💡</span> Room Savings Tips</h3>
        <div className="plan-advice">
          <p>
            {stats.totalSaved > 0
              ? `Great progress! You've saved ${formatCurrency(stats.totalSaved)} together.`
              : 'Start contributing to your shared wishes!'}
          </p>
          <ul>
            <li>Each member can contribute any amount towards any wish.</li>
            <li>Contributions are tracked per member.</li>
            <li>Once fully funded, mark the item as purchased and celebrate!</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SharedWishlist;