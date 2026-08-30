import React, { useState, useEffect, useRef } from 'react';
import './AIConversationWizard.css';
import { getPriceInfo } from '../utils/priceDatabase';
import Tesseract from 'tesseract.js';
import { autoCategorizeExpense } from '../utils/autoCategorize';
import { parseExpense, parseFinancialAmount } from '../utils/nlpParser';

// Conversation states
const CONVERSATION_STATES = {
  WELCOME: 'welcome',
  USER_TYPE: 'user_type',
  EMPLOYED_JOB_COUNT: 'employed_job_count',
  EMPLOYED_JOB_AMOUNT: 'employed_job_amount',
  EMPLOYED_JOB_FREQUENCY: 'employed_job_frequency',
  EMPLOYED_JOB_PAYDAY: 'employed_job_payday',
  EMPLOYED_JOB_RECEIVED: 'employed_job_received',
  STUDENT_INCOME_DETAILS: 'student_income_details',
  FREELANCE_INCOME_TYPE: 'freelance_income_type',
  RENT_EXPENSES: 'rent_expenses',
  FOOD_EXPENSES: 'food_expenses',
  TRANSPORT_EXPENSES: 'transport_expenses',
  OTHER_EXPENSES: 'other_expenses',
  SAVINGS_GOAL: 'savings_goal',
  SAVINGS_CONFIRMATION: 'savings_confirmation',
  WISHLIST_SETUP: 'wishlist_setup',
  SUMMARY: 'summary',
  HOUSEHOLD_BUDGET: 'household_budget'

};

// Income frequency types
const INCOME_FREQUENCY = {
  MONTHLY: 'monthly',
  WEEKLY: 'weekly',
  BI_WEEKLY: 'bi_weekly',
  DAILY: 'daily',
  YEARLY: 'yearly',
  COMMISSION: 'commission',
  ALLOWANCE: 'allowance',
  PROJECT_BASED: 'project_based',
  IRREGULAR: 'irregular'
};

// ========== FUZZY MATCHING & SYNONYMS ==========
const matchesAny = (text, keywords) => {
  if (!text || !keywords) return false;
  const lower = text.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
};

// Synonym sets for user types (expanded to catch natural phrases)
const USER_TYPE_SYNONYMS = {
  student: [
    'student', 'college', 'university', 'uni', 'school', 'study',
    'allowance', 'part-time', 'part time', 'campus'
  ],
  employed: [
    'employ', 'employee', 'job', 'salary', 'work', '9-5', 'full time', 'part time',
    'office', 'corporate', 'company', 'monthly salary', 'regular income',
    'paycheck', 'pay check', 'wage', 'career', 'position', 'staff'
  ],
  freelancer: [
    'freelance', 'freelancer', 'gig', 'self employed', 'self-employed',
    'contract', 'project', 'client', 'variable', 'commission', 'hourly',
    'consultant', 'independent', 'my own boss', 'side hustle'
  ],
  homemaker: [
    'home', 'house', 'household', 'family', 'stay at home', 'homemaker',
    'manage household', 'housewife', 'househusband', 'domestic'
  ]
};

// Intent detection: returns the most likely user type based on message
const detectUserTypeFromMessage = (message) => {
  const lower = message.toLowerCase();
  let bestMatch = null;
  let maxScore = 0;

  for (const [type, synonyms] of Object.entries(USER_TYPE_SYNONYMS)) {
    const score = synonyms.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
    if (score > maxScore) {
      maxScore = score;
      bestMatch = type;
    }
  }

  return maxScore > 0 ? bestMatch : null;
};



