// Create a new file: conversationStates.js
export const CONVERSATION_STATES = {
  // Initial states
  WELCOME: 'welcome',
  USER_TYPE: 'user_type',
  
  // Income states
  INCOME_SOURCES_COUNT: 'income_sources_count',
  INCOME_SOURCE_AMOUNT: 'income_source_amount',
  INCOME_SOURCE_FREQUENCY: 'income_source_frequency',
  INCOME_SOURCE_PAYDAY: 'income_source_payday',
  INCOME_SOURCE_RECEIVED: 'income_source_received',
  
  // Expense states
  EXPENSE_CATEGORIES: 'expense_categories',
  EXPENSE_AMOUNT: 'expense_amount',
  EXPENSE_DUE_DATE: 'expense_due_date',
  EXPENSE_RECURRING: 'expense_recurring',
  
  // Savings states
  SAVINGS_GOAL: 'savings_goal',
  SAVINGS_PRIORITY: 'savings_priority',
  SAVINGS_AUTOMATION: 'savings_automation',
  
  // Wishlist states
  WISHLIST_ITEMS: 'wishlist_items',
  WISHLIST_PRIORITY: 'wishlist_priority',
  
  // Summary states
  CALCULATION_PREVIEW: 'calculation_preview',
  FINAL_SUMMARY: 'final_summary',
  DASHBOARD_SETUP: 'dashboard_setup'
};

// User types with specific questions
export const USER_TYPES = {
  STUDENT: 'student',
  EMPLOYED: 'employed',
  FREELANCER: 'freelancer',
  HOMEMAKER: 'homemaker',
  OTHER: 'other'
};

// Income frequency types
export const INCOME_FREQUENCY = {
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
  BI_WEEKLY: 'bi_weekly',
  FORTNIGHTLY: 'fortnightly',
  IRREGULAR: 'irregular',
  COMMISSION: 'commission',
  ALLOWANCE: 'allowance',
  PROJECT_BASED: 'project_based'
};