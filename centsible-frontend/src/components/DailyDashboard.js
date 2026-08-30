import React, { useState, useEffect, useRef, useMemo,  useCallback } from 'react';
import './DailyDashboard.css';
import AIConversationWizard from './AIConversationWizard';
import { parseExpense } from '../utils/nlpParser';
import WishlistPromptModal from './WishlistPromptModal';
import { useAuth } from '../context/AuthContext';

function DailyDashboard({ 
  userData, 
  transactions, 
  onAddTransaction, 
  onAddWishlist,
  onEditRecord,
  onEditTransaction,    
  onDeleteTransaction,
  onAskAI, 
  onGoToDashboard,
  formatCurrency,
  onAddSavingsTransaction
}) {
  const { wishlist, updateWishlistItem } = useAuth();
  const [quickInput, setQuickInput] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [aiMode, setAiMode] = useState('mini'); // 'mini', 'full', 'hidden'
  const [dailyInsights, setDailyInsights] = useState('')
  const recognitionRef = useRef(null);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const [showWishlistPrompt, setShowWishlistPrompt] = useState(false);

// Debug: Log whenever transactions change
useEffect(() => {
  console.log('📊 DailyDashboard received updated transactions:', transactions.length);
  setLastUpdate(Date.now());
}, [transactions]);

useEffect(() => {
  console.log('📦 DailyDashboard userData updated:', userData);
}, [userData]);


// Helper: get local date string YYYY-MM-DD from any date input
const getLocalDateString = (dateInput) => {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  // If date is invalid, return empty string
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};


    // Initialize voice recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      console.warn('Speech recognition not supported');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('🎤 Voice recognition started');
      setVoiceListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      console.log('🎤 Recognized:', transcript);
      setQuickInput(transcript);
    };

    recognition.onerror = (event) => {
      console.error('🎤 Recognition error:', event.error);
      setVoiceListening(false);
      if (event.error === 'not-allowed') {
        alert('Microphone access is required for voice input. Please allow microphone permissions.');
      }
    };

    recognition.onend = () => {
      console.log('🎤 Voice recognition ended');
      setVoiceListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);
  
  
  // Generate daily insights
  const generateDailyInsights = useCallback(() => {
  const todayStr = getLocalDateString(new Date());
  const todayTx = transactions.filter(t => getLocalDateString(t.date) === todayStr);
  const spent = todayTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + (t.amount || 0), 0);

  const weekDay = new Date().getDay();
  const isWeekend = weekDay === 0 || weekDay === 6;

  let insights = [];

  if (spent > 0) {
    insights.push(`💰 You've spent ${formatCurrency(spent)} today`);
        const totalIncomeForInsight = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpensesForInsight = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const dynDispForInsight = totalIncomeForInsight - totalExpensesForInsight;
    if (spent > dynDispForInsight / 30) {
      insights.push(`⚠️ Today's spending is above daily average`);
    } else {
      insights.push(`✅ Today's spending is within healthy range`);
    }
  } else {
    insights.push(`🎉 No spending recorded today - great job!`);
  }

  if (isWeekend) {
    insights.push(`🎯 Weekend tip: Budget for leisure activities`);
  } else {
    insights.push(`💼 Weekday tip: Pack lunch to save money`);
  }

  const hour = new Date().getHours();
  if (hour >= 17) {
    insights.push(`🌙 Evening reminder: Log any receipts before sleeping`);
  } else if (hour >= 12) {
    insights.push(`☀️ Afternoon check: Review your spending so far`);
  } else {
    insights.push(`🌅 Morning check: Set your financial intention for the day`);
  }

  setDailyInsights(insights.join('. '));
}, [transactions, userData, formatCurrency]);

