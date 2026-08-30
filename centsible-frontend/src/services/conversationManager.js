// conversationManager.js
import { CONVERSATION_STATES, USER_TYPES, INCOME_FREQUENCY } from './conversationStates';
import { parseDate, parseFrequency, parseFinancialAmount } from './nlpParser';
import { createIncomeSource } from './conversationContext';

export class ConversationManager {
  constructor(context, updateCallback) {
    this.context = context;
    this.updateContext = updateCallback;
    this.history = [];
  }
  
  async processUserMessage(message) {
    this.history.push({ role: 'user', message, timestamp: new Date() });
    
    // Get current state
    const currentState = this.context.conversationState;
    
    // Process based on state
    let response;
    switch (currentState) {
      case CONVERSATION_STATES.WELCOME:
        response = this.handleWelcome(message);
        break;
      case CONVERSATION_STATES.USER_TYPE:
        response = this.handleUserType(message);
        break;
      case CONVERSATION_STATES.INCOME_SOURCES_COUNT:
        response = this.handleIncomeSourcesCount(message);
        break;
      case CONVERSATION_STATES.INCOME_SOURCE_AMOUNT:
        response = this.handleIncomeSourceAmount(message);
        break;
      case CONVERSATION_STATES.INCOME_SOURCE_FREQUENCY:
        response = this.handleIncomeSourceFrequency(message);
        break;
      case CONVERSATION_STATES.INCOME_SOURCE_PAYDAY:
        response = this.handleIncomeSourcePayday(message);
        break;
      case CONVERSATION_STATES.INCOME_SOURCE_RECEIVED:
        response = this.handleIncomeSourceReceived(message);
        break;
      // Add more cases for other states
      default:
        response = this.handleUnknownState(message);
    }
    
    this.history.push({ role: 'ai', message: response.text, timestamp: new Date() });
    return response;
  }
  
  handleWelcome(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('start') || lowerMsg.includes('begin') || lowerMsg.includes('yes')) {
      this.updateContext({
        conversationState: CONVERSATION_STATES.USER_TYPE
      });
      
      return {
        text: `🎉 **Great! Let's set up your financial dashboard.**\n\n` +
              `**First, tell me about yourself:**\n\n` +
              `🎓 **Student** - Getting allowance/part-time\n` +
              `💼 **Employed** - Regular salary job(s)\n` +
              `🎨 **Freelancer** - Variable/commission income\n` +
              `🏠 **Homemaker** - Managing household budget\n` +
              `🔄 **Other** - Tell me about your situation\n\n` +
              `**Which one sounds like you?**`,
        actions: [
          { text: '🎓 Student', action: 'select_user_type', data: { type: USER_TYPES.STUDENT } },
          { text: '💼 Employed', action: 'select_user_type', data: { type: USER_TYPES.EMPLOYED } },
          { text: '🎨 Freelancer', action: 'select_user_type', data: { type: USER_TYPES.FREELANCER } },
          { text: '🏠 Homemaker', action: 'select_user_type', data: { type: USER_TYPES.HOMEMAKER } }
        ]
      };
    }
    
