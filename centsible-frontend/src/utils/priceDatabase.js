// Local price database for UAE (can expand globally later)
export const priceDatabase = {
  rents: {
    'dubai': {
      'dubai marina': { 
        studio: 55000, 
        '1-bedroom': 85000, 
        '2-bedroom': 130000,
        recommendation: '25-30% of monthly income'
      },
      'downtown dubai': { 
        studio: 60000, 
        '1-bedroom': 95000, 
        '2-bedroom': 140000 
      },
      'jumeirah': { 
        villa: 250000, 
        apartment: 110000 
      }
    },
    'abu dhabi': {
      'corniche area': { 
        '1-bedroom': 80000, 
        '2-bedroom': 120000 
      }
    }
  },
  
  groceries: {
    averageMonthly: {
      single: 400,
      couple: 800,
      family: 1500
    },
    supermarkets: {
      'carrefour': { rating: '$$', notes: 'Good for bulk buying' },
      'lulu': { rating: '$', notes: 'Budget friendly' },
      'spinneys': { rating: '$$$', notes: 'Premium quality' }
    }
  },
  
  utilities: {
    averageMonthly: {
      electricity: 500,
      water: 200,
      internet: 350,
      mobile: 100
    }
  },
  
  transportation: {
    dubai: {
      monthlySalik: 300,
      petrolPerMonth: 800,
      metroMonthlyPass: 350,
      taxiAverageTrip: 50
    }
  }
};

export const getPriceInfo = (category, location, type) => {
  if (!priceDatabase[category] || !priceDatabase[category][location]) {
    return null;
  }
  return priceDatabase[category][location][type] || priceDatabase[category][location];
};

export const comparePrices = (item, location1, location2) => {
  // Compare prices between two locations
  return {
    location1: getPriceInfo(item, location1),
    location2: getPriceInfo(item, location2),
    difference: 'Calculate difference'
  };
};