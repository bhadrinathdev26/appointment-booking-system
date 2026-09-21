import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const initAuth = useCallback(async () => {
    const storedUser = localStorage.getItem('user_info');
    const token = localStorage.getItem('access_token');

    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        // Verify with backend
        const { data } = await api.get('/auth/me/');
        setUser(data);
        localStorage.setItem('user_info', JSON.stringify(data));
      } catch (err) {
        // If /auth/me/ fails and token was invalid, client interceptor will handle or we clean up
        if (err.response?.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user_info');
          setUser(null);
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initAuth();

    const handleAutoLogout = () => {
      setUser(null);
    };
    window.addEventListener('auth:logout', handleAutoLogout);
    return () => window.removeEventListener('auth:logout', handleAutoLogout);
  }, [initAuth]);

  const login = async (email, password) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/login/', {
        email: email.trim().toLowerCase(),
        password,
      });

      localStorage.setItem('access_token', data.tokens.access);
      localStorage.setItem('refresh_token', data.tokens.refresh);
      localStorage.setItem('user_info', JSON.stringify(data.user));

      setUser(data.user);
      return data.user;
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || 'Login failed. Please verify credentials.';
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (userData) => {
    setError(null);
    try {
      const payload = {
        ...userData,
        email: userData.email.trim().toLowerCase(),
      };
      const { data } = await api.post('/auth/register/', payload);

      localStorage.setItem('access_token', data.tokens.access);
      localStorage.setItem('refresh_token', data.tokens.refresh);
      localStorage.setItem('user_info', JSON.stringify(data.user));

      setUser(data.user);
      return data.user;
    } catch (err) {
      const errData = err.response?.data;
      let msg = 'Registration failed. Please check inputs.';
      if (typeof errData === 'object') {
        const firstKey = Object.keys(errData)[0];
        msg = `${firstKey}: ${Array.isArray(errData[firstKey]) ? errData[firstKey][0] : errData[firstKey]}`;
      }
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_info');
    setUser(null);
  };

  const demoLogin = async (email, password) => {
    return login(email, password);
  };

  const value = {
    user,
    role: user?.role || null,
    isAuthenticated: !!user,
    loading,
    error,
    login,
    register,
    logout,
    demoLogin,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
