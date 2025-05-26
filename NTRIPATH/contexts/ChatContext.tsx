import React, { createContext, useContext, useState, useEffect, ReactNode, FC } from 'react';
import { useGlobalContext } from '../lib/global-provider';
import { 
  Message, 
  Nutritionist, 
  ChatSession,
  ConsultationStatus,
  Notification,
  ChatContextType
} from '../types/chat';
import { config } from '../lib/appwrite';
import { 
  sendMessage as sendMessageAPI, 
  getNutritionists as getNutritionistsAPI,
  getChatMessages as getChatMessagesAPI,
  markMessageAsRead as markMessageAsReadAPI,
  subscribeToChat as subscribeToChatAPI,
  createChatSession,
  endChatSession,
  createConsultationStatus,
  updateConsultationStatus,
  subscribeToConsultationStatus,
  createNotification,
  markNotificationAsRead,
  getNotifications,
  databases
} from '../lib/appwrite';

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<{ [key: string]: Message[] }>({});
  const [nutritionists, setNutritionists] = useState<Nutritionist[]>([]);
  const [currentChat, setCurrentChat] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [consultationStatus, setConsultationStatus] = useState<ConsultationStatus | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useGlobalContext();

  // Fetch nutritionists
  useEffect(() => {
    const fetchNutritionists = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        const fetchedNutritionists = await getNutritionistsAPI();
        setNutritionists(fetchedNutritionists);
      } catch (error) {
        console.error('Error fetching nutritionists:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNutritionists();
  }, [user]);

  // Fetch notifications
  useEffect(() => {
    const fetchUserNotifications = async () => {
      if (!user) return;
      
      try {
        const fetchedNotifications = await getNotifications(user.$id);
        setNotifications(fetchedNotifications);
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    };

    fetchUserNotifications();
  }, [user]);

  const addMessage = async (nutritionistId: string, text: string) => {
    if (!user) return;

    const chatId = user.role === 'nutritionist' 
      ? `${nutritionistId}-${user.$id}`  // Jika pengirim adalah ahli gizi
      : `${user.$id}-${nutritionistId}`; // Jika pengirim adalah user biasa

    const timestamp = new Date().toISOString();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const tempMessage: Message = {
      $id: tempId,
      chatId,
      text,
      sender: user.role === 'nutritionist' ? 'nutritionist' : 'user',
      time: timestamp,
      read: false,
      userId: user.role === 'nutritionist' ? nutritionistId : user.$id,
      nutritionistId: user.role === 'nutritionist' ? user.$id : nutritionistId
    };

    setMessages((prev: { [key: string]: Message[] }) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), tempMessage]
    }));

    try {
      const sentMessage = await sendMessageAPI({
        userId: tempMessage.userId,
        nutritionistId: tempMessage.nutritionistId,
        text,
        chatId
      });

      setMessages((prev: { [key: string]: Message[] }) => ({
        ...prev,
        [chatId]: prev[chatId].map((msg: Message) => 
          msg.$id === tempId ? sentMessage : msg
        )
      }));

      if (user.role === 'nutritionist') {
        await createNotification(
          tempMessage.userId,
          'message',
          'Pesan Baru dari Ahli Gizi',
          `${user.name} mengirim pesan baru untuk Anda`,
          { chatId }
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev: { [key: string]: Message[] }) => ({
        ...prev,
        [chatId]: prev[chatId].filter((msg: Message) => msg.$id !== tempId)
      }));
      throw error;
    }
  };

  const endSession = async (sessionId: string) => {
    if (!user) return;

    try {
      // End the chat session
      const endedSession = await endChatSession(sessionId);
      
      // Update consultation status to completed
      if (consultationStatus) {
        await updateConsultationStatus(consultationStatus.$id, {
          status: 'completed',
          endTime: new Date().toISOString()
        });
      }

      // Create notifications for both user and nutritionist
      await Promise.all([
        createNotification(
          user.role === 'nutritionist' ? consultationStatus?.userId! : user.$id,
          'session_end',
          'Konsultasi Selesai',
          'Sesi konsultasi Anda telah selesai',
          { sessionId }
        ),
        createNotification(
          user.role === 'nutritionist' ? user.$id : consultationStatus?.nutritionistId!,
          'session_end',
          'Konsultasi Selesai',
          'Sesi konsultasi telah diakhiri',
          { sessionId }
        )
      ]);

      // Clear local state
      setCurrentSession(null);
      setConsultationStatus(null);

      // If nutritionist, update their status
      if (user.role === 'nutritionist') {
        await databases.updateDocument(
          config.databaseId!,
          config.ahligiziCollectionId!,
          user.$id,
          {
            available: true,
            lastSeen: new Date().toISOString()
          }
        );
      }

    } catch (error) {
      console.error('Error ending chat session:', error);
      throw error;
    }
  };

  const markMessageAsRead = async (messageId: string) => {
    try {
      await markMessageAsReadAPI(messageId);
      
      setMessages((prev: { [key: string]: Message[] }) => {
        const updatedMessages = { ...prev };
        Object.keys(updatedMessages).forEach((chatId: string) => {
          updatedMessages[chatId] = updatedMessages[chatId].map((msg: Message) => 
            msg.$id === messageId ? { ...msg, read: true } : msg
          );
        });
        return updatedMessages;
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const handleNotificationRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications((prev: Notification[]) => 
        prev.map((notif: Notification) => 
          notif.$id === notificationId ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const createSession = async (nutritionistId: string): Promise<void> => {
    if (!user) return;

    try {
      // Create new chat session
      const session = await createChatSession(user.$id, nutritionistId);

      // Create consultation status
      const status = await createConsultationStatus(
        session.$id,
        user.$id,
        nutritionistId
      );

      // Create notifications for both user and nutritionist
      await Promise.all([
        createNotification(
          user.$id,
          'session_start',
          'Konsultasi Dimulai',
          'Sesi konsultasi Anda telah dimulai',
          { sessionId: session.$id }
        ),
        createNotification(
          nutritionistId,
          'session_start',
          'Konsultasi Baru',
          'Anda memiliki sesi konsultasi baru',
          { sessionId: session.$id }
        )
      ]);

      setCurrentSession(session);
      setConsultationStatus(status);
    } catch (error) {
      console.error('Error creating chat session:', error);
      throw error;
    }
  };

  return (
    <ChatContext.Provider 
      value={{ 
        messages, 
        addMessage, 
        nutritionists, 
        currentChat, 
        setCurrentChat,
        markMessageAsRead,
        unreadMessages,
        loading,
        currentSession,
        consultationStatus,
        createSession,
        endSession,
        notifications,
        markNotificationAsRead: handleNotificationRead
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