function AIConversationWizard({
  mode = 'onboarding',        // 'onboarding' or 'daily'
  onComplete,
  onAddTransaction,
  onAddWishlist,
  onEditRecord,
  onDeleteTransaction = () => {},
  userData = null,
  recentTransactions = []     // used for corrections in daily mode
}) {
  // Main state
  const [conversation, setConversation] = useState([]);
  const [userInput, setUserInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [welcomeComplete, setWelcomeComplete] = useState(false);
  const [selectedSituation, setSelectedSituation] = useState(null);
  const [customSituation, setCustomSituation] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
  const [lastTransactions, setLastTransactions] = useState([]);
  const [conversationEnded, setConversationEnded] = useState(false);
  const completeTimeoutRef = useRef(null);

  

    // Function to detect if user is correcting a previous entry
  const detectAndApplyCorrection = (message, currentTransactions = [], recentTransactionsList = []) => {
    const lowerMsg = message.toLowerCase();
    
    const correctionPatterns = [
      /actually (?:it )?was (\d+(?:\.\d+)?)/i,
      /correction:?\s*(\d+(?:\.\d+)?)/i,
      /i meant (\d+(?:\.\d+)?)/i,
      /(?:the|that) (\w+) was (\d+(?:\.\d+)?)/i,
      /change (?:the )?(\w+) to (\d+(?:\.\d+)?)/i,
      /(?:update|fix) (?:the )?(\w+) to (\d+(?:\.\d+)?)/i,
      /(?:should be|was supposed to be) (\d+(?:\.\d+)?)/i,
      /no (?:it was|it's) (\d+(?:\.\d+)?)/i,
      /correct (?:it to|:?) (\d+(?:\.\d+)?)/i
    ];
    
    for (const pattern of correctionPatterns) {
      const match = message.match(pattern);
      if (match) {
        let newAmount = parseFloat(match[1]);
        if (isNaN(newAmount) && match[2]) newAmount = parseFloat(match[2]);
        
        if (!isNaN(newAmount) && newAmount > 0) {
          let transactionToCorrect = null;
          
          const mentionedItem = match[1] && match[2] ? match[1] : (match[0].match(/(?:the|that)\s+(\w+)/i)?.[1] || null);
          
          // Combine all transaction sources
          const allTransactions = [...recentTransactionsList, ...lastTransactions, ...currentTransactions];
          
          if (mentionedItem) {
            transactionToCorrect = allTransactions.find(t => 
              t.description?.toLowerCase().includes(mentionedItem.toLowerCase()) ||
              t.category?.toLowerCase().includes(mentionedItem.toLowerCase())
            );
          }
          
          if (!transactionToCorrect && allTransactions.length > 0) {
            transactionToCorrect = allTransactions[0];
          }
          
          if (transactionToCorrect && onEditRecord) {
            const oldAmount = transactionToCorrect.amount;
             const recordId = transactionToCorrect.id || transactionToCorrect._id;
             onEditRecord(recordId, { 
              amount: newAmount,
              description: transactionToCorrect.description,
              lastCorrected: new Date().toISOString()
            });
            
            return {
              corrected: true,
              transaction: transactionToCorrect,
              oldAmount: oldAmount,
              newAmount: newAmount,
              response: `✅ **Corrected!** I've updated the ${transactionToCorrect.description || transactionToCorrect.category} from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}.`
            };
          }
        }
        break;
      }
    }
    
    // Pattern 2: "not X, it's Y" (e.g., "not 200, it's 150")
const notPattern = /not (\d+(?:\.\d+)?).*?(?:it'?s|actually|was) (\d+(?:\.\d+)?)/i;
const notMatch = message.match(notPattern);
if (notMatch) {
  const newAmount = parseFloat(notMatch[2]);
  const allTransactions = [...recentTransactionsList, ...lastTransactions];
  if (!isNaN(newAmount) && allTransactions.length > 0 && onEditRecord) {
    const transactionToCorrect = allTransactions[0];
    const oldAmount = transactionToCorrect.amount;
    const recordId = transactionToCorrect.id || transactionToCorrect._id; // ✅ FIXED
    onEditRecord(recordId, { amount: newAmount });
    
    return {
      corrected: true,
      transaction: transactionToCorrect,
      oldAmount: oldAmount,
      newAmount: newAmount,
      response: `✅ **Corrected!** I've updated it from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}.`
    };
  }
}
    
    return { corrected: false };
  };

  // Enhanced collected data with conversation context
  const [collectedData, setCollectedData] = useState({
    userType: '',
    income: {
      sources: [],
      total: 0
    },
    expenses: [],
    bills: [],
    goals: [],
    reminders: [],
    wishlist: [],
    savingsGoal: 0,
    currency: userData?.currency || 'AED',
    // Conversation context tracking
    conversationContext: {
      currentIncomeIndex: 0,
      totalJobsToAsk: 0,
      currentJobData: null,
      waitingForJobCount: false,
      currentExpenseIndex: 0,
      tempJobData: null
    }
  });

    const formatCurrency = (amount, currency) => {
    const curr = currency || collectedData.currency || 'AED';
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: curr,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      });
      return formatter.format(amount);
    } catch (e) {
      return `${amount} ${curr}`;
    }
  };
  
  const [conversationStage, setConversationStage] = useState(CONVERSATION_STATES.WELCOME);
  const stageRef = useRef(conversationStage);
  const messagesEndRef = useRef(null);
  const [currentMode, setCurrentMode] = useState('mentor');
  const [showModeSelector, setShowModeSelector] = useState(false);
  const welcomeCompleteRef = useRef(welcomeComplete);

  // Input modes
  const [activeInputTab, setActiveInputTab] = useState('text');
  const [receiptImage, setReceiptImage] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [extractedText, setExtractedText] = useState('');
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // ========== INITIALIZATION ==========
  // Update welcomeCompleteRef when welcomeComplete changes
  useEffect(() => {
    welcomeCompleteRef.current = welcomeComplete;
  }, [welcomeComplete]);

    useEffect(() => {
    stageRef.current = conversationStage;
  }, [conversationStage]);

  useEffect(() => {
  console.log("Initializing speech recognition...");
  
  if (!('webkitSpeechRecognition' in window)) {
    console.log("Web Speech API not available");
    return;
  }

  if (recognitionRef.current) {
    console.log("Recognition already initialized");
    return;
  }

  console.log("Setting up Web Speech API");
  const recognition = new window.webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  
  recognition.onstart = () => {
    console.log("Speech recognition started");
    setIsListening(true);
    setUserInput("🎤 Listening...");
  };
  
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log("Speech recognized:", transcript);
    setUserInput(transcript);
    setIsListening(false);

    if (!isProcessing) {
      setTimeout(() => {
        if (transcript.trim() && (welcomeCompleteRef.current || mode === 'daily')) {
          console.log("Processing voice input");
          handleUserResponse(transcript);
        } else if (transcript.trim()) {
          console.log("Voice input ignored - still in welcome screen");
        }
      }, 300);
    }
  };
  
  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    setIsListening(false);
    setUserInput("");
    if (event.error === 'not-allowed') {
      addAIMessage("⚠️ Microphone access is required for voice input. Please allow permissions.", null, '⚠️');
    }
  };
  
  recognition.onend = () => {
    console.log("Speech recognition ended");
    setIsListening(false);
  };
  
  recognitionRef.current = recognition;
  
  return () => {
    console.log("Cleaning up speech recognition");
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
  };
}, []);



 // Preload Tesseract worker for faster first scan
  useEffect(() => {
    const preloadTesseract = async () => {
      try {
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: () => {} // silent
        });
        await worker.terminate();
        console.log('Tesseract preloaded');
      } catch (e) {
        console.warn('Tesseract preload failed, will load on first scan');
      }
    };
    preloadTesseract();
  }, []);

  // Initialize daily chat immediately when mode is 'daily'
 useEffect(() => {
  if (mode === 'daily' && conversation.length === 0) {
    setConversationStage('daily');   // <-- ADD THIS
    const greeting = "👋 I'm your Centsible assistant! You can tell me things like:\n\n" +
      "💰 'I spent 45 AED on lunch'\n" +
      "💸 'Received salary 5000'\n" +
      "🎯 'Add new phone to wishlist'\n" +
      "🔄 'Actually that lunch was 55'\n" +
      "📊 'How much did I spend on groceries?'\n\n" +
      "What can I help you with?";
    addAIMessage(greeting);
  }
}, [mode, conversation.length]);

  // Initialize chat for onboarding when welcome is complete
  useEffect(() => {
    if (mode === 'onboarding' && welcomeComplete && conversation.length === 0) {
       // Only run if we haven't already set a stage beyond WELCOME
      if (conversationStage !== CONVERSATION_STATES.WELCOME) {
        console.log('Chat already initialized, skipping');
        return;
      }
        console.log("Starting chat with situation:", selectedSituation);
      
      let greeting = "";
      let nextStage = CONVERSATION_STATES.WELCOME;
      
      switch(selectedSituation) {
        case 'student':
          greeting = "🎓 **Great! Let's set up your student finances.**\n\nDo you receive a regular allowance from parents, or do you have part-time income?";
          nextStage = CONVERSATION_STATES.STUDENT_INCOME_DETAILS;
          break;
        case 'employed':
          greeting = "💼 **Perfect! Let's plan your employment income.**\n\n**How many jobs do you have?**\n\nWe'll set up each job separately with:\n• Monthly/Weekly salary\n• Payday tracking\n• Reminders for next payment\n\nJust say the number (like '2 jobs' or 'I work 3 jobs').";
          nextStage = CONVERSATION_STATES.EMPLOYED_JOB_COUNT;
          break;
        case 'freelancer':
          greeting = "🎨 **I understand freelancing!** Your income might vary each month.\n\n**How do you typically get paid?**\n\n• Per project (e.g., 'I charge 1000 per website')\n• Hourly rate (e.g., '50 AED per hour')\n• Monthly retainer (e.g., '2000 monthly for ongoing work')\n• Commission-based (e.g., '10% of sales')\n\nTell me about your main income source:";
          nextStage = CONVERSATION_STATES.FREELANCE_INCOME_TYPE;
          break;
        case 'homemaker':
          greeting = "🏠 **Let's set up your household budget management.**\n\n**What's the total monthly household budget you manage?**\n\nThis includes all income sources for the household.\n\nYou can say: '8000 AED', 'We have 10000 monthly', etc.";
          nextStage = CONVERSATION_STATES.HOUSEHOLD_BUDGET;
          break;
        case 'other':
          greeting = `Let's get started with your financial setup!\n\nYou mentioned: "${customSituation}"\n\nFirst, let's understand your income sources. Do you have any regular income?`;
          nextStage = CONVERSATION_STATES.STUDENT_INCOME_DETAILS;
          break;
        default:
          greeting = "Let's get started with your financial setup! First, tell me about your income sources.";
          nextStage = CONVERSATION_STATES.WELCOME;
      }
      
      const welcomeMessage = {
        role: 'ai',
        message: greeting,
        icon: '🤖'
      };
      
      setConversation([welcomeMessage]);
      setConversationStage(nextStage);
      console.log("Chat initialized with stage:", nextStage);
    }
  }, [mode, welcomeComplete, selectedSituation, customSituation, conversation.length]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  // ========== WELCOME SCREEN HANDLERS ==========
  const handleSituationSelect = (situation) => {
    setSelectedSituation(situation);
  };

  const handleStartSetup = () => {
    if (selectedSituation === 'other' && !customSituation.trim()) {
      setErrorMessage("Please describe your financial situation first!");
      
      setTimeout(() => {
        setErrorMessage(null);
      }, 3000);
      
      return;
    }
    
    setIsTransitioning(true);
    
    // Store the selected situation in collectedData
    const finalSituation = selectedSituation === 'other' ? customSituation : selectedSituation;
    
    setCollectedData(prev => ({
      ...prev,
      userType: finalSituation
    }));
    
    // Update the ref
    welcomeCompleteRef.current = true;
    
    // Add a slight delay for smoother transition
    setTimeout(() => {
      setWelcomeComplete(true);
      setIsTransitioning(false);
    }, 300);
  };

  // ========== HELPER FUNCTIONS ==========
  const generateWelcomeMessage = () => {
    return `👋 **Welcome to Centsible Financial Setup!**\n\nI'm your AI financial mentor. Let me show you what I can do:\n\n` +
           `💰 **Track multiple income sources** (jobs, allowances, commissions)\n` +
           `📅 **Set up payday reminders** so you never miss income\n` +
           `🏠 **Manage all your expenses** with due date tracking\n` +
           `🎯 **Set savings goals** and track progress\n` +
           `📱 **Update your dashboard in real-time**\n\n` +
           `Let's start with your financial situation. **What best describes you?**\n\n` +
           `🎓 **Student** - Getting allowance/part-time\n` +
           `💼 **Employed** - Regular salary job(s)\n` +
           `🎨 **Freelancer** - Variable/commission income\n` +
           `🏠 **Homemaker** - Managing household budget\n` +
           `🔄 **Other** - Tell me about your situation`;
  };

  const extractAmountAndCurrency = (message) => {
    const lowerMsg = message.toLowerCase();
    
    const currencyMatches = lowerMsg.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(aed|usd|eur|gbp|inr|cad|aud|₹|\$|€|£)/i);
    
    if (currencyMatches) {
      const amount = parseFloat(currencyMatches[1].replace(/,/g, ''));
      let currency = currencyMatches[2].toUpperCase();
      
      const symbolMap = {
        '$': 'USD',
        '€': 'EUR',
        '£': 'GBP',
        '₹': 'INR'
      };
      
      return { 
        amount, 
        currency: symbolMap[currency] || currency 
      };
    }
    
    const numberMatches = message.match(/\d+(?:,\d{3})*(?:\.\d{2})?/g);
    if (numberMatches && numberMatches.length > 0) {
      return { 
        amount: parseFloat(numberMatches[0].replace(/,/g, '')), 
        currency: collectedData.currency || 'AED'
      };
    }
    
    return { amount: null, currency: null };
  };

  const extractNumbers = (message) => {
    return message.match(/\d+/g)?.map(n => parseInt(n)) || [];
  };

  
  // ========== ENHANCED NLP PARSERS ==========
  const detectFrequency = (message) => {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('month') || lowerMsg.includes('monthly')) return INCOME_FREQUENCY.MONTHLY;
    if (lowerMsg.includes('week') || lowerMsg.includes('weekly')) return INCOME_FREQUENCY.WEEKLY;
    if (lowerMsg.includes('bi-week') || lowerMsg.includes('every 2 week') || lowerMsg.includes('fortnight')) return INCOME_FREQUENCY.BI_WEEKLY;
    if (lowerMsg.includes('day') || lowerMsg.includes('daily')) return INCOME_FREQUENCY.DAILY;
    if (lowerMsg.includes('year') || lowerMsg.includes('annual')) return INCOME_FREQUENCY.YEARLY;
    if (lowerMsg.includes('commission')) return INCOME_FREQUENCY.COMMISSION;
    if (lowerMsg.includes('allowance')) return INCOME_FREQUENCY.ALLOWANCE;
    if (lowerMsg.includes('project') || lowerMsg.includes('gig')) return INCOME_FREQUENCY.PROJECT_BASED;
    if (lowerMsg.includes('irregular') || lowerMsg.includes('not regular') || lowerMsg.includes('varies')) return INCOME_FREQUENCY.IRREGULAR;
    
    return null;
  };

  const extractPaydayInfo = (message) => {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('today') || lowerMsg.includes('just got paid') || lowerMsg.includes('i received')) {
      return {
        text: 'Today',
        date: new Date().toISOString().split('T')[0],
        isPast: true
      };
    }
    if (lowerMsg.includes('friday')) return { text: 'Friday', isPast: false };
    if (lowerMsg.includes('end of month')) return { text: 'End of month', isPast: false };
    if (lowerMsg.includes('1st') || lowerMsg.includes('first')) return { text: '1st of month', isPast: false };
    if (lowerMsg.includes('15th') || lowerMsg.includes('15')) return { text: '15th of month', isPast: false };
    if (lowerMsg.includes('next week')) return { text: 'Next week', isPast: false };
    if (lowerMsg.includes('next month')) return { text: 'Next month', isPast: false };
    
    // Try to extract any date pattern
    const datePatterns = [
      /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/,
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
      /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        return {
          text: match[0],
          date: match[0],
          isPast: false
        };
      }
    }
    
    return { text: 'Not specified', isPast: false };
  };

  const extractDueDateInfo = (message) => {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('1st') || lowerMsg.includes('first')) return { text: '1st of month' };
    if (lowerMsg.includes('5th') || lowerMsg.includes('5')) return { text: '5th of month' };
    if (lowerMsg.includes('end of month')) return { text: 'End of month' };
    if (lowerMsg.includes('weekly')) return { text: 'Weekly' };
    if (lowerMsg.includes('monthly')) return { text: 'Monthly' };
    
    return { text: 'Monthly' };
  };

  // ========== MAIN CONVERSATION FLOW ==========
  const generateWizardResponse = (userMessage, currentStage) => {
    const numbers = extractNumbers(userMessage);
    const { amount, currency } = extractAmountAndCurrency(userMessage);
    const curr = currency || collectedData.currency || 'AED';
    const lowerMsg = userMessage.toLowerCase();
    
    let nextStage = currentStage;
    let response = '';
    
    console.log(`🎯 Current stage: ${currentStage}, Context:`, collectedData.conversationContext);

    switch (currentStage) {
      case CONVERSATION_STATES.WELCOME:
        response = `🎉 **Great! Let's set up your financial dashboard.**\n\n` +
                  `**First, tell me about yourself:**\n\n` +
                  `🎓 **Student** - Getting allowance/part-time\n` +
                  `💼 **Employed** - Regular salary job(s)\n` +
                  `🎨 **Freelancer** - Variable/commission income\n` +
                  `🏠 **Homemaker** - Managing household budget\n` +
                  `🔄 **Other** - Tell me about your situation\n\n` +
                  `**Which one sounds like you?**`;
        nextStage = CONVERSATION_STATES.USER_TYPE;
        break;
        
           case CONVERSATION_STATES.USER_TYPE: {
        const detected = detectUserTypeFromMessage(userMessage);
        let userType = detected;

        // If no strong match, fall back to keyword hints (for backward compatibility)
        if (!userType) {
          if (matchesAny(lowerMsg, USER_TYPE_SYNONYMS.student)) userType = 'student';
          else if (matchesAny(lowerMsg, USER_TYPE_SYNONYMS.employed)) userType = 'employed';
          else if (matchesAny(lowerMsg, USER_TYPE_SYNONYMS.freelancer)) userType = 'freelancer';
          else if (matchesAny(lowerMsg, USER_TYPE_SYNONYMS.homemaker)) userType = 'homemaker';
        }

        if (userType === 'student') {
          setCollectedData(prev => ({ 
            ...prev, 
            userType: 'student',
            conversationContext: { 
              ...prev.conversationContext, 
              currentIncomeIndex: 0,
              waitingForJobCount: false
            }
          }));
          response = `🎓 **Great! Let's set up your student finances.**\n\n` +
                    `Do you receive a regular allowance from parents, or do you have part-time income?\n\n` +
                    `You can say:\n` +
                    `• "I get 500 AED allowance monthly"\n` +
                    `• "I work part-time, around 1000 per month"\n` +
                    `• "No regular income, just occasional gifts"\n` +
                    `• "I have multiple sources of income"`;
          nextStage = CONVERSATION_STATES.STUDENT_INCOME_DETAILS;
        } 
        else if (userType === 'employed') {
          setCollectedData(prev => ({ 
            ...prev, 
            userType: 'employed',
            conversationContext: { 
              ...prev.conversationContext, 
              currentIncomeIndex: 0,
              totalJobsToAsk: 0,
              waitingForJobCount: true 
            }
          }));
          response = `💼 **Perfect! Let's plan your employment income.**\n\n` +
                    `**How many jobs do you have?**\n\n` +
                    `We'll set up each job separately with:\n` +
                    `• Monthly/Weekly salary\n` +
                    `• Payday tracking\n` +
                    `• Reminders for next payment\n\n` +
                    `Just say the number (like "2 jobs" or "I work 3 jobs").`;
          nextStage = CONVERSATION_STATES.EMPLOYED_JOB_COUNT;
        }
        else if (userType === 'freelancer') {
          setCollectedData(prev => ({ 
            ...prev, 
            userType: 'freelancer',
            conversationContext: { 
              ...prev.conversationContext, 
              currentIncomeIndex: 0,
              waitingForJobCount: false
            }
          }));
          response = `🎨 **I understand freelancing!** Your income might vary each month.\n\n` +
                    `**How do you typically get paid?**\n\n` +
                    `• Per project (e.g., "I charge 1000 per website")\n` +
                    `• Hourly rate (e.g., "50 AED per hour")\n` +
                    `• Monthly retainer (e.g., "2000 monthly for ongoing work")\n` +
                    `• Commission-based (e.g., "10% of sales")\n\n` +
                    `Tell me about your main income source:`;
          nextStage = CONVERSATION_STATES.FREELANCE_INCOME_TYPE;
        }
        else if (userType === 'homemaker') {
          setCollectedData(prev => ({ 
            ...prev, 
            userType: 'homemaker',
            conversationContext: { 
              ...prev.conversationContext, 
              currentIncomeIndex: 0,
              waitingForJobCount: false
            }
          }));
          response = `🏠 **Let's set up your household budget management.**\n\n` +
                    `**What's the total monthly household budget you manage?**\n\n` +
                    `This includes all income sources for the household.\n\n` +
                    `You can say: "8000 AED", "We have 10000 monthly", etc.`;
          nextStage = CONVERSATION_STATES.HOUSEHOLD_BUDGET;
        }
        else {
          // Still not understood – give a clearer prompt and stay in same stage
          response = `I want to help you set up your finances! Could you tell me more about your situation?\n\n` +
                    `For example:\n` +
                    `• "I'm a student"\n` +
                    `• "I have a job with monthly salary"\n` +
                    `• "I freelance and earn per project"\n` +
                    `• "I manage my household budget"`;
          nextStage = CONVERSATION_STATES.USER_TYPE; // stay here
        }
        break;
      }

      case CONVERSATION_STATES.EMPLOYED_JOB_COUNT:
        let jobCount = 1;
        if (numbers.length > 0) {
          jobCount = numbers[0];
        } else if (lowerMsg.includes('two') || lowerMsg.includes('2')) {
          jobCount = 2;
        } else if (lowerMsg.includes('three') || lowerMsg.includes('3')) {
          jobCount = 3;
        } else if (lowerMsg.includes('four') || lowerMsg.includes('4')) {
          jobCount = 4;
        }
        
        setCollectedData(prev => ({
          ...prev,
          conversationContext: {
            ...prev.conversationContext,
            totalJobsToAsk: jobCount,
            waitingForJobCount: false,
            currentIncomeIndex: 1
          }
        }));
        
        response = `✅ **Got it! ${jobCount} job${jobCount > 1 ? 's' : ''}.**\n\n` +
                  `Let's start with **Job 1**:\n\n` +
                  `**How much do you get paid for this job?**\n\n` +
                  `Examples:\n` +
                  `• "5000 AED per month"\n` +
                  `• "3000 monthly"\n` +
                  `• "I get 2000"\n` +
                  `• "My salary is 7500 AED"`;
        nextStage = CONVERSATION_STATES.EMPLOYED_JOB_AMOUNT;
        break;
        
      case CONVERSATION_STATES.EMPLOYED_JOB_AMOUNT:
        const jobIndex = collectedData.conversationContext.currentIncomeIndex;
        
        if (amount) {
          const tempJobData = {
            amount: amount,
            currency: curr,
            jobNumber: jobIndex,
            source: `Job ${jobIndex}`
          };
          
          setCollectedData(prev => ({
            ...prev,
            conversationContext: {
              ...prev.conversationContext,
              tempJobData: tempJobData
            }
          }));
          
          response = `✅ **${formatCurrency(amount, curr)} saved for Job ${jobIndex}!**\n\n` +
                    `**How often do you get paid for this job?**\n\n` +
                    `Is it:\n` +
                    `• Monthly (once a month)\n` +
                    `• Weekly (every week)\n` +
                    `• Bi-weekly (every 2 weeks)\n` +
                    `• Commission/Project based\n` +
                    `• Other frequency`;
          nextStage = CONVERSATION_STATES.EMPLOYED_JOB_FREQUENCY;
        } else {
          response = `Please tell me the **amount** for Job ${jobIndex}.\n\n` +
                    `Examples:\n` +
                    `• "5000 AED"\n` +
                    `• "My salary is 3000"\n` +
                    `• "I get paid 2000 per month"`;
        }
        break;
        
      case CONVERSATION_STATES.EMPLOYED_JOB_FREQUENCY:
        const frequency = detectFrequency(lowerMsg);
        const currentJobIndex = collectedData.conversationContext.currentIncomeIndex;
        const tempJobData = collectedData.conversationContext.tempJobData;
        
        if (frequency) {
          const updatedJobData = {
            ...tempJobData,
            frequency: frequency
          };
          
          setCollectedData(prev => ({
            ...prev,
            conversationContext: {
              ...prev.conversationContext,
              tempJobData: updatedJobData
            }
          }));
          
          let frequencyQuestion = '';
          if (frequency === INCOME_FREQUENCY.COMMISSION) {
            frequencyQuestion = `**When do you typically receive commission payments?**\n\n` +
                               `After completing a project? End of month?`;
          } else if (frequency === INCOME_FREQUENCY.ALLOWANCE) {
            frequencyQuestion = `**When do you usually get your allowance?**\n\n` +
                               `Beginning of month? Every Friday?`;
          } else {
            frequencyQuestion = `**When is your next payday for this job?**\n\n` +
                               `Examples:\n` +
                               `• "Next Friday"\n` +
                               `• "15th of each month"\n` +
                               `• "End of month"\n` +
                               `• "I just got paid today"`;
          }
          
          response = `✅ **${frequency.replace('_', ' ')} frequency saved!**\n\n` +
                    frequencyQuestion;
          nextStage = CONVERSATION_STATES.EMPLOYED_JOB_PAYDAY;
        } else {
          response = `Please tell me how often you get paid for Job ${currentJobIndex}:\n\n` +
                    `• Monthly (once a month)\n` +
                    `• Weekly (every week)\n` +
                    `• Bi-weekly (every 2 weeks)\n` +
                    `• Commission (when you make a sale)\n` +
                    `• Other (please specify)`;
        }
        break;
        
      case CONVERSATION_STATES.EMPLOYED_JOB_PAYDAY:
        const paydayInfo = extractPaydayInfo(userMessage);
        const currentJobIdx = collectedData.conversationContext.currentIncomeIndex;
        const jobTempData = collectedData.conversationContext.tempJobData;
        
        const jobDataWithPayday = {
          ...jobTempData,
          payday: paydayInfo.text,
          nextPayDate: paydayInfo.date,
          isPastPayday: paydayInfo.isPast
        };
        
        setCollectedData(prev => ({
          ...prev,
          conversationContext: {
            ...prev.conversationContext,
            tempJobData: jobDataWithPayday
          }
        }));
        
        let receivedQuestion = '';
        if (paydayInfo.isPast) {
          receivedQuestion = `✅ **Payday noted: ${paydayInfo.text}**\n\n` +
                            `**Have you already received this payment?**\n\n` +
                            `This helps me track what's already in your account.`;
        } else {
          receivedQuestion = `📅 **Next payday: ${paydayInfo.text}**\n\n` +
                            `**Are you waiting for this payment, or have you already received it?**`;
        }
        
        response = receivedQuestion;
        nextStage = CONVERSATION_STATES.EMPLOYED_JOB_RECEIVED;
        break;
        
      case CONVERSATION_STATES.EMPLOYED_JOB_RECEIVED:
        const finalJobData = collectedData.conversationContext.tempJobData;
        const currentIdx = collectedData.conversationContext.currentIncomeIndex;
        const totalJobsCount = collectedData.conversationContext.totalJobsToAsk;
        
        let received = false;
        if (lowerMsg.includes('yes') || lowerMsg.includes('received') || lowerMsg.includes('got') || lowerMsg.includes('already')) {
          received = true;
        } else if (lowerMsg.includes('no') || lowerMsg.includes('waiting') || lowerMsg.includes('not yet')) {
          received = false;
        }
        
        // Create final income source
        const incomeSource = {
          amount: finalJobData.amount,
          source: finalJobData.source,
          frequency: finalJobData.frequency,
          payday: finalJobData.payday,
          nextPayDate: finalJobData.nextPayDate,
          received: received,
          currency: finalJobData.currency,
          notes: `Job ${currentIdx}: ${finalJobData.frequency} pay`
        };
        // Track this transaction for correction context
  setLastTransactions(prev => [{
    // id: `income_${Date.now()}`,
    description: finalJobData.source,
    amount: finalJobData.amount,
    type: 'income',
    category: 'salary', 
  }, ...prev].slice(0, 5));

        // Add to income sources
        setCollectedData(prev => {
          const updatedSources = [...prev.income.sources, incomeSource];
          const totalIncome = updatedSources.reduce((sum, source) => {
            let monthlyAmount = source.amount;
            if (source.frequency === INCOME_FREQUENCY.WEEKLY) {
              monthlyAmount = source.amount * 4.33;
            } else if (source.frequency === INCOME_FREQUENCY.BI_WEEKLY) {
              monthlyAmount = source.amount * 2.167;
            }
            return sum + monthlyAmount;
          }, 0);
          
          return {
            ...prev,
            income: {
              ...prev.income,
              sources: updatedSources,
              total: Math.round(totalIncome)
            }
          };
        });
        
        // Create reminder for payday if needed
        if (onAddTransaction && finalJobData.nextPayDate && !received) {
  // Map to valid category
  let reminderCategory = 'salary';
  const src = finalJobData.source.toLowerCase();
  if (src.includes('freelance')) reminderCategory = 'freelance';
  else if (src.includes('gift')) reminderCategory = 'gift';
  else if (src.includes('investment')) reminderCategory = 'investment';
  
  onAddTransaction({
    id: `payday_${Date.now()}_job${currentIdx}`,
    type: 'reminder',
    amount: finalJobData.amount,
    description: `Payday for ${finalJobData.source}`,
    dueDate: finalJobData.nextPayDate,
    category: reminderCategory,   // ✅ Valid
    recurring: true,
    frequency: finalJobData.frequency
  });
}
        
        // Check if there are more jobs to ask about
        if (currentIdx < totalJobsCount) {
          const nextJobIndex = currentIdx + 1;
          setCollectedData(prev => ({
            ...prev,
            conversationContext: {
              ...prev.conversationContext,
              currentIncomeIndex: nextJobIndex,
              tempJobData: null
            }
          }));
          
          response = `✅ **Job ${currentIdx} details saved!**\n\n` +
                    `Now let's talk about **Job ${nextJobIndex}**:\n\n` +
                    `**How much do you get paid for this job?**`;
          nextStage = CONVERSATION_STATES.EMPLOYED_JOB_AMOUNT;
        } else {
          response = `🎉 **All ${totalJobsCount} job${totalJobsCount > 1 ? 's' : ''} saved!**\n\n` +
                    `**Total Monthly Income:** ${formatCurrency(collectedData.income.total + finalJobData.amount, curr)}\n\n` +
                    `**Now let's talk about your expenses.**\n\n` +
                    `**Do you pay rent or have a mortgage?**\n\n` +
                    `If yes, how much and when is it due?\n` +
                    `If no, say "none" or "no rent"`;
          nextStage = CONVERSATION_STATES.RENT_EXPENSES;
        }
        break;
        
      case CONVERSATION_STATES.STUDENT_INCOME_DETAILS:
        if (amount) {
          const frequency = detectFrequency(lowerMsg) || INCOME_FREQUENCY.MONTHLY;
          
          setCollectedData(prev => ({
            ...prev,
            income: {
              sources: [{
                amount: amount,
                source: lowerMsg.includes('allowance') ? 'Allowance' : 
                       lowerMsg.includes('part') ? 'Part-time Job' : 'Student Income',
                frequency: frequency,
                currency: curr,
                notes: 'Student income'
              }],
              total: amount
            }
          }));
          
          response = `✅ **${formatCurrency(amount, curr)} saved as ${frequency} income!**\n\n` +
                    `**When do you typically receive this money?**\n\n` +
                    `Examples:\n` +
                    `• "Beginning of each month"\n` +
                    `• "Every Friday"\n` +
                    `• "When parents give me"\n` +
                    `• "I just got it today"`;
          nextStage = CONVERSATION_STATES.RENT_EXPENSES;
        } else if (lowerMsg.includes('no') || lowerMsg.includes('none') || lowerMsg.includes('don\'t have')) {
          response = `📝 **No regular income noted.** That's okay!\n\n` +
                    `**Do you have any expenses?** Let's start with rent/housing:\n\n` +
                    `Do you pay rent or have any housing costs?`;
          nextStage = CONVERSATION_STATES.RENT_EXPENSES;
        } else {
          response = `Please tell me about your **student income**.\n\n` +
                    `Examples:\n` +
                    `• "I get 500 AED allowance monthly"\n` +
                    `• "Part-time job pays 1000 per month"\n` +
                    `• "No regular income"\n` +
                    `• "Occasional gifts, about 300 monthly"`;
        }
        break;
        
      case CONVERSATION_STATES.RENT_EXPENSES:
        if (lowerMsg.includes('none') || lowerMsg.includes('no') || lowerMsg.includes('0') || lowerMsg.includes('don\'t pay')) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'rent',
              amount: 0,
              description: 'No rent expense',
              dueDate: null
            }]
          }));
          response = `✅ **No rent expense noted.**\n\n` +
                    `**What about groceries/food expenses?**\n\n` +
                    `How much do you typically spend per month on food?\n` +
                    `When do you usually buy groceries?`;
          nextStage = CONVERSATION_STATES.FOOD_EXPENSES;
        } else if (amount) {
          const dueDateInfo = extractDueDateInfo(userMessage);
          
          const rentExpense = {
            category: 'rent',
            amount: amount,
            description: 'Monthly rent/mortgage',
            dueDate: dueDateInfo.text,
            currency: curr
          };
          
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, rentExpense]
          }));
          
          if (onAddTransaction && dueDateInfo.text !== 'Monthly') {
  onAddTransaction({
    // id: `rent_${Date.now()}`,  // ❌ remove this
    type: 'reminder',
    amount: amount,
    description: 'Rent Payment Due',
    dueDate: dueDateInfo.text,
    category: 'rent',   // ✅ Valid
    recurring: true,
    frequency: 'monthly'
  });
}
          response = `✅ **${formatCurrency(amount, curr)} saved as rent!**\n\n` +
                    (dueDateInfo.text ? `**Due date:** ${dueDateInfo.text}\n\n` : '') +
                    `**What about groceries/food expenses?**\n\n` +
                    `How much do you typically spend per month on food?\n` +
                    `When do you usually buy groceries?`;
          nextStage = CONVERSATION_STATES.FOOD_EXPENSES;
        } else {
          response = `Please tell me your **monthly rent amount** and **when it's due**.\n\n` +
                    `Examples:\n` +
                    `• "2500 AED due on the 1st"\n` +
                    `• "My rent is 3000, paid monthly on the 5th"\n` +
                    `• "No rent"\n` +
                    `• "800 AED weekly for shared room"`;
        }
        break;
        
      case CONVERSATION_STATES.FOOD_EXPENSES:
        if (amount) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'groceries',
              amount: amount,
              description: 'Monthly food/groceries',
              currency: curr
            }]
          }));
          
          response = `✅ **${formatCurrency(amount, curr)} saved for food!**\n\n` +
                    `**Transportation costs per month?**\n\n` +
                    `(Petrol, public transport, taxi, etc.)\n\n` +
                    `Examples:\n` +
                    `• "300 for petrol"\n` +
                    `• "500 on transport"\n` +
                    `• "No transportation costs"`;
          nextStage = CONVERSATION_STATES.TRANSPORT_EXPENSES;
        } else if (lowerMsg.includes('none') || lowerMsg.includes('no') || lowerMsg.includes('0')) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'groceries',
              amount: 0,
              description: 'No food expenses',
              currency: curr
            }]
          }));
          
          response = `✅ **No food expenses noted.**\n\n` +
                    `**Transportation costs per month?**`;
          nextStage = CONVERSATION_STATES.TRANSPORT_EXPENSES;
        } else {
          response = `Please estimate your **monthly food expenses** in ${curr}.\n\n` +
                    `Examples:\n` +
                    `• "800 for groceries"\n` +
                    `• "Around 1200 on food and dining"\n` +
                    `• "500 AED"\n` +
                    `• "No food expenses"`;
        }
        break;
        
      case CONVERSATION_STATES.TRANSPORT_EXPENSES:
        if (amount) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'transportation',
              amount: amount,
              description: 'Monthly transportation',
              currency: curr
            }]
          }));
          
          response = `✅ **${formatCurrency(amount, curr)} saved for transport!**\n\n` +
                    `**Any other regular monthly bills?**\n\n` +
                    `(Utilities, phone, internet, subscriptions, etc.)\n\n` +
                    `Give me a total or say "done" if none.`;
          nextStage = CONVERSATION_STATES.OTHER_EXPENSES;
        } else if (lowerMsg.includes('none') || lowerMsg.includes('no') || lowerMsg.includes('0')) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'transportation',
              amount: 0,
              description: 'No transportation costs',
              currency: curr
            }]
          }));
          
          response = `✅ **No transportation costs noted.**\n\n` +
                    `**Any other regular monthly bills?**\n\n` +
                    `Give me a total or say "done" if none.`;
          nextStage = CONVERSATION_STATES.OTHER_EXPENSES;
        } else {
          response = `Please estimate your **monthly transportation costs** in ${curr}.\n\n` +
                    `Examples:\n` +
                    `• "300 for petrol"\n` +
                    `• "500 on transport"\n` +
                    `• "200 AED monthly"\n` +
                    `• "No transport costs"`;
        }
        break;
        
      case CONVERSATION_STATES.OTHER_EXPENSES:
        if (lowerMsg.includes('done') || lowerMsg.includes('none') || lowerMsg.includes('no more')) {
          const totalIncome = collectedData.income.total;
          const totalExpenses = collectedData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
          const disposable = Math.max(totalIncome - totalExpenses, 0);
          
          response = `✅ **Expenses complete!**\n\n` +
                    `**Current Summary:**\n` +
                    `• Total Income: ${formatCurrency(totalIncome, curr)}\n` +
                    `• Total Expenses: ${formatCurrency(totalExpenses, curr)}\n` +
                    `• Available: ${formatCurrency(disposable, curr)}\n\n` +
                    `**Now, let's talk about savings.**\n\n` +
                    `How much would you like to save each month?\n\n` +
                    `You can say:\n` +
                    `• "Save 1000 AED"\n` +
                    `• "20% of my income"\n` +
                    `• "Not sure, help me decide"\n` +
                    `• "I don't want to save right now"`;
          nextStage = CONVERSATION_STATES.SAVINGS_GOAL;
        } else if (amount) {
          setCollectedData(prev => ({
            ...prev,
            expenses: [...prev.expenses, {
              category: 'utilities',
              amount: amount,
              description: 'Other monthly bills',
              currency: curr
            }]
          }));
          
          response = `✅ **${formatCurrency(amount, curr)} added for other bills!**\n\n` +
                    `**Any more monthly expenses?**\n\n` +
                    `Add another amount or say "done" to finish.`;
        } else {
          response = `Please tell me the **total amount for other bills** in ${curr}, or say "done" if none.\n\n` +
                    `Examples:\n` +
                    `• "300 for utilities"\n` +
                    `• "200 phone bill, 100 internet"\n` +
                    `• "done" to finish`;
        }
        break;
        
      case CONVERSATION_STATES.SAVINGS_GOAL:
        if (amount) {
          setCollectedData(prev => ({ ...prev, savingsGoal: amount }));
          
          const totalIncome = collectedData.income.total;
          const savingsPercentage = ((amount / totalIncome) * 100).toFixed(1);
          
          response = `🎯 **Perfect! Saving ${formatCurrency(amount, curr)} monthly!**\n\n` +
                    `That's ${savingsPercentage}% of your income.\n\n` +
                    `**Any specific goals you're saving for?**\n\n` +
                    `Examples:\n` +
                    `• "New phone"\n` +
                    `• "Trip to Europe"\n` +
                    `• "Car down payment"\n` +
                    `• "Emergency fund"\n` +
                    `• Say "none" to skip`;
          nextStage = CONVERSATION_STATES.WISHLIST_SETUP;
        } else if (lowerMsg.includes('%')) {
          const percentageMatch = userMessage.match(/(\d+)%/);
          if (percentageMatch && collectedData.income.total > 0) {
            const percentage = parseInt(percentageMatch[1]);
            const savingsAmount = (collectedData.income.total * percentage) / 100;
            setCollectedData(prev => ({ ...prev, savingsGoal: savingsAmount }));
            
            response = `🎯 **Great! Saving ${percentage}% = ${formatCurrency(savingsAmount, curr)} monthly!**\n\n` +
                      `**Any big purchases you're saving for?**\n\n` +
                      `Examples: "New laptop", "Vacation", "Investment"\n` +
                      `Or say "none" to skip.`;
            nextStage = CONVERSATION_STATES.WISHLIST_SETUP;
          }
        } else if (lowerMsg.includes('not sure') || lowerMsg.includes('help') || lowerMsg.includes('decide')) {
          const totalIncome = collectedData.income.total;
          const suggestedSavings = Math.round(totalIncome * 0.2);
          
          response = `💡 **Based on your income of ${formatCurrency(totalIncome, curr)}, I suggest saving 20%:**\n\n` +
                    `**Suggested monthly savings:** ${formatCurrency(suggestedSavings, curr)}\n\n` +
                    `This would mean:\n` +
                    `• ${formatCurrency(totalIncome - suggestedSavings, curr)} available for expenses\n` +
                    `• Building savings for future goals\n\n` +
                    `**Does ${formatCurrency(suggestedSavings, curr)} per month sound good to you?**\n\n` +
                    `You can say:\n` +
                    `• "Yes, let's go with that"\n` +
                    `• "No, I want to save more/less"\n` +
                    `• "I want to save X amount instead"`;
          nextStage = CONVERSATION_STATES.SAVINGS_CONFIRMATION;
        } else if (lowerMsg.includes('don\'t') || lowerMsg.includes('no save') || lowerMsg.includes('0')) {
          setCollectedData(prev => ({ ...prev, savingsGoal: 0 }));
          response = `📝 **No savings goal set for now.** You can always add one later!\n\n` +
                    `**Any specific goals you're saving for?**\n\n` +
                    `Examples: "New phone", "Trip", "Emergency fund"\n` +
                    `Or say "none" to finish setup.`;
          nextStage = CONVERSATION_STATES.WISHLIST_SETUP;
        } else {
          response = `**How much would you like to save each month?**\n\n` +
                    `You can give:\n` +
                    `• Amount: "1000 AED"\n` +
                    `• Percentage: "20% of income"\n` +
                    `• Say "not sure" for suggestions\n` +
                    `• Say "I don't want to save" for $0`;
        }
        break;
        
      case CONVERSATION_STATES.SAVINGS_CONFIRMATION:
        if (lowerMsg.includes('yes') || lowerMsg.includes('ok') || lowerMsg.includes('good') || lowerMsg.includes('go with')) {
          const totalIncome = collectedData.income.total;
          const suggestedSavings = Math.round(totalIncome * 0.2);
          setCollectedData(prev => ({ ...prev, savingsGoal: suggestedSavings }));
          
          response = `✅ **Great! ${formatCurrency(suggestedSavings, curr)} set as monthly savings goal!**\n\n` +
                    `**Any specific goals you're saving for?**\n\n` +
                    `Examples: "New phone", "Trip", "Investment"\n` +
                    `Or say "none" to skip.`;
          nextStage = CONVERSATION_STATES.WISHLIST_SETUP;
        } else if (amount) {
          setCollectedData(prev => ({ ...prev, savingsGoal: amount }));
          
          response = `🎯 **Perfect! Saving ${formatCurrency(amount, curr)} monthly!**\n\n` +
                    `**Any specific goals you're saving for?**\n\n` +
                    `Examples: "New phone", "Trip", "Investment"\n` +
                    `Or say "none" to skip.`;
          nextStage = CONVERSATION_STATES.WISHLIST_SETUP;
        } else {
          response = `How much would you like to save instead?\n\n` +
                    `Examples:\n` +
                    `• "Save 500 instead"\n` +
                    `• "I want to save 30%"\n` +
                    `• "Let's go with your suggestion"`;
        }
        break;
              case CONVERSATION_STATES.WISHLIST_SETUP:
        if (lowerMsg.includes('done') || lowerMsg.includes('finish') || lowerMsg.includes('none') || lowerMsg.includes('no') || lowerMsg.includes('skip')) {
          response = generateDetailedSummary();
          nextStage = CONVERSATION_STATES.SUMMARY;
          setConversationEnded(true);
        } else {
          const wishItem = extractWishlistItem(userMessage);
          const wishPrice = amount || estimateItemPrice(wishItem);
          const newWishItem = {
            item: wishItem,
            estimatedPrice: wishPrice,
            priority: 'medium',
            category: detectWishlistCategory(wishItem),
            currency: curr
          };
          setCollectedData(prev => ({
            ...prev,
            wishlist: [...prev.wishlist, newWishItem]
          }));
          if (onAddWishlist) {
            onAddWishlist(newWishItem);
          }
          response = `🎯 **Added "${wishItem}" to your goals!**\n\n` +
            `Estimated cost: ${formatCurrency(wishPrice, curr)}\n` +
            `With your savings goal, you'll reach this in about ${Math.ceil(wishPrice / (collectedData.savingsGoal || 1))} months.\n\n` +
            `**Any other goals?**\n\nAdd another item or say "done" to finish.`;
        }
        break;
       case CONVERSATION_STATES.SUMMARY:
        response = generateDetailedSummary();
        setConversationEnded(true);
        const totalIncome = collectedData.income.total;
        const totalExpenses = collectedData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const disposableIncome = Math.max(totalIncome - totalExpenses - collectedData.savingsGoal, 0);
        const finalData = {
          ...collectedData,
          disposableIncome,
          summary: {
            totalIncome,
            totalExpenses,
            savingsGoal: collectedData.savingsGoal || 0,
            disposableIncome,
            savingsRate: totalIncome > 0 ? ((collectedData.savingsGoal || 0) / totalIncome * 100).toFixed(1) : '0',
            currency: curr
          },
          setupComplete: true,
          lastUpdated: new Date().toISOString()
        };
        if (onComplete) {
          completeTimeoutRef.current = setTimeout(() => {
            onComplete(finalData);
            completeTimeoutRef.current = null;
          }, 5000);
        }
        break;
        