    return {
      text: `👋 **Welcome to Centsible!**\n\n` +
            `I'm your AI financial mentor. I'll help you:\n\n` +
            `💰 **Track multiple income sources** with payday reminders\n` +
            `📅 **Schedule all your expenses** with due date alerts\n` +
            `🎯 **Set savings goals** and track your progress\n` +
            `📊 **See real-time calculations** of your monthly budget\n` +
            `🔔 **Get smart reminders** for bills and income\n\n` +
            `Ready to set up your personalized dashboard?`,
      actions: [
        { text: '🚀 Start Setup', action: 'start_setup' }
      ]
    };
  }
  
  handleUserType(message) {
    const lowerMsg = message.toLowerCase();
    let userType = '';
    
    if (lowerMsg.includes('student')) userType = USER_TYPES.STUDENT;
    else if (lowerMsg.includes('employ') || lowerMsg.includes('job') || lowerMsg.includes('work')) userType = USER_TYPES.EMPLOYED;
    else if (lowerMsg.includes('freelance') || lowerMsg.includes('gig') || lowerMsg.includes('commission')) userType = USER_TYPES.FREELANCER;
    else if (lowerMsg.includes('home') || lowerMsg.includes('house') || lowerMsg.includes('manage')) userType = USER_TYPES.HOMEMAKER;
    else userType = USER_TYPES.OTHER;
    
    this.updateContext({
      userType,
      conversationState: CONVERSATION_STATES.INCOME_SOURCES_COUNT,
      multiStep: {
        ...this.context.multiStep,
        currentIncomeIndex: 0,
        totalIncomeSources: 0
      }
    });
    
    // Different questions based on user type
    if (userType === USER_TYPES.STUDENT) {
      return {
        text: `🎓 **Student setup!**\n\n` +
              `**How many sources of income do you have?**\n\n` +
              `For example:\n` +
              `• Parents allowance\n` +
              `• Part-time job\n` +
              `• Scholarships\n` +
              `• Occasional gigs\n\n` +
              `Just tell me the number (like "2" or "I have 3 sources").`,
        actions: []
      };
    } else if (userType === USER_TYPES.EMPLOYED) {
      return {
        text: `💼 **Employment setup!**\n\n` +
              `**How many jobs do you have?**\n\n` +
              `We'll set up each job separately with:\n` +
              `• Monthly/Weekly salary\n` +
              `• Payday tracking\n` +
              `• Reminders for next payment\n\n` +
              `Just say the number (like "2 jobs" or "I work 3 jobs").`,
        actions: []
      };
    } else if (userType === USER_TYPES.FREELANCER) {
      return {
        text: `🎨 **Freelancer setup!**\n\n` +
              `**How many different income streams do you have?**\n\n` +
              `Examples:\n` +
              `• 1 (all from freelancing)\n` +
              `• 2 (freelance + side gig)\n` +
              `• 3 or more\n\n` +
              `Just say the number.`,
        actions: []
      };
    } else if (userType === USER_TYPES.HOMEMAKER) {
      return {
        text: `🏠 **Homemaker setup!**\n\n` +
              `**How many sources of income does your household have?**\n\n` +
              `This could include:\n` +
              `• Spouse/partner salary\n` +
              `• Rental income\n` +
              `• Allowances\n\n` +
              `Just tell me the number.`,
        actions: []
      };
    } else {
      // OTHER
      return {
        text: `🔄 **Custom setup!**\n\n` +
              `**How many sources of income do you have?**\n\n` +
              `We'll go through each one step by step.`,
        actions: []
      };
    }
  }
  
  handleIncomeSourcesCount(message) {
    const numbers = message.match(/\d+/g);
    const count = numbers ? parseInt(numbers[0]) : 1;
    
    if (count <= 0) {
      return {
        text: `💰 **No income sources?**\n\n` +
              `That's okay! Let's still set up your expenses and savings goals.\n\n` +
              `Should we proceed to expenses?`,
        actions: [
          { text: '✅ Yes, continue', action: 'skip_to_expenses' },
          { text: '↩️ Actually, I have income', action: 'redo_income_count' }
        ]
      };
    }
    
    this.updateContext({
      conversationState: CONVERSATION_STATES.INCOME_SOURCE_AMOUNT,
      multiStep: {
        ...this.context.multiStep,
        totalIncomeSources: count,
        currentIncomeIndex: 1,
        currentSourceName: this.getSourceName(1, this.context.userType)
      }
    });
    
    return {
      text: `✅ **Got it! ${count} income source${count > 1 ? 's' : ''}.**\n\n` +
            `Let's start with **${this.getSourceName(1, this.context.userType)}**:\n\n` +
            `**How much do you get from this?**\n\n` +
            `Examples:\n` +
            `• "5000 AED per month"\n` +
            `• "I get 3000 monthly"\n` +
            `• "Around 1000"\n` +
            `• "It's commission based, about 2000 per project"`,
      actions: []
    };
  }
  
  handleIncomeSourceAmount(message) {
    const parsedAmount = parseFinancialAmount(message);
    const currentIndex = this.context.multiStep.currentIncomeIndex;
    const totalSources = this.context.multiStep.totalIncomeSources;
    
    if (!parsedAmount || !parsedAmount.amount) {
      return {
        text: `💰 **I need to know the amount.**\n\n` +
              `For **${this.context.multiStep.currentSourceName}**, how much do you get?\n\n` +
              `Please give me a number:\n` +
              `• "5000 AED"\n` +
              `• "My salary is 3000"\n` +
              `• "Around 1000 per month"`,
        actions: []
      };
    }
    
    // Store temporary data
    this.updateContext({
      contextMemory: {
        ...this.context.contextMemory,
        dataToConfirm: {
          ...this.context.contextMemory.dataToConfirm,
          currentIncomeSource: {
            index: currentIndex,
            amount: parsedAmount.amount,
            currency: parsedAmount.currency
          }
        }
      },
      conversationState: CONVERSATION_STATES.INCOME_SOURCE_FREQUENCY
    });
    
    return {
      text: `✅ **${parsedAmount.amount} ${parsedAmount.currency} saved!**\n\n` +
            `**How often do you get this income?**\n\n` +
            `Is it:\n` +
            `• Monthly (once a month)\n` +
            `• Weekly (every week)\n` +
            `• Bi-weekly (every 2 weeks)\n` +
            `• Commission/Project based\n` +
            `• Allowance (when parents give you)\n` +
            `• Irregular (not fixed schedule)`,
      actions: [
        { text: '📅 Monthly', action: 'select_frequency', data: { frequency: INCOME_FREQUENCY.MONTHLY } },
        { text: '📅 Weekly', action: 'select_frequency', data: { frequency: INCOME_FREQUENCY.WEEKLY } },
        { text: '🎨 Commission', action: 'select_frequency', data: { frequency: INCOME_FREQUENCY.COMMISSION } },
        { text: '🔄 Irregular', action: 'select_frequency', data: { frequency: INCOME_FREQUENCY.IRREGULAR } }
      ]
    };
  }
  
  handleIncomeSourceFrequency(message) {
    const parsedFrequency = parseFrequency(message);
    const currentSource = this.context.contextMemory.dataToConfirm.currentIncomeSource;
    
    if (!parsedFrequency || parsedFrequency.type === 'unknown') {
      return {
        text: `📅 **I need to know how often you get paid.**\n\n` +
              `For **${currentSource.amount} ${currentSource.currency}**, is it:\n\n` +
              `• **Monthly** - Once a month\n` +
              `• **Weekly** - Every week\n` +
              `• **Bi-weekly** - Every 2 weeks\n` +
              `• **Commission** - When you make a sale\n` +
              `• **Allowance** - When parents give you\n` +
              `• **Irregular** - No fixed schedule`,
        actions: []
      };
    }
    
    // Update temporary data
    this.updateContext({
      contextMemory: {
        ...this.context.contextMemory,
        dataToConfirm: {
          ...this.context.contextMemory.dataToConfirm,
          currentIncomeSource: {
            ...currentSource,
            frequency: parsedFrequency.type
          }
        }
      },
      conversationState: CONVERSATION_STATES.INCOME_SOURCE_PAYDAY
    });
    
    let frequencyQuestion = '';
    if (parsedFrequency.type === INCOME_FREQUENCY.COMMISSION) {
      frequencyQuestion = `**When do you typically receive commission payments?**\n\n` +
                         `After completing a project? End of month?`;
    } else if (parsedFrequency.type === INCOME_FREQUENCY.ALLOWANCE) {
      frequencyQuestion = `**When do you usually get your allowance?**\n\n` +
                         `Beginning of month? Every Friday?`;
    } else {
      frequencyQuestion = `**When is your next payday for this?**\n\n` +
                         `Examples:\n` +
                         `• "Next Friday"\n` +
                         `• "15th of each month"\n` +
                         `• "End of month"\n` +
                         `• "I just got paid today"`;
    }
    
    return {
      text: `✅ **${parsedFrequency.type.replace('_', ' ')} frequency saved!**\n\n` +
            frequencyQuestion,
      actions: []
    };
  }
  
  handleIncomeSourcePayday(message) {
    const parsedDate = parseDate(message);
    const currentSource = this.context.contextMemory.dataToConfirm.currentIncomeSource;
    const currentIndex = this.context.multiStep.currentIncomeIndex;
    const totalSources = this.context.multiStep.totalIncomeSources;
    
    let receivedStatus = 'unknown';
    let dateText = 'Not specified';
    
    if (parsedDate) {
      const now = new Date();
      const isPast = parsedDate.date < now;
      receivedStatus = isPast ? 'received' : 'pending';
      dateText = parsedDate.text;
    }
    
    // Update temporary data
    this.updateContext({
      contextMemory: {
        ...this.context.contextMemory,
        dataToConfirm: {
          ...this.context.contextMemory.dataToConfirm,
          currentIncomeSource: {
            ...currentSource,
            nextPayDate: parsedDate?.date || null,
            payDayText: dateText,
            receivedStatus
          }
        }
      },
      conversationState: CONVERSATION_STATES.INCOME_SOURCE_RECEIVED
    });
    
    let question = '';
    if (receivedStatus === 'received') {
      question = `✅ **Payday noted: ${dateText}**\n\n` +
                `**Have you already received this payment?**\n\n` +
                `This helps me track what's already in your account.`;
    } else if (receivedStatus === 'pending') {
      question = `📅 **Next payday: ${dateText}**\n\n` +
                `**Are you waiting for this payment, or have you already received it?**`;
    } else {
      question = `**Have you already been paid for this cycle?**\n\n` +
                `This helps me track what money you currently have available.`;
    }
    
    return {
      text: question,
      actions: [
        { text: '✅ Yes, received', action: 'confirm_received', data: { received: true } },
        { text: '⏳ Waiting for it', action: 'confirm_received', data: { received: false } },
        { text: '❓ Not sure', action: 'confirm_received', data: { received: null } }
      ]
    };
  }
  
  handleIncomeSourceReceived(message) {
    const currentSource = this.context.contextMemory.dataToConfirm.currentIncomeSource;
    const currentIndex = this.context.multiStep.currentIncomeIndex;
    const totalSources = this.context.multiStep.totalIncomeSources;
    
    let received = false;
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('yes') || lowerMsg.includes('received') || lowerMsg.includes('got')) {
      received = true;
    } else if (lowerMsg.includes('no') || lowerMsg.includes('waiting') || lowerMsg.includes('not yet')) {
      received = false;
    }
    
    // Create final income source
    const incomeSource = createIncomeSource({
      source: this.context.multiStep.currentSourceName,
      amount: currentSource.amount,
      currency: currentSource.currency,
      frequency: currentSource.frequency,
      nextPayDate: currentSource.nextPayDate,
      receivedThisCycle: received,
      isPrimary: currentIndex === 1,
      notes: `Payday: ${currentSource.payDayText || 'Not specified'}`
    });
    
    // Add to income sources
    const updatedIncomeSources = [...this.context.incomeSources, incomeSource];
    
    // Check if more income sources to ask about
    const hasMoreSources = currentIndex < totalSources;
    
    this.updateContext({
      incomeSources: updatedIncomeSources,
      contextMemory: {
        ...this.context.contextMemory,
        dataToConfirm: {
          ...this.context.contextMemory.dataToConfirm,
          currentIncomeSource: null
        }
      },
      multiStep: {
        ...this.context.multiStep,
        currentIncomeIndex: hasMoreSources ? currentIndex + 1 : 0,
        currentSourceName: hasMoreSources ? 
          this.getSourceName(currentIndex + 1, this.context.userType) : null
      },
      conversationState: hasMoreSources ? 
        CONVERSATION_STATES.INCOME_SOURCE_AMOUNT : 
        CONVERSATION_STATES.EXPENSE_CATEGORIES
    });
    
    if (hasMoreSources) {
      return {
        text: `✅ **${this.context.multiStep.currentSourceName} saved!**\n\n` +
              `Now let's talk about **${this.getSourceName(currentIndex + 1, this.context.userType)}**:\n\n` +
              `**How much do you get from this?**`,
        actions: []
      };
    } else {
      // Move to expenses
      return {
        text: `🎉 **All income sources saved!**\n\n` +
              `**Total Monthly Income:** ${this.calculateTotalIncome(updatedIncomeSources)} ${this.context.currency}\n\n` +
              `Now let's set up your **expenses**. First:\n\n` +
              `**Do you pay rent or have a mortgage?**\n\n` +
              `If yes, how much and when is it due?\n` +
              `If no, say "no rent" or "none"`,
        actions: []
      };
    }
  }

  handleUnknownState(message) {
    console.warn('Unknown conversation state:', this.context.conversationState);
    return {
      text: `I'm not sure what to do next. Let's restart the setup. What would you like to do?`,
      actions: [
        { text: '🔄 Start Over', action: 'restart_setup' }
      ]
    };
  }
  // ============================================

  
  // Helper methods
  getSourceName(index, userType) {
    switch (userType) {
      case USER_TYPES.STUDENT:
        const studentSources = ['Allowance', 'Part-time Job', 'Scholarship', 'Side Gig', 'Parents Support'];
        return studentSources[index - 1] || `Income Source ${index}`;
      case USER_TYPES.EMPLOYED:
        return `Job ${index}`;
      case USER_TYPES.FREELANCER:
        const freelanceSources = ['Main Client', 'Project Work', 'Commission', 'Consulting', 'Side Project'];
        return freelanceSources[index - 1] || `Freelance Source ${index}`;
      default:
        return `Income Source ${index}`;
    }
  }
  
  calculateTotalIncome(incomeSources) {
    // Convert all to monthly equivalent
    let total = 0;
    incomeSources.forEach(source => {
      switch (source.frequency) {
        case 'weekly':
          total += source.amount * 4.33; // Average weeks in month
          break;
        case 'bi_weekly':
          total += source.amount * 2.167;
          break;
        case 'daily':
          total += source.amount * 30;
          break;
        case 'yearly':
          total += source.amount / 12;
          break;
        default:
          total += source.amount;
      }
    });
    return Math.round(total);
  }
  
  // Add more handler methods for expenses, savings, etc.
}