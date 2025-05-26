export interface Message {
  $id: string;
  chatId: string;
  text: string;
  sender: 'user' | 'nutritionist';
  time: string;
  read: boolean;
  userId: string;
  nutritionistId: string;
}

export interface Nutritionist {
  $id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline';
  type: string;
  specialization: string;
  description?: string;
  lastSeen: string;
  experience: number;
  rating: number;
  price: number;
  available: boolean;
}

export interface ChatSession {
  $id: string;
  userId: string;
  nutritionistId: string;
  status: 'active' | 'ended';
  startTime: string;
  endTime?: string;
  lastMessageTime: string;
  consultationType: string;
  notes?: string;
}

export interface ConsultationStatus {
  $id: string;
  sessionId: string;
  userId: string;
  nutritionistId: string;
  status: 'waiting' | 'in_progress' | 'completed';
  currentQueue: number;
  estimatedTime: number;
  priority: number;
  endTime?: string;
}

export interface Notification {
  $id: string;
  userId: string;
  type: 'message' | 'session_start' | 'session_end' | 'reminder';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: string;
}

export interface ChatContextType {
  messages: { [key: string]: Message[] };
  addMessage: (nutritionistId: string, text: string) => Promise<void>;
  nutritionists: Nutritionist[];
  currentChat: string | null;
  setCurrentChat: (chatId: string | null) => void;
  markMessageAsRead: (messageId: string) => Promise<void>;
  unreadMessages: { [key: string]: number };
  loading: boolean;
  currentSession: ChatSession | null;
  consultationStatus: ConsultationStatus | null;
  createSession: (nutritionistId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  notifications: Notification[];
  markNotificationAsRead: (notificationId: string) => Promise<void>;
}

export interface SubscriptionResponse<T> {
  event: string;
  payload: T;
}

export type ChatSubscriptionResponse = SubscriptionResponse<Message>;
export type ConsultationStatusSubscriptionResponse = SubscriptionResponse<ConsultationStatus>;

export interface CreateSessionParams {
  userId: string;
  nutritionistId: string;
  consultationType?: string;
}

export interface UpdateConsultationStatusParams {
  status?: 'waiting' | 'in_progress' | 'completed';
  currentQueue?: number;
  estimatedTime?: number;
  priority?: number;
  endTime?: string;
}

export interface CreateNotificationParams {
  userId: string;
  type: 'message' | 'session_start' | 'session_end' | 'reminder';
  title: string;
  message: string;
  metadata?: Record<string, any>;
}