case CONVERSATION_STATES.FREELANCE_INCOME_TYPE:
        if (amount) {
          const freq = detectFrequency(lowerMsg) || INCOME_FREQUENCY.PROJECT_BASED;
          setCollectedData(prev => ({
            ...prev,
            income: {
              sources: [{
                amount,
                source: 'Freelance Income',
                frequency: freq,
                currency: curr,
                notes: 'Freelance'
              }],
              total: amount
            }
          }));
          response = `✅ **${formatCurrency(amount, curr)} saved as ${freq} freelance income.**\n\n` +
                     `Now let's talk about your expenses.\n\n` +
                     `**Do you pay rent or have a mortgage?**\n\n` +
                     `If yes, how much and when is it due?\n` +
                     `If no, say "none" or "no rent"`;
          nextStage = CONVERSATION_STATES.RENT_EXPENSES;
        } else {
          response = `Please tell me your **average monthly freelance income**, or describe how you're paid.\n\n` +
                     `Examples:\n` +
                     `• "About 3000 AED per month"\n` +
                     `• "I charge 500 per project, around 4 projects monthly"`;
        }
        break;

      case CONVERSATION_STATES.HOUSEHOLD_BUDGET:
        if (amount) {
          setCollectedData(prev => ({
            ...prev,
            income: {
              sources: [{
                amount,
                source: 'Household Budget',
                frequency: INCOME_FREQUENCY.MONTHLY,
                currency: curr,
                notes: 'Household management'
              }],
              total: amount
            }
          }));
          response = `✅ **${formatCurrency(amount, curr)} saved as household budget.**\n\n` +
                     `Now let's talk about your expenses.\n\n` +
                     `**Do you pay rent or have a mortgage?**\n\n` +
                     `If yes, how much and when is it due?\n` +
                     `If no, say "none" or "no rent"`;
          nextStage = CONVERSATION_STATES.RENT_EXPENSES;
        } else {
          response = `Please tell me the **total monthly household budget** you manage.\n\n` +
                     `Examples:\n` +
                     `• "8000 AED"\n` +
                     `• "We have 10000 monthly"\n` +
                     `• "Around 12000"`;
        }
        break;

      case 'daily':
  const dailyResult = generateDailyResponse(userMessage);
  return { response: dailyResult.response, nextStage: currentStage };

      default:
        response = `Let's continue with your setup. Tell me more about your situation.`;
        nextStage = currentStage;
    }
    
    setConversationStage(nextStage);
    return { response, nextStage };
  };
  // ========== DAILY MODE RESPONSE GENERATOR ==========
  const generateDailyResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    const { amount, currency } = extractAmountAndCurrency(userMessage);
    const curr = currency || collectedData.currency || 'AED';

    const correction = detectAndApplyCorrection(userMessage, [], recentTransactions);
    if (correction.corrected) {
      return { response: correction.response };
    }

      
    // ----- EXPENSE -----
