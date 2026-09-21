import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'gotit.token';
export const getToken = () => AsyncStorage.getItem(TOKEN_KEY);
export const saveToken = (token: string) => AsyncStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => AsyncStorage.removeItem(TOKEN_KEY);
