// conversationContext.js
import { v4 as uuidv4 } from 'uuid';

export const createInitialConversationContext = (userData) => ({
  // Core financial data
  userType: '',
  incomeSources: [],
  expenses: [],
  bills: [],
  savings: {
    goal: 0,
    priority: 'medium',
    automation: false,
    percentage: 20
  },
  wishlist: [],
  reminders: [],
  currency: userData?.currency || 'AED',
  
  // Conversation tracking
  conversationState: 'welcome',
  contextMemory: {
    currentTopic: null,
    pendingQuestions: [],
    answeredQuestions: [],
    dataToConfirm: {},
    nextAction: null
  },
  
  // Multi-step tracking
  multiStep: {
    currentIncomeIndex: 0,
    totalIncomeSources: 0,
    currentExpenseIndex: 0,
    totalExpenseCategories: 5, // Default categories
    awaitingConfirmation: false,
    confirmationData: null
  },
  
  // User preferences
  preferences: {
    notificationFrequency: 'weekly',
    currencyFormat: 'AED',
    dateFormat: 'DD/MM/YYYY',
    savingsStrategy: 'percentage'
  }
});

// Helper to create income source
export const createIncomeSource = (data) => ({
  id: uuidv4(),
  source: data.source || 'Job',
  amount: data.amount || 0,
  currency: data.currency || 'AED',
  frequency: data.frequency || 'monthly',
  payDays: data.payDays || [], // Array of specific pay dates
  nextPayDate: data.nextPayDate || null,
  receivedThisCycle: data.receivedThisCycle || false,
  notes: data.notes || '',
  isPrimary: data.isPrimary || false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// Helper to create expense
export const createExpense = (data) => ({
  id: uuidv4(),
  category: data.category || 'other',
  subcategory: data.subcategory || '',
  amount: data.amount || 0,
  currency: data.currency || 'AED',
  dueDate: data.dueDate || null, // Specific due date
  recurrence: data.recurrence || 'monthly',
  isPaid: data.isPaid || false,
  isEssential: data.isEssential || true,
  notes: data.notes || '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});