if (lowerMsg.includes('spent') || lowerMsg.includes('bought') || lowerMsg.includes('paid') || lowerMsg.includes('cost')) {
  const parsed = parseExpense(userMessage, recentTransactions);
  if (parsed && parsed.amount) {
    const tempId = `temp_exp_${Date.now()}`;
    const newTransaction = {
      type: 'expense',
      amount: parsed.amount,
      currency: parsed.currency || curr,
      description: parsed.description,
      category: parsed.category,
      date: new Date().toISOString()
    };
    if (onAddTransaction) onAddTransaction(newTransaction);
    setLastTransactions(prev => [{ ...newTransaction, id: tempId }, ...prev].slice(0, 10));
    
    return {
      response: `✅ Logged expense: ${formatCurrency(parsed.amount, parsed.currency)} for ${parsed.description} (${parsed.category}).`,
      actions: [
        { text: '✏️ Edit', action: 'edit_transaction', data: { ...newTransaction, id: tempId } },
        { text: '↩️ Undo', action: 'undo_transaction', data: tempId }
      ]
    };
  }
}

   // ----- INCOME -----
if (lowerMsg.includes('received') || lowerMsg.includes('salary') || lowerMsg.includes('income') || lowerMsg.includes('got paid')) {
  const parsedIncome = parseFinancialAmount(userMessage);
  if (parsedIncome && parsedIncome.amount) {
    const tempId = `temp_inc_${Date.now()}`;
    const description = lowerMsg.includes('salary') ? 'Salary' : 'Income';
    let category = 'salary';
    if (lowerMsg.includes('freelance')) category = 'freelance';
    else if (lowerMsg.includes('gift')) category = 'gift';
    else if (lowerMsg.includes('investment')) category = 'investment';
    
    const newTransaction = {
      type: 'income',
      amount: parsedIncome.amount,
      currency: parsedIncome.currency || curr,
      description,
      category,
      date: new Date().toISOString()
    };
    if (onAddTransaction) onAddTransaction(newTransaction);
    setLastTransactions(prev => [{ ...newTransaction, id: tempId }, ...prev].slice(0, 10));
    return { 
      response: `✅ Logged income: ${formatCurrency(parsedIncome.amount, parsedIncome.currency)} as ${description}.`,
      actions: [
        { text: '✏️ Edit', action: 'edit_transaction', data: { ...newTransaction, id: tempId } },
        { text: '↩️ Undo', action: 'undo_transaction', data: tempId }
      ]
    };
  }
}

    // ----- WISHLIST -----
    if (lowerMsg.includes('wishlist') || 
    lowerMsg.includes('want') || 
    lowerMsg.includes('save for') ||
    lowerMsg.includes('wish') ||
    lowerMsg.includes('dream') ||
    lowerMsg.includes('add to my wishlist') ||
    lowerMsg.includes('buy') && lowerMsg.includes('want')) {

      const item = extractWishlistItem(userMessage);
      const price = amount || estimateItemPrice(item);
      const category = detectWishlistCategory(item);
      const wishItem = {
        name: item, 
        estimatedPrice: price,
        currency: curr,
        priority: 'medium',
        category
      };
      if (onAddWishlist) onAddWishlist(wishItem);
      return { response: `🎯 Added "${item}" to your wishlist with an estimated cost of ${formatCurrency(price, curr)}.` };
    }

    return {
      response: "I'm here to help! You can:\n• Log an expense: 'Spent 50 on groceries'\n• Add income: 'Received salary 5000'\n• Add to wishlist: 'I want a new laptop'\n• Correct a mistake: 'Actually that coffee was 15, not 10'\n\nWhat would you like to do?"
    };
  };

  // ========== SUMMARY GENERATION ==========
  const generateDetailedSummary = () => {
    const totalIncome = collectedData.income.total;
    const totalExpenses = collectedData.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const savingsGoal = collectedData.savingsGoal || 0;
    const disposableIncome = Math.max(totalIncome - totalExpenses - savingsGoal, 0);
    const currency = collectedData.currency || 'AED';
    
    let summary = `🎉 **Your Personalized Financial Plan is Ready!**\n\n`;
    
    // Income section
    summary += `📊 **Monthly Income:** ${formatCurrency(totalIncome, currency)}\n`;
    if (collectedData.income.sources.length > 0) {
      collectedData.income.sources.forEach((source, index) => {
        summary += `  • ${source.source}: ${formatCurrency(source.amount, source.currency || currency)} (${source.frequency})\n`;
        if (source.payday) {
          summary += `    Payday: ${source.payday} ${source.received ? '(Received)' : '(Pending)'}\n`;
        }
      });
    }
    
    // Expenses section
    summary += `\n💰 **Monthly Expenses:** ${formatCurrency(totalExpenses, currency)}\n`;
    collectedData.expenses.forEach((expense, index) => {
      if (expense.amount > 0) {
        summary += `  • ${expense.category}: ${formatCurrency(expense.amount, expense.currency || currency)}`;
        if (expense.dueDate) summary += ` (due: ${expense.dueDate})`;
        summary += `\n`;
      }
    });
    
    // Savings section
    summary += `\n🎯 **Monthly Savings Goal:** ${formatCurrency(savingsGoal, currency)}\n`;
    if (savingsGoal > 0 && totalIncome > 0) {
      const savingsRate = ((savingsGoal / totalIncome) * 100).toFixed(1);
      summary += `  That's ${savingsRate}% of your income\n`;
    }
    
    // Disposable income
    summary += `\n💵 **Available for Spending:** ${formatCurrency(disposableIncome, currency)}\n\n`;
    
    // Analysis
    if (totalIncome > 0) {
      summary += `📈 **Analysis:**\n`;
      summary += `• ${((totalExpenses / totalIncome) * 100).toFixed(1)}% goes to expenses\n`;
      summary += `• ${((savingsGoal / totalIncome) * 100).toFixed(1)}% goes to savings\n`;
      summary += `• ${((disposableIncome / totalIncome) * 100).toFixed(1)}% is disposable income\n\n`;
      
      // Recommendations
      summary += `💡 **Recommendations:**\n`;
      if (savingsGoal / totalIncome < 0.1) {
        summary += `• Try to increase savings to at least 10% of income\n`;
      }
      if (totalExpenses / totalIncome > 0.7) {
        summary += `• Consider reducing expenses where possible\n`;
      }
    }
    
    // Wishlist
    if (collectedData.wishlist.length > 0) {
      summary += `\n🎯 **Your Goals:**\n`;
      collectedData.wishlist.forEach((item, index) => {
        const months = savingsGoal > 0 ? Math.ceil(item.estimatedPrice / savingsGoal) : 'N/A';
        summary += `• ${item.item}: ${formatCurrency(item.estimatedPrice, item.currency || currency)} (~${months} months to save)\n`;
      });
    }
    
    summary += `\n🚀 **Your dashboard is now live!**\n`;
    summary += `You can always come back to update your information.`;
    
    return summary;
  };

  // ========== ORIGINAL HELPER FUNCTIONS ==========
  const extractWishlistItem = (message) => {
  const lowerMsg = message.toLowerCase();
  
  // Helper to clean extracted text
  const cleanItemName = (str) => {
    return str
      .replace(/^(a|an|the)\s+/i, '')
      .replace(/\s*(for|that|because|to|in|on|at).*$/i, '')
      .replace(/[^\w\s\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Pattern 1: "add X to my wishlist" / "add X to wishlist"
  const addPattern = /(?:add|put)\s+(.+?)\s+(?:to\s+(?:my\s+)?wishlist|wishlist)/i;
  const addMatch = message.match(addPattern);
  if (addMatch && addMatch[1]) {
    return cleanItemName(addMatch[1]);
  }
  
  // Pattern 2: "i want a/an X" / "i want X" / "i want to buy X"
  const wantPattern = /(?:i\s+)?want\s+(?:a|an|to\s+buy|to\s+get)?\s*(.+?)(?:\s+for|\s+that|\s+because|\s*$)/i;
  const wantMatch = message.match(wantPattern);
  if (wantMatch && wantMatch[1]) {
    return cleanItemName(wantMatch[1]);
  }
  
  // Pattern 3: "i wish for X" / "i dream of X" / "i'm saving for X"
  const wishPattern = /(?:i\s+)?(?:wish|dream|saving)\s+(?:for|of)?\s*(.+?)(?:\s+for|\s+that|\s*$)/i;
  const wishMatch = message.match(wishPattern);
  if (wishMatch && wishMatch[1]) {
    return cleanItemName(wishMatch[1]);
  }
  
  // Pattern 4: "save for X" / "saving towards X"
  const savePattern = /(?:save|saving)\s+(?:for|towards?)\s+(.+?)(?:\s+for|\s+that|\s*$)/i;
  const saveMatch = message.match(savePattern);
  if (saveMatch && saveMatch[1]) {
    return cleanItemName(saveMatch[1]);
  }

  // Pattern 5: "add X" (as fallback for quick chips)
  const quickAddPattern = /^add\s+(.+)$/i;
  const quickMatch = message.match(quickAddPattern);
  if (quickMatch && quickMatch[1]) {
    return cleanItemName(quickMatch[1]);
  }
  
  // Fallback: remove filler words and hope for the best
  let cleaned = message
    .replace(/\b(add|put|want|wish|dream|save|buy|get|to|my|the|a|an|for|that|please|i|i'm|i'd|me)\b/gi, '')
    .replace(/\d+(\.\d+)?/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (cleaned.length > 30) cleaned = cleaned.substring(0, 27) + '...';
  return cleaned || 'Goal';
};

  const estimateItemPrice = (item) => {
    const lowerItem = item.toLowerCase();
    
    const priceEstimates = {
      'iphone': { min: 3000, max: 6000 },
      'macbook': { min: 4000, max: 8000 },
      'car': { min: 50000, max: 200000 },
      'apartment': { min: 500000, max: 2000000 },
      'house': { min: 1000000, max: 5000000 },
      'building': { min: 5000000, max: 20000000 },
      'watch': { min: 500, max: 5000 },
      'bag': { min: 300, max: 5000 },
      'laptop': { min: 2000, max: 5000 },
      'tv': { min: 1500, max: 10000 },
      'phone': { min: 800, max: 4000 },
      'dress': { min: 200, max: 1000 },
      'shoes': { min: 300, max: 1500 },
      'furniture': { min: 1000, max: 10000 },
      'jewelry': { min: 1000, max: 50000 }
    };
    
    for (const [keyword, range] of Object.entries(priceEstimates)) {
      if (lowerItem.includes(keyword)) {
        return Math.round((range.min + range.max) / 2);
      }
    }
    
    return 1000;
  };

  const detectWishlistCategory = (item) => {
    const lowerItem = item.toLowerCase();
    
    const categories = {
      electronics: ['iphone', 'macbook', 'laptop', 'phone', 'tv', 'tablet', 'camera', 'headphones'],
      fashion: ['bag', 'watch', 'dress', 'shoes', 'clothes', 'jewelry', 'accessory'],
      home: ['furniture', 'sofa', 'bed', 'table', 'chair', 'appliance'],
      vehicle: ['car', 'bike', 'scooter', 'motorcycle'],
      property: ['apartment', 'house', 'building', 'land', 'villa'],
      travel: ['vacation', 'trip', 'holiday', 'flight', 'hotel'],
      other: []
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerItem.includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  };

  const extractExpenseDescription = (message) => {
    const lowerMsg = message.toLowerCase();
    
    const patterns = [
      /spent\s+.*?\s+on\s+(.+)/i,
      /paid\s+.*?\s+for\s+(.+)/i,
      /bought\s+(.+)/i,
      /purchased\s+(.+)/i,
      /cost.*?for\s+(.+)/i
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    let cleanMsg = message
      .replace(/spent|paid|bought|purchased|cost me|for|on|aed|usd|eur|gbp|₹|\$|€|£/gi, '')
      .replace(/\d+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanMsg.length > 50) cleanMsg = cleanMsg.substring(0, 47) + '...';
    return cleanMsg || 'Miscellaneous expense';
  };

  const detectExpenseCategory = (message) => {
    const lowerMsg = message.toLowerCase();
    
    const categories = {
      food: ['food', 'lunch', 'dinner', 'breakfast', 'groceries', 'restaurant', 'coffee', 'meal', 'snack', 'takeaway'],
      transportation: ['transport', 'fuel', 'petrol', 'metro', 'taxi', 'uber', 'bus', 'gas', 'car', 'parking', 'salik'],
      shopping: ['shopping', 'clothes', 'bag', 'shoes', 'gadget', 'phone', 'electronics', 'accessory', 'watch'],
      entertainment: ['movie', 'cinema', 'netflix', 'spotify', 'game', 'concert', 'event', 'outing', 'hobby'],
      bills: ['bill', 'rent', 'electricity', 'water', 'internet', 'phone bill', 'subscription', 'membership'],
      health: ['medicine', 'doctor', 'hospital', 'pharmacy', 'health', 'medical', 'checkup'],
      education: ['book', 'course', 'tuition', 'education', 'learning', 'workshop', 'seminar'],
      other: []
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerMsg.includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  };

  const extractLocation = (msg) => {
    const locations = [
      'dubai marina', 'downtown dubai', 'jumeirah', 'abu dhabi', 'corniche area',
      'business bay', 'dubai', 'sharjah', 'ajman', 'al barsha', 'jlt', 'dubai hills',
      'palm jumeirah', 'al quoz', 'international city'
    ];
    
    for (const location of locations) {
      if (msg.includes(location)) {
        return location;
      }
    }
    return null;
  };

  // ========== RECEIPT SCANNING FUNCTIONS ==========

    // NEW: Preprocess image for better OCR accuracy
  const preprocessImage = (file) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize to 1500px width (improves OCR speed & accuracy)
        const scale = 1500 / img.width;
        canvas.width = 1500;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to grayscale + increase contrast
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i+1];
          const b = imageData.data[i+2];
          // Luminance formula
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          // Boost contrast: darken shadows, brighten highlights
          gray = gray > 128 ? Math.min(255, gray * 1.2) : gray * 0.8;
          imageData.data[i] = gray;
          imageData.data[i+1] = gray;
          imageData.data[i+2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);
        canvas.toBlob(resolve, 'image/png');
      };
      img.src = URL.createObjectURL(file);
    });
  };

const handleReceiptUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.match('image.*')) {
    addAIMessage("Please upload an image file (JPEG, PNG, etc.).", null, '⚠️');
    return;
  }
  
  if (file.size > 5 * 1024 * 1024) {
    addAIMessage("File is too large. Please upload an image under 5MB.", null, '⚠️');
    return;
  }
  
  setReceiptImage(file);
  
  const reader = new FileReader();
  reader.onload = (e) => {
    setReceiptPreview(e.target.result);
  };
  reader.readAsDataURL(file);
  
  // Automatically start scanning after upload
  setTimeout(() => {
    scanReceipt(file);
  }, 1000);
};

