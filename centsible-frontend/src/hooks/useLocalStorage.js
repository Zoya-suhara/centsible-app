import { useState, useEffect } from 'react';

export const useLocalStorage = (key, initialValue) => {
  // Get stored value
  const getStoredValue = () => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return initialValue;
      
      // Try to parse as JSON; if it fails, return the raw string
      try {
        return JSON.parse(item);
      } catch {
        // Not valid JSON – it's a plain string (like our token)
        return item;
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState(getStoredValue);

  // Update localStorage when value changes
  useEffect(() => {
    try {
      // Only stringify objects/arrays; store strings as plain text
      const valueToStore = typeof storedValue === 'string' 
        ? storedValue 
        : JSON.stringify(storedValue);
      localStorage.setItem(key, valueToStore);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  const removeValue = () => {
    try {
      localStorage.removeItem(key);
      setStoredValue(null);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue, removeValue];
};