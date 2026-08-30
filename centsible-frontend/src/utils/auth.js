// src/utils/auth.js - SIMPLE LOCAL USER SYSTEM
export const initUser = () => {
  let user = localStorage.getItem('centsible_user');
  if (!user) {
    user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: '',
      email: '',
      currency: 'AED',
      groups: [],
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('centsible_user', JSON.stringify(user));
  }
  return JSON.parse(user);
};