useEffect(() => {
  generateDailyInsights();
}, [generateDailyInsights]);

    const startVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice input not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (voiceListening) {
      console.log('Already listening, stopping first...');
      recognitionRef.current.stop();
      setVoiceListening(false);
      return;
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      setVoiceListening(false);
      if (error.message && error.message.includes('already started')) {
        setVoiceListening(true);
      }
    }
  };

    // Handle corrections: "actually the bag was 15", "not 30, 20", etc.
  const handleCorrection = (command) => {
    const lower = command.toLowerCase();
    
    // Try to find a correction pattern
         const patterns = [
      // "actually the bag was 20" / "actually the bag is 20"
      /actually (?:the )?(.+?) (?:was|is) (\d+(?:\.\d+)?)/i,
      // "not 30, 20" / "not 30 it's 20"
      /(?:no|not) (\d+).*?(\d+)/i,
      // "change bag to 15"
      /change (?:the )?(.+?) to (\d+(?:\.\d+)?)/i,
      // "meant 20"
      /meant (\d+)/i,
      // "should be 20"
      /should be (\d+)/i,
      // "was not X it was Y"
      /was not (\d+).*?it was (\d+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = command.match(pattern);
      if (match) {
        let newAmount = parseFloat(match[2] || match[1]);
        if (!isNaN(newAmount) && todayTransactions.length > 0) {
          const lastTx = todayTransactions[0];
          if (lastTx && onEditTransaction) {
            onEditTransaction(lastTx.id, { amount: newAmount });
            alert(`✅ Updated ${lastTx.description || 'item'} to ${formatCurrency(newAmount)}`);
            return true;
          }
        }
      }
    }
    return false;
  };

    // Helper: convert written numbers to digits (basic)
  const wordToNumber = (text) => {
    const words = {
      one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
      eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17,
      eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50, sixty:60,
      seventy:70, eighty:80, ninety:90, hundred:100, thousand:1000
    };
    const lower = text.toLowerCase();
    for (const [word, num] of Object.entries(words)) {
      if (lower.includes(word)) return num;
    }
    return null;
  };

  const processExpenseCommand = async (command) => {
    // First check if this is a correction
    if (handleCorrection(command)) {
      return; // Correction handled, don't create new transaction
    }
    
    // Use the robust NLP parser from nlpParser.js
    const parsed = parseExpense(command, transactions);
    
    if (!parsed || !parsed.amount) {
      console.log('❌ Could not parse expense:', command);
      setShowAIWizard(true);
      setAiMode('mini');
      return;
    }
    
    // Map 'food' category to 'dining' (backend enum requirement)
    let category = parsed.category;
    if (category === 'food') category = 'dining';
    
    const transaction = {
      amount: parsed.amount,
      currency: parsed.currency || userData?.currency || 'AED',
      category: category,
      description: parsed.description,
      type: 'expense',
      date: new Date().toISOString(),
      source: 'voice_input'
    };
    
    console.log('📝 Creating expense transaction:', transaction);
    
    if (!onAddTransaction) {
      console.error('❌ onAddTransaction prop is missing!');
      alert('Unable to save transaction. Please refresh the page.');
      return;
    }
    
    try {
      await onAddTransaction(transaction);
      alert(`✅ Expense logged: ${formatCurrency(parsed.amount)} for ${parsed.description}`);
    } catch (error) {
      console.error('Transaction failed:', error);
      alert('Failed to save transaction. Check console.');
    }
  };

  const processIncomeCommand = (command) => {
    const amountMatch = command.match(/\d+(?:\.\d{2})?/);
    const amount = amountMatch ? parseFloat(amountMatch[0]) : null;
    
    let description = command
      .replace(/income|earned|salary|received|got|paid/gi, '')
      .replace(/\d+/g, '')
      .trim();
    
    if (amount) {
      const transaction = {
        amount: amount,
        currency: userData?.currency || 'AED',
        category: 'salary',
        description: description || 'Voice command income',
        type: 'income',
        date: new Date().toISOString(),
        source: 'voice_input'
      };
      
      if (!onAddTransaction) {
        console.error('❌ onAddTransaction prop is missing!');
        alert('Unable to save transaction. Please refresh the page.');
        return;
      }
      
      onAddTransaction(transaction);
      alert(`✅ Income logged: ${formatCurrency(amount)} from ${description || 'source'}`);
    } else {
      setQuickInput(`Income ${command}`);
      setShowAIWizard(true);
      setAiMode('mini');
    }
  };

  const processVoiceCommand = (command) => {
    command = command.toLowerCase();
    
    // Pre-fill the input with the command (so wizard can process it)
    setQuickInput(command);
    
    // Open AI wizard for complex commands
    if (command.includes('help') || command.includes('advice') || command.includes('should i')) {
      setShowAIWizard(true);
      setAiMode('full');
    } else if (command.includes('spent') || command.includes('bought') || command.includes('paid')) {
      // Quick expense logging
      processExpenseCommand(command);
    } else if (command.includes('income') || command.includes('earned') || command.includes('salary')) {
      // Quick income logging
      processIncomeCommand(command);
    } else if (command.includes('balance') || command.includes('how much')) {
      // Quick balance check
      showQuickBalance();
    } else {
      // Default to AI wizard
      setShowAIWizard(true);
      setAiMode('full');
    }
  };

    const showQuickBalance = () => {
    const availableToday = dynamicDisposable - todaySpending;
    
    alert(`💰 Today's Financial Snapshot:
    
    Available this month: ${formatCurrency(dynamicDisposable)}
    Spent today: ${formatCurrency(todaySpending)}
    Remaining today: ${formatCurrency(availableToday)}
    
    ${availableToday > 0 ? '✅ You have budget left for today!' : '⚠️ You\'ve exceeded today\'s budget'}`);
  };

  const detectCategoryFromCommand = (command) => {
  command = command.toLowerCase();
  
  if (command.includes('food') || command.includes('lunch') || command.includes('dinner') || command.includes('coffee') || command.includes('restaurant') || command.includes('icecream')) {
    return 'dining';       // ✅ Valid backend category
  } else if (command.includes('groceries') || command.includes('supermarket')) {
    return 'groceries';    // ✅ Correct mapping
  } else if (command.includes('transport') || command.includes('taxi') || command.includes('uber') || command.includes('petrol') || command.includes('fuel')) {
    return 'transportation';
  } else if (command.includes('shopping') || command.includes('clothes') || command.includes('shoes') || command.includes('buy')) {
    return 'shopping';
  } else if (command.includes('entertainment') || command.includes('movie') || command.includes('netflix') || command.includes('game')) {
    return 'entertainment';
  } else {
    return 'other';
  }
};

  // Calculate today's date string once
const todayStr = getLocalDateString(new Date());

// Memoized today's transactions
const todayTransactions = useMemo(() => {
  return transactions.filter(t => getLocalDateString(t.date) === todayStr);
}, [transactions, lastUpdate]);

// Memoized spending and income
const todaySpending = useMemo(() => {
  return todayTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}, [todayTransactions]);

const todayIncome = useMemo(() => {
  return todayTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}, [todayTransactions]);

// Dynamic disposable income based on actual transactions
 const dynamicDisposable = useMemo(() => {
  const totalIncome = transactions
    .filter(t => t.type === 'income' && t.category !== 'savings_withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalBudgeted = userData?.expenses 
    ? Object.values(userData.expenses).reduce((sum, amt) => sum + (amt || 0), 0)
    : 0;
  const wishlistSavings = transactions
    .filter(t => t.type === 'expense' && t.category === 'savings')
    .reduce((sum, t) => sum + t.amount, 0);
  const wishlistWithdrawals = transactions
    .filter(t => t.type === 'income' && t.category === 'savings_withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);
  const netWishlistAllocated = wishlistSavings - wishlistWithdrawals;
  return totalIncome - totalBudgeted - netWishlistAllocated;
}, [transactions, userData?.expenses]);

// Daily budget based on dynamic disposable
const dynamicDailyBudget = useMemo(() => {
  return dynamicDisposable / 30;
}, [dynamicDisposable]);

const checkAndShowWishlistPrompt = useCallback(() => {
  if (dynamicDisposable > 0) {
    const hasUnfunded = wishlist?.some(item => 
      (item.savedAmount || 0) < (item.estimatedPrice || item.price || 0)
    );
    if (hasUnfunded) {
      setShowWishlistPrompt(true);
    }
  }
}, [dynamicDisposable, wishlist]);

    const handleQuickSubmit = () => {
    if (!quickInput.trim()) return;
    
    console.log('🔘 handleQuickSubmit:', quickInput);
    
    const hasNumber = /\d/.test(quickInput) || 
                      /one|two|three|four|five|six|seven|eight|nine|ten/i.test(quickInput);
    const isQuestion = quickInput.includes('?') || 
                       /^(how|what|when|where|why|can you|help|advice)/i.test(quickInput);
    
    if (isQuestion || quickInput.length > 50) {
      setShowAIWizard(true);
      setAiMode('full');
    } else if (hasNumber) {
      processVoiceCommand(quickInput);
      setQuickInput('');
    } else {
      // No number detected – open wizard for wishlist or clarification
      setShowAIWizard(true);
      setAiMode('full');
    }
  };



  // Get upcoming reminders
  const getUpcomingReminders = () => {
    const reminders = [];
    
    // Check for recurring bills
    const todayDate = new Date().getDate();
    
    if (userData?.expenses?.rent) {
      if (todayDate === 28 || todayDate === 29 || todayDate === 30 || todayDate === 31 || todayDate === 1) {
        reminders.push('🏠 Rent due in a few days');
      }
    }
    
    if (userData?.expenses?.utilities) {
      if (todayDate === 10 || todayDate === 11 || todayDate === 12 || todayDate === 13) {
        reminders.push('⚡ Utilities due soon');
      }
    }
    
    // Add generic reminders
    if (reminders.length === 0) {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0) { // Sunday
        reminders.push('📅 Plan your week ahead');
      } else if (dayOfWeek === 5) { // Friday
        reminders.push('💰 Review weekly spending');
      }
    }
    
    return reminders.slice(0, 3);
  };

  // Get category breakdown for today
  const getTodayCategoryBreakdown = () => {
    const categories = {};
    
    todayTransactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        const category = t.category || 'other';
        categories[category] = (categories[category] || 0) + (t.amount || 0);
      });
    
    return Object.entries(categories)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: (amount / todaySpending) * 100
      }))
      .sort((a, b) => b.amount - a.amount);
  };

  const handleAIWizardClose = () => {
    setShowAIWizard(false);
    setAiMode('mini');
  };

  // Mini AI Assistant Component
  const MiniAI = () => (
    <div className="mini-ai-assistant">
      <div className="mini-ai-header">
        <span className="ai-icon">🤖</span>
        <h4>AI Assistant</h4>
        <button 
          className="expand-ai-btn"
          onClick={() => setAiMode('full')}
        >
          ↗
        </button>
      </div>
      
      <div className="mini-ai-suggestions">
        <button 
          className="ai-suggestion-chip"
          onClick={() => {
            setQuickInput("I spent ");
            document.querySelector('.quick-input')?.focus();
          }}
        >
          💸 Log expense
        </button>
        <button 
          className="ai-suggestion-chip"
          onClick={() => {
            setQuickInput("Income ");
            document.querySelector('.quick-input')?.focus();
          }}
        >
          💰 Add income
        </button>
        <button 
          className="ai-suggestion-chip"
          onClick={() => setShowAIWizard(true)}
        >
          📸 Scan receipt
        </button>
        <button 
          className="ai-suggestion-chip"
          onClick={() => {
            setQuickInput("How much can I spend today?");
            setTimeout(handleQuickSubmit, 100);
          }}
        >
          💡 Ask advice
        </button>
      </div>
    </div>
  );

  return (
    <div className="daily-dashboard">
      {/* Welcome Header */}
      <div className="welcome-header">
        <div className="welcome-text">
          <h2>Good {getTimeOfDay()}! 👋</h2>
          <p>Here's your financial snapshot for today</p>
        </div>
        <div className="ai-toggle">
          <button 
            className={`ai-toggle-btn ${aiMode !== 'hidden' ? 'active' : ''}`}
            onClick={() => setAiMode(aiMode === 'hidden' ? 'mini' : 'hidden')}
          >
            🤖 AI
          </button>
        </div>
      </div>

      {/* Daily Insights */}
      <div className="daily-insights">
        <div className="insights-header">
          <span className="insights-icon">💡</span>
          <h3>Daily Insights</h3>
        </div>
        <p className="insights-text">{dailyInsights}</p>
      </div>

      {/* Quick Input Bar */}
      <div className="quick-input-bar">
        <div className="input-container">
          <button 
  className={`voice-btn ${voiceListening ? 'listening' : ''}`}
  onClick={startVoiceInput}
  type="button"
>
  {voiceListening ? '🎤 Listening...' : '🎤'}
</button>
          
          <input
            type="text"
            placeholder="Type what you bought, ask a question, or upload receipt..."
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleQuickSubmit()}
            className="quick-input"
          />
          
          <button 
            className="send-btn" 
            onClick={handleQuickSubmit}
            disabled={!quickInput.trim()}
          >
            ➤
          </button>
          
          <button 
            className="receipt-btn"
            onClick={() => {
              setShowAIWizard(true);
              setAiMode('full');
            }}
            title="Upload receipt"
          >
            📸
          </button>
        </div>
        
        <div className="quick-examples">
          <span>Try:</span>
          <button onClick={() => setQuickInput("Coffee 15 AED")}>"Coffee 15 AED"</button>
          <button onClick={() => setQuickInput("How much rent?")}>"How much rent?"</button>
          <button onClick={() => setQuickInput("Add iPhone to wishlist")}>"Add iPhone"</button>
        </div>
      </div>

      {/* AI Assistant (Mini Mode) */}
      {aiMode === 'mini' && <MiniAI />}

      {/* Today's Summary */}
      <div className="today-summary">
        <div className="summary-card">
          <div className="summary-icon">💸</div>
          <h3>Today's Spending</h3>
          <div className="amount">{formatCurrency(todaySpending)}</div>
          <div className="subtext">
            {todayTransactions.filter(t => t.type === 'expense').length} {todayTransactions.filter(t => t.type === 'expense').length === 1 ? 'transaction' : 'transactions'}
          </div>
          {getTodayCategoryBreakdown().length > 0 && (
            <div className="category-breakdown">
              {getTodayCategoryBreakdown().slice(0, 2).map(item => (
                <div key={item.category} className="category-item">
                  <span className="category-name">{item.category}</span>
                  <span className="category-amount">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="summary-card">
          <div className="summary-icon">📅</div>
          <h3>Upcoming</h3>
          <div className="reminders-list">
            {getUpcomingReminders().map((reminder, index) => (
              <div key={index} className="reminder">{reminder}</div>
            ))}
            {getUpcomingReminders().length === 0 && (
              <div className="reminder">No urgent reminders</div>
            )}
          </div>
          <button 
            className="set-reminder-btn"
            onClick={() => {
              setQuickInput("Remind me to pay rent on 1st");
              setShowAIWizard(true);
            }}
          >
            + Set reminder
          </button>
        </div>
        
        <div className="summary-card">
  <div className="summary-icon">💳</div>
  <h3>Available</h3>
  <div className="amount">{formatCurrency(dynamicDisposable)}</div>
  <div className="subtext">Disposable income this month</div>
  <div className="daily-budget">
    <span className="budget-label">Daily budget:</span>
    <span className="budget-value">{formatCurrency(dynamicDailyBudget)}</span>
  </div>
</div>

      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
               <button className="quick-action-btn" onClick={() => {
          const amount = prompt("Enter expense amount:");
          if (amount && !isNaN(amount)) {
            const description = prompt("Description (optional):");
            // ✅ INSERT THIS SAFETY CHECK HERE
            if (!onAddTransaction) {
              alert('Transaction service unavailable. Please refresh.');
              return;
            }
            onAddTransaction({
              amount: parseFloat(amount),
              currency: userData?.currency || 'AED',
              category: 'other',
              description: description || 'Quick expense',
              type: 'expense',
              date: new Date().toISOString()
            });
          }
        }}>
          <span>💸</span> Quick Expense
        </button>
                <button className="quick-action-btn" onClick={async () => {
  const amount = prompt("Enter income amount:");
  if (amount && !isNaN(amount)) {
    const description = prompt("Description (optional):");
    if (!onAddTransaction) {
      alert('Transaction service unavailable. Please refresh.');
      return;
    }
    let category = 'salary';
    if (description) {
      const lower = description.toLowerCase();
      if (lower.includes('freelance')) category = 'freelance';
      else if (lower.includes('gift')) category = 'gift';
      else if (lower.includes('investment')) category = 'investment';
    }
    await onAddTransaction({
      amount: parseFloat(amount),
      currency: userData?.currency || 'AED',
      category: category,
      description: description || 'Quick income',
      type: 'income',
      date: new Date().toISOString()
    });
    checkAndShowWishlistPrompt(); // ✅ ADD THIS LINE
  }
}}>
  <span>💰</span> Quick Income
</button>
        <button className="quick-action-btn" onClick={() => setShowAIWizard(true)}>
          <span>🤖</span> AI Assistant
        </button>
        <button className="quick-action-btn" onClick={onGoToDashboard}>
          <span>📊</span> Full Dashboard
        </button>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        <div className="activity-header">
          <h3>📋 Today's Activity</h3>
          <span className="activity-count">{todayTransactions.length} items</span>
        </div>
        <div className="activity-list">
          {todayTransactions.length > 0 ? (
            todayTransactions.map(transaction => (
              <div key={transaction.id} className="activity-item">
                <div className="activity-icon">
                   {transaction.category === 'savings_withdrawal' ? '↩️' : 
                  transaction.type === 'income' ? '💰' : '💸'}
                  {transaction.source === 'voice_input' && ' 🎤'}
                  {transaction.source === 'ai_wizard' && ' 🤖'}
                </div>
                <div className="activity-details">
                  <div className="activity-title">
                    {transaction.description || transaction.category}
                    {transaction.category && transaction.category !== 'income' && (
                      <span className="activity-category"> • {transaction.category}</span>
                    )}
                  </div>
                  <div className="activity-time">
                    {new Date(transaction.date).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
                <div className={`activity-amount ${transaction.type}`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {formatCurrency(transaction.amount)}
                </div>
                {/* EDIT AND DELETE BUTTONS */}
                <div className="transaction-actions">
                  <button 
                    className="edit-transaction-btn"
                    onClick={() => {
                     console.log('✏️ Edit clicked – transaction ID:', transaction.id);
                     setEditingTransaction(transaction);
                     setEditAmount(transaction.amount);
                      setEditDescription(transaction.description || transaction.category || '');
                    }}
                    title="Edit transaction"
                  >
                    ✏️
                  </button>
                  <button 
                    className="delete-transaction-btn"
                    onClick={() => {
  console.log('🗑️ Delete clicked – transaction ID:', transaction.id);
  if (window.confirm(`Delete ${transaction.description || transaction.category} for ${formatCurrency(transaction.amount)}?`)) {
    if (onDeleteTransaction) {
      onDeleteTransaction(transaction.id);
    } else {
      console.error('❌ onDeleteTransaction prop is missing!');
    }
  }
}}
                    title="Delete transaction"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-activity">
              <div className="empty-icon">📝</div>
              <p>No transactions today</p>
              <div className="empty-actions">
                <button onClick={() => {
                  setQuickInput("I spent ");
                  document.querySelector('.quick-input')?.focus();
                }}>
                  Add an expense
                </button>
                <button onClick={() => setShowAIWizard(true)}>
                  Use AI Assistant
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Budget Progress */}
      <div className="budget-progress">
        <div className="progress-header">
          <h3>🎯 Monthly Budget Progress</h3>
          <button 
            className="ai-advice-btn"
            onClick={() => {
              setQuickInput("How can I improve my budget?");
              setTimeout(() => setShowAIWizard(true), 100);
            }}
          >
            Get AI Advice
          </button>
        </div>
        <div className="progress-bars">
          <div className="progress-item">
            <div className="progress-label">Income</div>
            <div className="progress-bar">
              <div 
                className="progress-fill income" 
                style={{ width: '100%' }}
              ></div>
            </div>
            <div className="progress-amount">{formatCurrency(userData?.income || 0)}</div>
          </div>
          
          <div className="progress-item">
            <div className="progress-label">Expenses</div>
            <div className="progress-bar">
              <div 
                className="progress-fill expense" 
                style={{ 
                  width: userData?.income ? 
                    `${Math.min(100, ((userData?.expenses ? Object.values(userData.expenses).reduce((a, b) => a + b, 0) : 0) / userData.income) * 100)}%` : '0%' 
                }}
              ></div>
            </div>
            <div className="progress-amount">
              {formatCurrency(userData?.expenses ? Object.values(userData.expenses).reduce((a, b) => a + b, 0) : 0)}
            </div>
          </div>
          
          <div className="progress-item">
            <div className="progress-label">Savings Goal</div>
            <div className="progress-bar">
              <div 
                className="progress-fill savings" 
                style={{ 
                  width: userData?.savingsGoal ? 
                    `${Math.min(100, ((userData?.disposableIncome || 0) / userData.savingsGoal) * 100)}%` : '30%' 
                }}
              ></div>
            </div>
            <div className="progress-amount">{formatCurrency(userData?.savingsGoal || 0)}</div>
          </div>
        </div>
      </div>

      {/* AI Wizard Modal */}
      {showAIWizard && (
        <div className="ai-wizard-modal">
          <div className="ai-wizard-overlay" onClick={handleAIWizardClose}></div>
          <div className="ai-wizard-container">
            <div className="ai-wizard-header">
              <h3>🤖 Centsible AI Assistant</h3>
              <button className="close-ai-btn" onClick={handleAIWizardClose}>
                ✕
              </button>
            </div>
                        <div className="ai-wizard-content">
              <AIConversationWizard 
  mode="daily"
  onComplete={handleAIWizardClose}
  onAddTransaction={(transaction) => {
    if (onAddTransaction) {
      onAddTransaction(transaction);
    }
    handleAIWizardClose();
    checkAndShowWishlistPrompt();
  }}
  onAddWishlist={(wishlistItem) => {
    if (onAddWishlist) {
      onAddWishlist(wishlistItem);
    }
    alert(`✅ Added to wishlist: ${wishlistItem.item}`);
    handleAIWizardClose();
  }}
  onEditRecord={(recordId, updates) => {
    // Use onEditTransaction prop from parent (or onEditRecord if both exist)
    if (onEditTransaction) {
      onEditTransaction(recordId, updates);
    } else if (onEditRecord) {
      onEditRecord(recordId, updates);
    }
    handleAIWizardClose();
  }}
  onDeleteTransaction={(transactionId) => {
    if (onDeleteTransaction) {
      onDeleteTransaction(transactionId);
    }
    // Optional: Show feedback or close wizard
  }}
  recentTransactions={transactions.slice(0, 10)}
  userData={userData}
/>
            </div>
          </div>
        </div>
      )}
      
      {/* EDIT TRANSACTION MODAL */}
      {editingTransaction && (
        <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <h3>✏️ Edit Transaction</h3>
              <button className="close-modal-btn" onClick={() => setEditingTransaction(null)}>
                ✕
              </button>
            </div>
            
            <div className="edit-form">
              <div className="form-group">
                <label>Description:</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="e.g., Coffee, Groceries, etc."
                  className="edit-input"
                />
              </div>
              
              <div className="form-group">
                <label>Amount (AED):</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="edit-input"
                />
              </div>
              
              <div className="edit-actions">
                <button 
                  className="save-edit-btn"
                 onClick={() => {
  console.log('💾 Save clicked – ID:', editingTransaction?.id, 'New amount:', editAmount, 'New desc:', editDescription);
  if (onEditTransaction) {
    onEditTransaction(editingTransaction.id, {
      amount: parseFloat(editAmount),
      description: editDescription
    });
  } else {
    console.error('❌ onEditTransaction prop is missing!');
  }
  setEditingTransaction(null);
}}
                >
                  💾 Save Changes
                </button>
                <button 
                  className="cancel-edit-btn"
                  onClick={() => setEditingTransaction(null)}
                >
                  ❌ Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
   {/* WISHLIST PROMPT MODAL */}
      {showWishlistPrompt && (
        <WishlistPromptModal
          availableBalance={dynamicDisposable}
          wishlist={wishlist || []}
          onClose={() => setShowWishlistPrompt(false)}
          onAddFunds={async (itemId, amount) => {
            const item = wishlist.find(i => i.id === itemId);
            if (!item) return;
            
            const newSaved = Math.min(
              (item.savedAmount || 0) + amount,
              item.estimatedPrice || item.price || 0
            );
            
            await updateWishlistItem(itemId, { savedAmount: newSaved });
            
            if (onAddSavingsTransaction && amount > 0) {
              onAddSavingsTransaction(amount, `Saved for ${item.name || item.item}`);
            }
            
            
          }}
          formatCurrency={formatCurrency}
          userCurrency={userData?.currency || 'AED'}
        />
      )}
    </div>
  );
}

// Helper function
const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export default DailyDashboard;