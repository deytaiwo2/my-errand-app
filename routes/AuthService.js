import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export const loginUser = async (type, credentials) => {
  const url = type === 'client' ? '/clients/login' : '/agents/login';
  const res = await axios.post(API_URL + url, credentials);
  localStorage.setItem('token', res.data.token);
  return res.data;
};

export const getToken = () => localStorage.getItem('token');

export const logoutUser = () => localStorage.removeItem('token');