const scanReceipt = async (file) => {
  setIsScanning(true);
  setScanProgress(0);
  
  try {
    // Preprocess image for better OCR
    const processedImage = await preprocessImage(file);
    
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          setScanProgress(Math.round(m.progress * 100));
        }
      }
    });
    
    const { data: { text } } = await worker.recognize(processedImage);
    await worker.terminate();
    
    setExtractedText(text);
    processReceiptText(text);
  } catch (error) {
    console.error('OCR Error:', error);
    setIsScanning(false);
    addAIMessage("❌ Couldn't scan receipt. Please try with a clearer photo or enter manually.", null, '⚠️');
  }
};



  const processReceiptText = (text) => {
  setIsScanning(false);

  console.log('===== RAW OCR TEXT =====');
  console.log(text);
  console.log('========================');

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  const isLikelyYear = (num) => num >= 2000 && num <= 2100;
  const hasComma = (str) => str.includes(',');

  // Extract store name (first non‑empty line that doesn't look like a header)
  let storeName = 'Store';
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const candidate = lines[i];
    if (!/tax invoice|bill|receipt|date|time|clerk|cashier|terminal|mbe/i.test(candidate) && candidate.length < 40) {
      storeName = candidate.replace(/[^\w\s\-&]/g, '').trim();
      break;
    }
  }

  // Extract date
  const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const foundDate = dateMatch ? dateMatch[1] : null;

  // ===== TOTAL DETECTION (IMPROVED) =====
  let detectedTotal = 0;
  
  // Look for "Bill Amount" or "Total" with decimal
  const totalPatterns = [
    /Bill\s+Amount\s*[:\-\s]*(\d+\.\d{2})/i,
    /Total\s+Amount\s*[:\-\s]*(\d+\.\d{2})/i,
    /Total\s*[:\-\s]*(\d+\.\d{2})/i,
    /Amount\s*[:\-\s]*(\d+\.\d{2})/i
  ];
  
  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      detectedTotal = parseFloat(match[1]);
      break;
    }
  }
  
  // Fallback to old method if no decimal total found
  if (detectedTotal === 0) {
    const billLineIdx = lines.findIndex(l => /bill\s+amount|total\s+amount|total/i.test(l));
    if (billLineIdx !== -1) {
      const checkLine = (line) => {
        const nums = line.match(/\d+(?:\.\d{2})?/g);
        if (nums) {
          for (const n of nums) {
            const val = parseFloat(n);
            if (!isNaN(val) && val > 0 && val < 5000 && !isLikelyYear(val) && !hasComma(n)) {
              return val;
            }
          }
        }
        return null;
      };
      detectedTotal = checkLine(lines[billLineIdx]) ||
                     (billLineIdx + 1 < lines.length ? checkLine(lines[billLineIdx + 1]) : null) || 0;
    }
  }

  // ===== ITEM EXTRACTION (IMPROVED) =====
  let items = [];
  const skipKeywords = [
    'product', 'price', 'qty', 'amount', 'total', 'tax', 'vat', 'invoice',
    'bill', 'date', 'time', 'cashier', 'clerk', 'ref', 'terminal', 'trn', 'mobile',
    'tel', 'phone', 'free', 'delivery', 'thank', 'visit', 'print', 'mob',
    'admin', 'www', '.com', 'original price', 'you saved', 'mbe', 'dilki', 'thathasaran'
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Skip lines that contain skip keywords (including clerk names)
    if (skipKeywords.some(kw => lowerLine.includes(kw))) continue;

    // Look for lines that start with a digit and have at least 3 numbers (typical item row)
    const startsWithDigit = /^\s*\d/.test(line);
    const numbers = line.match(/\d+(?:\.\d{2})?/g);
    if (!startsWithDigit || !numbers || numbers.length < 3) continue;

    const numericValues = numbers.map(n => parseFloat(n));
    const lineTotal = numericValues[numericValues.length - 1];
    
    // Improved quantity detection: the second-to-last number is often quantity
    let quantity = 1;
    let unitPrice = lineTotal;
    if (numericValues.length >= 4) {
      quantity = parseInt(numericValues[numericValues.length - 2]);
      unitPrice = numericValues[numericValues.length - 3];
    } else if (numericValues.length === 3) {
      // Format: index, unitPrice, total? Actually typical: index, qty, price, amount => 4 numbers.
      // For 3 numbers, assume it's index, price, amount? Hard to know. We'll keep quantity=1.
      unitPrice = numericValues[numericValues.length - 2];
    }

    // Validity checks
    if (lineTotal <= 0.1 || lineTotal > 5000) continue;
    if (Math.abs(lineTotal - detectedTotal) < 0.01) continue;
    if (unitPrice * quantity !== lineTotal && Math.abs(unitPrice * quantity - lineTotal) > 0.02) {
      // If calculation doesn't match, adjust quantity to 1 and unitPrice = lineTotal
      quantity = 1;
      unitPrice = lineTotal;
    }

    // Extract description from following lines
    let description = '';
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const nextLine = lines[j].trim();
      const nextLower = nextLine.toLowerCase();

      // Stop if we hit another item row or skip keyword
      if (/^\s*\d/.test(nextLine) || skipKeywords.some(kw => nextLower.includes(kw))) break;

      // Clean the line aggressively
      let cleaned = nextLine
        .replace(/^[\*\-–—]\s*/, '')                      // leading asterisk/dash
        .replace(/\s*Original\s+Price\s*:?\s*\d+(\.\d{2})?/gi, '') // remove "Original Price : X.XX"
        .replace(/\s*Original\s+Prive\s*:?\s*\d+/gi, '')  // typo variations
        .replace(/\s*Oraginal\s+Prive\s*:?\s*\d+/gi, '')
        .replace(/[^\w\s\-&]/g, ' ')                      // replace special chars with space
        .replace(/\s+/g, ' ')                             // collapse multiple spaces
        .trim();

      // Ignore lines that are just numbers/barcodes or too short
      if (/^\d+$/.test(cleaned) || cleaned.length < 2) continue;

      if (cleaned) {
        description = description ? description + ' ' + cleaned : cleaned;
      }
    }

    // Fallback: if no description found, use part of the line before the numbers
    if (!description) {
      const firstNumIdx = line.search(/\d/);
      if (firstNumIdx > 0) {
        description = line.substring(0, firstNumIdx).replace(/[^\w\s]/g, ' ').trim();
      }
    }

    // Final check: if description is empty or looks like a barcode, skip
    if (!description || description.length < 2 || /^\d+$/.test(description)) {
      continue;
    }

    // Limit length
    if (description.length > 40) {
      description = description.substring(0, 37) + '...';
    }

    items.push({
      description,
      amount: lineTotal,
      unitPrice,
      quantity
    });
  }

  // Remove duplicates (by description)
  const seen = new Set();
  let filteredItems = items.filter(item => {
    const key = item.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build response
  let response = `📸 **Receipt Scanned Successfully!**\n\n`;
  response += `**Store:** ${storeName}\n`;
  if (foundDate) response += `**Date:** ${foundDate}\n`;
  response += `**Total Amount:** ${formatCurrency(detectedTotal, collectedData.currency)}\n\n`;

  if (filteredItems.length > 0) {
    response += `🛒 **Detected Items:**\n`;
    filteredItems.slice(0, 5).forEach(item => {
      response += `• ${item.description}: ${formatCurrency(item.amount, collectedData.currency)}`;
      if (item.quantity > 1) response += ` (${item.quantity} × ${formatCurrency(item.unitPrice)})`;
      response += `\n`;
    });
    if (filteredItems.length > 5) response += `... and ${filteredItems.length - 5} more\n`;
  }

  const actions = [];
  if (detectedTotal > 0) {
    actions.push({
      text: `✅ Log total (${formatCurrency(detectedTotal)})`,
      action: 'log_receipt_expense',
      data: { amount: detectedTotal, description: `${storeName} Receipt` }
    });
  }
  if (filteredItems.length > 0) {
    actions.push({
      text: `📋 Log ${filteredItems.length} item${filteredItems.length > 1 ? 's' : ''} individually`,
      action: 'log_receipt_items',
      data: { items: filteredItems, storeName, foundDate }
    });
  }
  actions.push({ text: '✏️ Enter different total', action: 'manual_amount' });
  actions.push({ text: '📄 View full text', action: 'show_full_text' });

  addAIMessage(response, actions, '📸');
};

const handleReceiptAction = (action, data) => {
  switch (action) {
    case 'log_receipt_expense':
      if (onAddTransaction) {
        onAddTransaction({
          type: 'expense',
          amount: data.amount,
          currency: collectedData.currency || 'AED',
          description: data.description,
          category: 'groceries',
          date: new Date().toISOString()
        });
        addAIMessage(`✅ Logged expense: ${formatCurrency(data.amount)} at ${data.description}`, null, '📸');
      } else {
        handleUserResponse(`I spent ${data.amount} at ${data.description}`);
      }
      break;

    case 'log_receipt_items':
      const itemsToLog = data.items || [];
      if (itemsToLog.length === 0) {
        addAIMessage("No items to log.", null, '⚠️');
        return;
      }
      if (onAddTransaction) {
        itemsToLog.forEach(item => {
          onAddTransaction({
            type: 'expense',
            amount: item.amount,
            currency: collectedData.currency || 'AED',
            description: `${item.description} @ ${data.storeName}`,
            category: 'groceries',
            date: new Date().toISOString()
          });
        });
        addAIMessage(`✅ Logged ${itemsToLog.length} items from ${data.storeName}`, null, '📸');
      } else {
        itemsToLog.forEach((item, idx) => {
          setTimeout(() => {
            handleUserResponse(`Spent ${item.amount} on ${item.description} at ${data.storeName}`);
          }, idx * 300);
        });
        addAIMessage(`✅ Logging ${itemsToLog.length} items...`, null, '📸');
      }
      break;

    case 'manual_amount':
      setUserInput("The receipt total is ");
      setActiveInputTab('text');
      break;

    case 'show_full_text':
      addAIMessage(`📄 **Full Receipt Text:**\n\`\`\`\n${extractedText}\n\`\`\``, null, '📸');
      break;

    case 'edit_transaction':
      if (onEditRecord && data) {
        const newAmount = prompt('Enter new amount:', data.amount);
        if (newAmount && !isNaN(newAmount)) {
          onEditRecord(data.id, { amount: parseFloat(newAmount) });
          addAIMessage(`✅ Transaction updated to ${formatCurrency(parseFloat(newAmount), data.currency)}`, null, '🤖');
        }
      }
      break;

    case 'undo_transaction':
      if (onDeleteTransaction && data) {
        onDeleteTransaction(data);
        addAIMessage(`✅ Transaction undone.`, null, '🤖');
      }
      break;

    default:
      console.warn('Unknown receipt action:', action);
  }
};

  // ========== VOICE INPUT FUNCTIONS ==========
 const startVoiceInput = () => {
  if (!recognitionRef.current) {
    addAIMessage("🎤 Voice input isn't supported in your browser. Please use text input.", null, '⚠️');
    return;
  }
  
  if (isListening) {
    recognitionRef.current.stop();
    setIsListening(false);
    return;
  }
  
  try {
    recognitionRef.current.start();
    setActiveInputTab('voice');
  } catch (error) {
    console.error('Voice recognition error:', error);
    setIsListening(false);
    addAIMessage("Voice recognition error. Please check your microphone permissions.", null, '⚠️');
  }
};
  
  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // ========== CONVERSATION MANAGEMENT ==========
  const addAIMessage = (message, options = null, icon = '🤖') => {
    const aiMessage = {
      role: 'ai',
      message: message,
      type: 'response',
      options: options,
      icon: icon
    };
    setConversation(prev => [...prev, aiMessage]);
  };
  
  const addUserMessage = (message, icon = '👤') => {
    const userMessage = {
      role: 'user', 
      message: message,
      type: 'message',
      icon: icon
    };
    setConversation(prev => [...prev, userMessage]);
  };

  // ========== MARKET RESEARCH FUNCTIONS ==========
  const generateMarketResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    const { amount, currency } = extractAmountAndCurrency(userMessage);
    const curr = currency || collectedData.currency || 'AED';
    
    if (lowerMsg.includes('rent') && (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much'))) {
      const foundLocation = extractLocation(lowerMsg);
      
      if (foundLocation) {
        let rentInfo = null;
        let city = null;
        
        if (foundLocation.includes('dubai') || foundLocation === 'jumeirah' || foundLocation === 'business bay' || foundLocation === 'dubai marina' || foundLocation === 'downtown dubai') {
          city = 'dubai';
          rentInfo = getPriceInfo('rents', city, foundLocation);
        }
        else if (foundLocation.includes('abu dhabi') || foundLocation === 'corniche area') {
          city = 'abu dhabi';
          rentInfo = getPriceInfo('rents', city, foundLocation);
        }
        
        if (rentInfo) {
          let response = `🏠 **Rent Prices in ${foundLocation.toUpperCase()}:**\n\n`;
          
          Object.entries(rentInfo).forEach(([type, price]) => {
            if (typeof price === 'number') {
              const monthly = price / 12;
              response += `• **${type}:** ${formatCurrency(price, curr)}/year (${formatCurrency(monthly, curr)}/month)\n`;
            }
          });
          
          if (collectedData.income.total > 0) {
            const maxMonthlyRent = collectedData.income.total * 0.3;
            const maxYearlyRent = maxMonthlyRent * 12;
            
            response += `\n💡 **Based on your income (${formatCurrency(collectedData.income.total, curr)}/month):**\n`;
            response += `• Maximum recommended rent: ${formatCurrency(maxMonthlyRent, curr)}/month\n`;
            response += `• That's ${formatCurrency(maxYearlyRent, curr)} per year\n\n`;
            
            response += `**What you can afford:**\n`;
            Object.entries(rentInfo).forEach(([type, price]) => {
              if (typeof price === 'number') {
                const monthly = price / 12;
                const affordability = monthly <= maxMonthlyRent ? "✅ Within budget" : "❌ Over budget";
                response += `• ${type}: ${affordability}\n`;
              }
            });
          }
          
          response += `\n📊 **Budget Tip:** Try to keep housing costs below 30% of your monthly income.`;
          return response;
        } else {
          let response = `🏠 **Average Rent Prices in Dubai:**\n\n`;
          response += `• **Dubai Marina:** Studio from ${formatCurrency(55000/12, curr)}/month\n`;
          response += `• **Downtown Dubai:** Studio from ${formatCurrency(60000/12, curr)}/month\n`;
          response += `• **Jumeirah:** Apartment from ${formatCurrency(110000/12, curr)}/month\n`;
          
          response += `\n💡 **Need more specific info?** Tell me which area you're interested in!`;
          return response;
        }
      } else {
        return "I can help with rent price research! 🏠\n\nWhat area are you looking in? (e.g., 'Dubai Marina', 'Downtown Dubai', 'Business Bay', 'Jumeirah')\n\nI'll give you average rent prices and budget recommendations based on your income.";
      }
    }
    
    if (lowerMsg.includes('grocery') || lowerMsg.includes('food cost') || lowerMsg.includes('supermarket')) {
      let response = `🛒 **Grocery Price Guide:**\n\n`;
      
      response += `📊 **Average Monthly Costs:**\n`;
      response += `• Single person: ${formatCurrency(400, curr)}-${formatCurrency(600, curr)}\n`;
      response += `• Couple: ${formatCurrency(800, curr)}-${formatCurrency(1200, curr)}\n`;
      response += `• Family of 4: ${formatCurrency(1500, curr)}-${formatCurrency(2500, curr)}\n\n`;
      
      response += `🛍️ **Supermarket Guide:**\n`;
      response += `• **Carrefour** ($$): Good for bulk buying\n`;
      response += `• **Lulu** ($): Budget friendly\n`;
      response += `• **Spinneys** ($$$): Premium quality\n\n`;
      
      response += `💡 **Tips to Save:**\n`;
      response += `1. Buy local produce (often 30-40% cheaper)\n`;
      response += `2. Use loyalty cards & weekly offers\n`;
      response += `3. Plan meals for the week\n`;
      response += `4. Compare prices between stores\n`;
      response += `5. Buy in bulk for non-perishables\n\n`;
      
      return response;
    }
    
    if (lowerMsg.includes('price') || lowerMsg.includes('cost') || lowerMsg.includes('how much') || lowerMsg.includes('research')) {
      return "I'm in Market Research mode! 🏪 I can help you with:\n\n**🏠 Housing:**\n• Rent prices by area\n• Utility cost averages\n• Property purchase prices\n\n**🛒 Living Costs:**\n• Grocery price comparisons\n• Restaurant dining costs\n• Entertainment expenses\n\n**🚗 Transportation:**\n• Fuel/petrol costs\n• Public transport fares\n• Car maintenance averages\n\n**📊 Financial Planning:**\n• Budget recommendations\n• Cost-saving tips\n• Investment property analysis\n\nWhat specific item or service price would you like to research?";
    }
    
    return "I'm in Market Research mode! 🏪 I can help you with:\n• Rent prices in any area\n• Average utility costs\n• Grocery price comparisons\n• Transportation expenses\n• Investment property analysis\n\nWhat would you like to research?";
  };

  // ========== GROUP FINANCE FUNCTIONS ==========
  const generateGroupResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    const numbers = extractNumbers(userMessage);
    const { currency } = extractAmountAndCurrency(userMessage);
    const curr = currency || collectedData.currency || 'AED';
    
    if ((lowerMsg.includes('split') || lowerMsg.includes('bill') || lowerMsg.includes('dinner') || lowerMsg.includes('restaurant')) && 
        numbers && numbers.length >= 2) {
      
      const totalBill = numbers[0];
      const numberOfPeople = numbers[1];
      
      if (numberOfPeople > 0) {
        const perPerson = totalBill / numberOfPeople;
        const formattedPerPerson = formatCurrency(perPerson, curr);
        const formattedTotal = formatCurrency(totalBill, curr);
        
        return `🍽️ **Bill Splitting Solution:**\n\nTotal Bill: ${formattedTotal}\nNumber of People: ${numberOfPeople}\n\n**Each Person Pays:** ${formattedPerPerson}\n\n💡 **Tip:** Use the "Shared Room" feature to track this payment and remind your friend who can't pay now!`;
      }
    }
    
    return "I'm in Group Finance mode! 👥 I can help with:\n• Splitting bills with friends\n• Planning trips with budgets\n• Roommate expense sharing\n• Wedding/event budget tracking\n• Debt settlement calculations\n\nTell me about your group situation!";
  };

  // ========== EDUCATION FUNCTIONS ==========
  const generateEducationResponse = (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    
    if (lowerMsg.includes('budget') || lowerMsg.includes('save')) {
      return "📚 **Budgeting Basics:**\n\n1. **50/30/20 Rule:**\n   • 50% for needs (rent, food, bills)\n   • 30% for wants (entertainment, dining)\n   • 20% for savings & debt repayment\n\n2. **Pay Yourself First:** Automatically save 20% of income\n3. **Track Every Expense** for 30 days to identify leaks\n4. **Set SMART Goals:** Specific, Measurable, Achievable, Relevant, Time-bound\n\nWant to learn about investing or debt management?";
    }
    
    if (lowerMsg.includes('invest') || lowerMsg.includes('stock') || lowerMsg.includes('crypto')) {
      return "📈 **Investment Education:**\n\n**Start with:**\n1. **Emergency Fund:** 3-6 months of expenses\n2. **Retirement Accounts:** Maximize employer matches\n3. **Index Funds:** Low-cost, diversified\n4. **Dollar-Cost Averaging:** Invest regularly\n\n**Golden Rules:**\n• Don't invest what you can't afford to lose\n• Diversify across asset classes\n• Think long-term (5+ years)\n• Avoid emotional decisions\n\nNeed beginner investment strategies?";
    }
    
    return "I'm in Education Mode! 📚 I can teach you about:\n• Budgeting fundamentals\n• Saving strategies\n• Investing basics\n• Debt management\n• Credit scores\n• Financial planning\n\nWhat financial topic would you like to learn about?";
  };

    // ========== MAIN RESPONSE GENERATOR ==========
 const generateResponse = (userMessage, stage) => {
    if (mode === 'daily') {
      const result = generateDailyResponse(userMessage);
      return { 
        response: result.response, 
        options: result.actions || null, 
        nextStage: stage 
      };
    }
    if (currentMode === 'market') {
      return { response: generateMarketResponse(userMessage), nextStage: stage };
    }
    if (currentMode === 'group') {
      return { response: generateGroupResponse(userMessage), nextStage: stage };
    }
    if (currentMode === 'education') {
      return { response: generateEducationResponse(userMessage), nextStage: stage };
    }
    return generateWizardResponse(userMessage, stage);
};

   // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completeTimeoutRef.current) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, []);
  
  // ========== EVENT HANDLERS ==========
  const handleUserResponse = (inputText = null) => {
    const message = inputText || userInput;
    if (!message.trim()) return;
      
     // 🛡️ Prevent concurrent processing (fixes voice double‑fire reset)
    if (isProcessing) {
      console.log('⏳ Already processing, ignoring:', message);
      return;
    }

    if (conversationEnded) {
      addAIMessage("Your setup is complete! You can go to your dashboard now.", null, '🤖');
      return;
    }

    // ========== CHECK FOR CORRECTIONS FIRST ==========
    const correction = detectAndApplyCorrection(message, [], recentTransactions);
    
    if (correction.corrected) {
      // Add user message
      addUserMessage(message, activeInputTab === 'voice' ? '🎤' : '👤');
      
      // Add correction response
      addAIMessage(correction.response);
      
      // Also add a helpful follow-up
      setTimeout(() => {
        addAIMessage(`📝 **Need to correct something else?** Just say:\n• "Actually it was X"\n• "Change it to Y"\n• "I meant Z"\n\nOr continue with your financial planning!`);
      }, 1500);
      
      setUserInput('');
      setActiveInputTab('text');
      return;
    }
    
    // ========== NORMAL PROCESSING (if no correction detected) ==========
    addUserMessage(message, activeInputTab === 'voice' ? '🎤' : '👤');
    setIsProcessing(true);
    
      setTimeout(() => {
           const { response, nextStage, options } = generateResponse(message, stageRef.current);
      
      if (response) {
        addAIMessage(response, options);
        
        // If this response created a transaction, try to track it for future corrections
        // Look for amount patterns in the response to detect what was added
        const amountMatch = message.match(/(\d+(?:\.\d+)?)/);
        if (amountMatch && (message.includes('spent') || message.includes('bought') || message.includes('paid') || message.includes('expense'))) {
          const newAmount = parseFloat(amountMatch[1]);
          if (!isNaN(newAmount)) {
            const description = extractExpenseDescription(message);
            setLastTransactions(prev => [{
              id: `temp_${Date.now()}`,
              description: description,
              amount: newAmount,
              type: 'expense',
              category: detectExpenseCategory(message),
              date: new Date().toISOString()
            }, ...prev].slice(0, 5));
          }
        }
      }
      
      setConversationStage(nextStage);
      setIsProcessing(false);
      setActiveInputTab('text');
      
      // ⚠️ COMMENTED OUT: This was calling onComplete too early
// Update parent component with intermediate data
// if (onComplete && conversationStage !== CONVERSATION_STATES.SUMMARY) {
//   const intermediateData = {
//     ...collectedData,
//     setupInProgress: true,
//     currentStage: nextStage
//   };
//   onComplete(intermediateData);
// }
    }, 800);
    
    setUserInput('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && userInput.trim()) {
      handleUserResponse();
    }
  };

  // Quick actions for chat
  const quickActions = [
    { text: "💰 Log Expense", example: "Coffee 15 AED", icon: "💰" },
    { text: "💸 Add Income", example: "Salary 5000", icon: "💸" },
    { text: "🎯 Wishlist", example: "New phone", icon: "🎯" },
    { text: "🏪 Research", example: "Rent prices", icon: "🏪" },
    { text: "📊 Balance", example: "How much left?", icon: "📊" },
    { text: "📜 History", example: "Last week expenses", icon: "📜" }
  ];

  // Helper for UI
  const getProgressPercentage = (stage) => {
    if (mode === 'daily') return 0;
    const stageOrder = [
      CONVERSATION_STATES.WELCOME,
      CONVERSATION_STATES.USER_TYPE,
      CONVERSATION_STATES.EMPLOYED_JOB_COUNT,
      CONVERSATION_STATES.EMPLOYED_JOB_AMOUNT,
      CONVERSATION_STATES.EMPLOYED_JOB_FREQUENCY,
      CONVERSATION_STATES.EMPLOYED_JOB_PAYDAY,
      CONVERSATION_STATES.EMPLOYED_JOB_RECEIVED,
      CONVERSATION_STATES.HOUSEHOLD_BUDGET,
      CONVERSATION_STATES.RENT_EXPENSES,
      CONVERSATION_STATES.FOOD_EXPENSES,
      CONVERSATION_STATES.TRANSPORT_EXPENSES,
      CONVERSATION_STATES.OTHER_EXPENSES,
      CONVERSATION_STATES.SAVINGS_GOAL,
      CONVERSATION_STATES.SAVINGS_CONFIRMATION,
      CONVERSATION_STATES.WISHLIST_SETUP,
      CONVERSATION_STATES.SUMMARY
    ];

    const index = stageOrder.indexOf(stage);
    return Math.max(10, Math.min(90, ((index + 1) / stageOrder.length) * 100));
  };

  const getProgressText = (stage) => {
    const stageNames = {
      [CONVERSATION_STATES.WELCOME]: 'Step 1: Welcome',
      [CONVERSATION_STATES.USER_TYPE]: 'Step 2: Understanding you',
      [CONVERSATION_STATES.EMPLOYED_JOB_COUNT]: 'Step 3: Job count',
      [CONVERSATION_STATES.EMPLOYED_JOB_AMOUNT]: 'Step 4: Job income',
      [CONVERSATION_STATES.EMPLOYED_JOB_FREQUENCY]: 'Step 5: Pay frequency',
      [CONVERSATION_STATES.EMPLOYED_JOB_PAYDAY]: 'Step 6: Payday',
      [CONVERSATION_STATES.EMPLOYED_JOB_RECEIVED]: 'Step 7: Payment status',
      [CONVERSATION_STATES.RENT_EXPENSES]: 'Step 8: Housing costs',
      [CONVERSATION_STATES.FOOD_EXPENSES]: 'Step 9: Food expenses',
      [CONVERSATION_STATES.TRANSPORT_EXPENSES]: 'Step 10: Transportation',
      [CONVERSATION_STATES.OTHER_EXPENSES]: 'Step 11: Other expenses',
      [CONVERSATION_STATES.SAVINGS_GOAL]: 'Step 12: Savings goals',
      [CONVERSATION_STATES.SAVINGS_CONFIRMATION]: 'Step 13: Confirm savings',
      [CONVERSATION_STATES.WISHLIST_SETUP]: 'Step 14: Wishlist goals',
      [CONVERSATION_STATES.SUMMARY]: 'Final: Your plan'
    };
    
    return stageNames[stage] || 'Financial planning';
  };

  return (
    <div>
      {/* Error Message Overlay */}
      {errorMessage && (
        <div className="welcome-error">
          <div>⚠️</div>
          {errorMessage}
          <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#7f1d1d' }}>
            Example: "I'm a retired person living on savings"
          </div>
        </div>
      )}
      
      {/* Welcome Screen - only shown in onboarding mode */}
      {mode === 'onboarding' && (!welcomeComplete || isTransitioning) && (
        <div className={`welcome-screen ${isTransitioning ? 'fade-out' : ''}`}>
          {isTransitioning && (
            <div className="loading-overlay">
              <div className="loading-content">
                <div className="loading-icon">⏳</div>
                <div style={{ marginTop: '20px', fontWeight: 'bold', color: '#667eea' }}>
                  Setting up your financial plan...
                </div>
              </div>
            </div>
          )}
          <div className="welcome-message">
            <h1 className="welcome-title">👋 Welcome to Centsible Financial Setup!</h1>
            <p className="welcome-subtitle">
              I'm your AI financial mentor. Let me show you what I can do:
            </p>
            
            <div className="features-grid">
              <div className="feature-item">
                <span>💰</span>
                <span>Track multiple income sources</span>
              </div>
              <div className="feature-item">
                <span>📅</span>
                <span>Set up payday reminders</span>
              </div>
              <div className="feature-item">
                <span>🏠</span>
                <span>Manage all your expenses</span>
              </div>
              <div className="feature-item">
                <span>🎯</span>
                <span>Set savings goals</span>
              </div>
              <div className="feature-item">
                <span>📱</span>
                <span>Real-time dashboard</span>
              </div>
            </div>
            
            <p className="welcome-subtitle">
              Let's start with your financial situation. <strong>What best describes you?</strong>
            </p>
          </div>
          
          <div className="situation-selector">
            <h2 className="situation-title">Choose Your Financial Profile:</h2>
            
            <div className="situations-grid">
              <div 
                className={`situation-card ${selectedSituation === 'student' ? 'active' : ''}`}
                onClick={() => handleSituationSelect('student')}
              >
                <div className="situation-emoji">🎓</div>
                <div className="situation-label">Student</div>
                <div className="situation-description">Getting allowance/part-time</div>
              </div>
              
              <div 
                className={`situation-card ${selectedSituation === 'employed' ? 'active' : ''}`}
                onClick={() => handleSituationSelect('employed')}
              >
                <div className="situation-emoji">💼</div>
                <div className="situation-label">Employed</div>
                <div className="situation-description">Regular salary job(s)</div>
              </div>
              
              <div 
                className={`situation-card ${selectedSituation === 'freelancer' ? 'active' : ''}`}
                onClick={() => handleSituationSelect('freelancer')}
              >
                <div className="situation-emoji">🎨</div>
                <div className="situation-label">Freelancer</div>
                <div className="situation-description">Variable/commission income</div>
              </div>
              
              <div 
                className={`situation-card ${selectedSituation === 'homemaker' ? 'active' : ''}`}
                onClick={() => handleSituationSelect('homemaker')}
              >
                <div className="situation-emoji">🏠</div>
                <div className="situation-label">Homemaker</div>
                <div className="situation-description">Managing household budget</div>
              </div>
              
              <div 
                className={`situation-card ${selectedSituation === 'other' ? 'active' : ''}`}
                onClick={() => handleSituationSelect('other')}
              >
                <div className="situation-emoji">🔄</div>
                <div className="situation-label">Other</div>
                <div className="situation-description">Tell me about your situation</div>
              </div>
            </div>
            
            {selectedSituation === 'other' && (
              <div className="other-option">
                <div className="other-input-container">
                  <input 
                    type="text" 
                    value={customSituation}
                    onChange={(e) => setCustomSituation(e.target.value)}
                    placeholder="Describe your financial situation..." 
                    onKeyPress={(e) => e.key === 'Enter' && handleStartSetup()}
                  />
                  <button 
                    className="start-button" 
                    onClick={handleStartSetup}
                    disabled={!customSituation.trim()}
                  >
                    <span>Start Setup</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            )}
            
            {selectedSituation && selectedSituation !== 'other' && (
              <button 
                className="start-button" 
                onClick={handleStartSetup}
              >
                <span>Continue as {
                  selectedSituation === 'student' ? 'Student' :
                  selectedSituation === 'employed' ? 'Employed' :
                  selectedSituation === 'freelancer' ? 'Freelancer' :
                  selectedSituation === 'homemaker' ? 'Homemaker' : 'User'
                }</span>
                <span>→</span>
              </button>
            )}
          </div>
          
          <div className="welcome-progress">
            <div className="progress-dots">
              <div className="progress-dot active"></div>
              <div className="progress-dot"></div>
              <div className="progress-dot"></div>
              <div className="progress-dot"></div>
            </div>
            <span className="progress-text">Step 1 of 4</span>
          </div>
        </div>
      )}
      
            {/* Chat Interface - shown when welcome complete OR in daily mode */}
      {(mode === 'daily' || (welcomeComplete && !isTransitioning)) && (
        <div className="ai-conversation-wizard">
                   {mode === 'onboarding' && (
            <button 
              className="mode-toggle"
              onClick={() => setShowModeSelector(!showModeSelector)}
            >
              {showModeSelector ? '× Close' : `↻ ${currentMode.charAt(0).toUpperCase() + currentMode.slice(1)} Mode`}
            </button>
          )}
          
          <div className="conversation-header">
            <h3>🤖 Centsible AI 
              {currentMode === 'market' && ' 🏪 Market Researcher'}
              {currentMode === 'group' && ' 👥 Group Finance'}
              {currentMode === 'education' && ' 📚 Educator'}
              {currentMode === 'mentor' && ' Mentor'}
            </h3>
            <p>
              {currentMode === 'market' && 'Researching prices and costs...'}
              {currentMode === 'group' && 'Helping with group finances...'}
              {currentMode === 'education' && 'Teaching financial concepts...'}
              {currentMode === 'mentor' && 'Your financial assistant with text, voice & receipt scan'}
            </p>
            <div className="stage-indicator">
              {currentMode === 'mentor' ? getProgressText(conversationStage) : currentMode}
            </div>
          </div>

          {showModeSelector && (
            <div className="mode-selector">
              <h4>Switch AI Mode:</h4>
              <div className="mode-buttons">
                <button 
                  className={`mode-btn ${currentMode === 'mentor' ? 'active' : ''}`}
                  onClick={() => {setCurrentMode('mentor'); setShowModeSelector(false);}}
                >
                  👨‍🏫 Mentor
                </button>
                <button 
                  className={`mode-btn ${currentMode === 'market' ? 'active' : ''}`}
                  onClick={() => {setCurrentMode('market'); setShowModeSelector(false);}}
                >
                  🏪 Market
                </button>
                <button 
                  className={`mode-btn ${currentMode === 'group' ? 'active' : ''}`}
                  onClick={() => {setCurrentMode('group'); setShowModeSelector(false);}}
                >
                  👥 Group
                </button>
                <button 
                  className={`mode-btn ${currentMode === 'education' ? 'active' : ''}`}
                  onClick={() => {setCurrentMode('education'); setShowModeSelector(false);}}
                >
                  📚 Education
                </button>
              </div>
            </div>
          )}

          <div className="conversation-messages">
            {conversation.map((msg, index) => (
              <div key={index} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.icon || (msg.role === 'ai' ? '🤖' : '👤')}
                </div>
                <div className="message-content">
                  <div className="message-text">
                    {msg.message.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                  {msg.options && (
                    <div className="message-options">
                      {msg.options.map((option, idx) => (
                        <button
                          key={idx}
                          className="option-button"
                          onClick={() => {
                            if (option.action) {
                              handleReceiptAction(option.action, option.data);
                            } else {
                              setUserInput(option.text);
                              setTimeout(() => handleUserResponse(option.text), 300);
                            }
                          }}
                        >
                          {option.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          
         {mode === 'daily' && (
  <div className="quick-actions-bar">
    {quickActions.map((action, idx) => (
      <button
        key={idx}
        className="quick-chip"
        onClick={() => {
          setUserInput(action.example);
          setTimeout(() => handleUserResponse(action.example), 300);
        }}
      >
        <span className="chip-icon">{action.icon}</span>
        <span className="chip-text">{action.text}</span>
      </button>
    ))}
  </div>
)}
          
          <div className="input-tabs">
  <button 
    className={`tab-button ${activeInputTab === 'text' ? 'active' : ''}`}
    onClick={() => setActiveInputTab('text')}
  >
    💬 Text
  </button>
  <button 
    className={`tab-button ${activeInputTab === 'voice' ? 'active' : ''}`}
    onClick={startVoiceInput}
    disabled={isListening}
  >
    {isListening ? '🎤 Listening...' : '🎤 Voice'}
  </button>
  {/* Only show receipt scanner in daily mode */}
  {mode === 'daily' && (
    <button 
      className={`tab-button ${activeInputTab === 'receipt' ? 'active' : ''}`}
      onClick={() => {
        setActiveInputTab('receipt');
        fileInputRef.current?.click();
      }}
    >
      📸 Receipt
    </button>
  )}
</div>
          
          <div className="conversation-input">
            {conversationEnded ? (
              <div className="completion-message">
                <div style={{ fontSize: '3rem', marginBottom: '20px' }}>✅</div>
                <h3>Setup Complete!</h3>
                <p>Your financial dashboard is ready.</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    className="start-button"
                    onClick={() => {
                      if (completeTimeoutRef.current) {
                        clearTimeout(completeTimeoutRef.current);
                        completeTimeoutRef.current = null;
                      }
                      if (onComplete) {
                        onComplete({ ...collectedData, setupComplete: true });
                      }
                    }}
                  >
                    Go to Dashboard →
                  </button>
                  <button
                    className="start-button secondary"
                    onClick={() => {
                      if (completeTimeoutRef.current) {
                        clearTimeout(completeTimeoutRef.current);
                        completeTimeoutRef.current = null;
                      }
                      setConversationEnded(false);
                      setWelcomeComplete(false);
                      setSelectedSituation(null);
                      setCustomSituation('');
                      setConversation([]);
                      setConversationStage(CONVERSATION_STATES.WELCOME);
                      setCollectedData({
                        userType: '',
                        income: { sources: [], total: 0 },
                        expenses: [],
                        bills: [],
                        goals: [],
                        reminders: [],
                        wishlist: [],
                        savingsGoal: 0,
                        currency: userData?.currency || 'AED',
                        conversationContext: {
                          currentIncomeIndex: 0,
                          totalJobsToAsk: 0,
                          currentJobData: null,
                          waitingForJobCount: false,
                          currentExpenseIndex: 0,
                          tempJobData: null
                        }
                      });
                    }}
                  >
                    ↻ Start Over
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* === TEXT INPUT TAB === */}
                {activeInputTab === 'text' && (
                  <div className="input-container">
                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={
                        currentMode === 'market' ? "Ask about prices, costs, research..." :
                        currentMode === 'group' ? "Ask about group expenses, splitting bills..." :
                        currentMode === 'education' ? "Ask about financial concepts, learning..." :
                        "Type your message... (e.g., 'I spent 50 on lunch', 'Add iPhone to wishlist', 'How much rent?')"
                      }
                      autoFocus
                    />
                    <div className="input-actions">
                      <button 
                        className={`voice-button ${isListening ? 'listening' : ''}`}
                        onClick={startVoiceInput}
                        type="button"
                      >
                        {isListening ? '🎤 Listening...' : '🎤 Speak'}
                      </button>
                      <button 
                        className="send-button"
                        onClick={() => handleUserResponse()}
                        disabled={!userInput.trim() || isProcessing}
                      >
                        {isProcessing ? 'Processing...' : 'Send →'}
                      </button>
                    </div>
                  </div>
                )}

                {/* === VOICE INPUT TAB === */}
                {activeInputTab === 'voice' && (
                  <div className="voice-input-container">
                    <div className={`voice-visualizer ${isListening ? 'active' : ''}`}>
                      <div className="voice-bars">
                        <span className="bar"></span>
                        <span className="bar"></span>
                        <span className="bar"></span>
                        <span className="bar"></span>
                        <span className="bar"></span>
                      </div>
                      <p className="voice-instruction">
                        {isListening ? 'Speak now...' : 'Click microphone to start speaking'}
                      </p>
                      <div className="voice-actions">
                        <button
                          type="button"
                          className={`voice-action-button ${isListening ? 'stop' : 'start'}`}
                          onClick={isListening ? stopVoiceInput : startVoiceInput}
                        >
                          {isListening ? '⏹️ Stop' : '🎤 Start Speaking'}
                        </button>
                        {userInput && !isListening && userInput !== "🎤 Listening..." && (
                          <button
                            type="button"
                            className="voice-action-button process"
                            onClick={() => handleUserResponse()}
                          >
                            ✅ Process: "{userInput.substring(0, 30)}..."
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* === RECEIPT INPUT TAB === */}
                {activeInputTab === 'receipt' && (
                  <div className="receipt-input-container">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleReceiptUpload}
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                    />
                    {receiptPreview ? (
                      <div className="receipt-preview">
                        <div className="receipt-image-container">
                          <img src={receiptPreview} alt="Receipt preview" />
                          {isScanning && (
                            <div className="scanning-overlay">
                              <div className="scanning-progress">
                                <div 
                                  className="progress-bar" 
                                  style={{ width: `${scanProgress}%` }}
                                ></div>
                                <span className="progress-text">Scanning... {scanProgress}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="receipt-actions">
                          <button
                            type="button"
                            className="receipt-action-button retake"
                            onClick={() => {
                              setReceiptImage(null);
                              setReceiptPreview(null);
                              setExtractedText('');
                              fileInputRef.current.value = '';
                              fileInputRef.current?.click();
                            }}
                          >
                            🔄 Retake Photo
                          </button>
                          <button
                            type="button"
                            className="receipt-action-button manual"
                            onClick={() => setActiveInputTab('text')}
                          >
                            📝 Enter Manually
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="receipt-upload-area"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="upload-icon">📸</div>
                        <h4>Upload Receipt Photo</h4>
                        <p>Take a clear photo of your receipt</p>
                        <ul className="upload-tips">
                          <li>✅ Good lighting</li>
                          <li>✅ Flat surface</li>
                          <li>✅ No glare</li>
                          <li>✅ Include total amount</li>
                          <li>📱 For online receipts: take a screenshot</li>
                        </ul>
                        <button type="button" className="upload-button">
                          📷 Take Photo or Choose File
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="input-hint">
                  <span className="hint-icon">💡</span>
                  <span>
                    {activeInputTab === 'text' && "Try: 'Spent 75 on groceries', 'Salary 5000', 'Want iPhone 15', 'How much rent?'"}
                    {activeInputTab === 'voice' && "Say: 'I spent twenty on coffee', 'My salary is five thousand', 'Add laptop to wishlist'"}
                    {activeInputTab === 'receipt' && "Take a clear photo of any receipt. I'll extract the amount and details automatically."}
                  </span>
                </div>

                {mode === 'onboarding' && currentMode === 'mentor' && (
                  <div className="progress-indicator">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ width: `${getProgressPercentage(conversationStage)}%` }}
                      ></div>
                    </div>
                    <div className="progress-text">
                      {getProgressText(conversationStage)}
                    </div>
                  </div>
                )}
              </>
            )}
                    </div>
        </div>
      )}
    </div>
  );
}

export default AIConversationWizard;