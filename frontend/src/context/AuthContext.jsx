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

      const accessToken = data.tokens?.access || data.access;
      const refreshToken = data.tokens?.refresh || data.refresh;
      const userObj = data.user || data;

      if (accessToken) localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      if (userObj) localStorage.setItem('user_info', JSON.stringify(userObj));

      setUser(userObj);
      return userObj;
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Login failed. Please verify credentials.';
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

      const accessToken = data.tokens?.access || data.access;
      const refreshToken = data.tokens?.refresh || data.refresh;
      const userObj = data.user || data;

      // Fallback: If backend response didn't include tokens, login immediately
      if (!accessToken && userData.password) {
        return await login(payload.email, userData.password);
      }

      if (accessToken) localStorage.setItem('access_token', accessToken);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
      if (userObj) localStorage.setItem('user_info', JSON.stringify(userObj));

      setUser(userObj);
      return userObj;
    } catch (err) {
      const errData = err.response?.data;
      let msg = 'Registration failed. Please check inputs.';
      if (errData && typeof errData === 'object') {
        const firstKey = Object.keys(errData)[0];
        const val = errData[firstKey];
        msg = `${firstKey}: ${Array.isArray(val) ? val[0] : val}`;
      } else if (err.message) {
        msg = err.message;
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
