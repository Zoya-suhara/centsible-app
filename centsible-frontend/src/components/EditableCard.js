import React, { useState } from 'react';
import './EditableCard.css';

function EditableCard({ 
  title, 
  amount,           // remaining (for expense cards) or simple amount
  type = 'income', 
  dueDate = '',
  onEdit,           // kept for backward compatibility
  onUpdate,         // NEW: preferred prop for updates
  onSetReminder,
  currency = 'AED',
  budgeted,         // NEW: only used for expense cards
  spent,            // NEW: only used for expense cards
  cardType          // NEW: 'income', 'savings', 'expense', 'disposable', etc.
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editBudgeted, setEditBudgeted] = useState(budgeted || amount);
  const [editDueDate, setEditDueDate] = useState(dueDate || '1st of month');
  
  const formatCurrency = (amt) => {
    if (amt === null || amt === undefined) return '0.00';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0
      }).format(amt);
    } catch (e) {
      return `${amt} ${currency}`;
    }
  };

  const handleSave = () => {
    // Prefer onUpdate, fallback to onEdit
    const updateFn = onUpdate || onEdit;
    if (updateFn) {
      if (cardType === 'expense') {
        // For expense cards, we pass an object with budgeted and category
        updateFn({ 
          budgeted: parseFloat(editBudgeted) || 0,
          cardType: 'expense',
          category: title.toLowerCase()
        });
      } else {
        // For other cards, just pass the amount
        updateFn(parseFloat(editBudgeted) || 0);
      }
    }
    if (onSetReminder && editDueDate !== dueDate) {
      onSetReminder(editDueDate);
    }
    setIsEditing(false);
  };

  const isExpenseCard = cardType === 'expense';

  return (
    <div className={`editable-card ${type}`}>
      <div className="card-header">
        <h3>{title}</h3>
        <div className="card-actions">
          <button 
            className="edit-btn" 
            onClick={() => {
              // Reset edit values when opening
              setEditBudgeted(budgeted || amount);
              setEditDueDate(dueDate || '1st of month');
              setIsEditing(!isEditing);
            }}
            title="Edit"
          >
            {isEditing ? '✓' : '✏️'}
          </button>
          <button 
            className="reminder-btn" 
            onClick={() => {
              const newDate = prompt('Set reminder date (e.g., "5th of month"):', dueDate || '1st of month');
              if (newDate && onSetReminder) onSetReminder(newDate);
            }}
            title="Set Reminder"
          >
            ⏰
          </button>
        </div>
      </div>
      
      {isEditing ? (
        <div className="edit-mode">
          {isExpenseCard ? (
            <>
              <label className="edit-label">Budgeted Amount</label>
              <input 
                type="number" 
                value={editBudgeted}
                onChange={(e) => setEditBudgeted(e.target.value)}
                placeholder="Budget"
                className="amount-input"
                min="0"
                step="0.01"
              />
            </>
          ) : (
            <input 
              type="number" 
              value={editBudgeted}
              onChange={(e) => setEditBudgeted(e.target.value)}
              placeholder="Amount"
              className="amount-input"
              min="0"
              step="0.01"
            />
          )}
          <input 
            type="text" 
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            placeholder="Due date (e.g., 5th of month)"
            className="date-input"
          />
          <div className="edit-buttons">
            <button onClick={handleSave} className="save-btn">Save</button>
            <button onClick={() => {
              setIsEditing(false);
              setEditBudgeted(budgeted || amount);
              setEditDueDate(dueDate || '1st of month');
            }} className="cancel-btn">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="amount-display">
          {isExpenseCard ? (
            <>
              <div className="budget-detail">
                <span>Budgeted: {formatCurrency(budgeted)}</span>
                <span>Spent: {formatCurrency(spent)}</span>
              </div>
              <div className={`remaining ${amount >= 0 ? 'positive' : 'negative'}`}>
                Remaining: {formatCurrency(amount)}
              </div>
            </>
          ) : (
            <div className="amount">{formatCurrency(amount)}</div>
          )}
          {(dueDate || type === 'expense') && (
            <div className="due-date">📅 Due: {dueDate || 'Not set'}</div>
          )}
          {type === 'income' && dueDate && (
            <div className="next-income">
              Next: {getNextDate(dueDate)}
            </div>
          )}
        </div>
      )}
      
      <div className="card-footer">
        <div className="status-indicator">
          {getPaymentStatus(dueDate, type)}
        </div>
      </div>
    </div>
  );
}

// Helper functions (unchanged)
const getNextDate = (dueDate) => {
  if (!dueDate) return 'Set date';
  try {
    const today = new Date();
    const dayMatch = dueDate.match(/(\d+)(st|nd|rd|th)/);
    if (!dayMatch) return dueDate;
    
    const day = parseInt(dayMatch[1]);
    const nextDate = new Date(today.getFullYear(), today.getMonth(), day);
    
    if (nextDate < today) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    
    return nextDate.toLocaleDateString('en-US', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  } catch (e) {
    return dueDate;
  }
};

const getPaymentStatus = (dueDate, type) => {
  if (!dueDate) return '⚠️ No date set';
  
  try {
    const today = new Date();
    const dayMatch = dueDate.match(/(\d+)(st|nd|rd|th)/);
    if (!dayMatch) return '⚠️ Invalid date';
    
    const day = parseInt(dayMatch[1]);
    const due = new Date(today.getFullYear(), today.getMonth(), day);
    
    if (due < today) {
      due.setMonth(due.getMonth() + 1);
    }
    
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return '❌ Overdue';
    if (diff === 0) return '⚠️ Due today';
    if (diff <= 3) return `⏳ Due in ${diff} days`;
    return '✅ On track';
  } catch (e) {
    return '⚠️ Check date';
  }
};

export default EditableCard;