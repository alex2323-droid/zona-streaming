export interface Client {
  id: string;
  name: string;
  netflixAccount: string;
  paymentAmountUsd: number;
  paymentDay: number; // Day of the month (1-31)
  lastPaymentDate?: string;
  lastReminderDate?: string;
  status: 'pending' | 'paid';
  email?: string;
}

export interface ExchangeRate {
  rate: number;
  lastUpdated: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}
