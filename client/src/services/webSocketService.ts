import { queryClient } from "@/lib/queryClient";

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type MessageCallback = (data: any) => void;
type ConnectionCallback = () => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private messageListeners: Map<string, Set<MessageCallback>> = new Map();
  private connectionListeners: {
    onConnect: Set<ConnectionCallback>;
    onDisconnect: Set<ConnectionCallback>;
  } = {
    onConnect: new Set(),
    onDisconnect: new Set()
  };
  private userId: string | null = null;

  // Initialize WebSocket connection
  connect(userId: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      // Already connected, just update userId if needed
      if (this.userId !== userId) {
        this.userId = userId;
        this.sendIdentity();
      }
      return;
    }

    this.userId = userId;
    
    // Determine the right protocol (ws/wss) based on current protocol (http/https)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log('Connecting to WebSocket server at:', wsUrl);
    
    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebSocket connection established');
        this.sendIdentity();
        this.connectionListeners.onConnect.forEach(callback => callback());
        
        // Clear any reconnect timeout
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = null;
        }
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // Notify all listeners for this message type
          if (data.type && this.messageListeners.has(data.type)) {
            const listeners = this.messageListeners.get(data.type);
            listeners?.forEach(callback => callback(data));
          }
          
          // Handle special message types
          this.handleSpecialMessages(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.socket.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        this.socket = null;
        this.connectionListeners.onDisconnect.forEach(callback => callback());
        
        // Attempt to reconnect after a delay
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // The onclose handler will be called after this
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      // Try to reconnect after delay
      this.scheduleReconnect();
    }
  }
  
  // Handle special messages that require automatic actions
  private handleSpecialMessages(data: WebSocketMessage) {
    switch (data.type) {
      case 'new_message':
        // Invalidate messages cache
        queryClient.invalidateQueries({ queryKey: [`/api/messages/${data.sender?._id}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/messages/conversations'] });
        break;
      
      case 'message_deleted':
        // Invalidate messages cache when a message is deleted
        queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
        queryClient.invalidateQueries({ queryKey: ['/api/messages/conversations'] });
        break;
        
      case 'new_blog':
        // Invalidate blogs feed and trending
        queryClient.invalidateQueries({ queryKey: ['/api/blogs/feed'] });
        queryClient.invalidateQueries({ queryKey: ['/api/blogs/trending'] });
        break;
        
      case 'notification':
        // Invalidate notifications
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
        queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread/count'] });
        break;
        
      case 'new_comment':
        // Invalidate comments for the affected blog
        if (data.blogId) {
          queryClient.invalidateQueries({ queryKey: [`/api/blogs/${data.blogId}/comments`] });
        }
        break;
    }
  }

  // Identify this connection with user ID
  private sendIdentity() {
    if (this.socket?.readyState === WebSocket.OPEN && this.userId) {
      this.socket.send(JSON.stringify({
        type: 'identity',
        userId: this.userId
      }));
    }
  }

  // Schedule reconnection attempts
  private scheduleReconnect() {
    if (!this.reconnectTimeout) {
      // Try to reconnect after 3 seconds
      this.reconnectTimeout = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        if (this.userId) {
          this.connect(this.userId);
        }
        this.reconnectTimeout = null;
      }, 3000);
    }
  }

  // Send a direct message to another user
  sendDirectMessage(to: string, content: string, options?: {
    messageType?: 'text' | 'blog_share';
    sharedBlogId?: string;
    sharedBlogPreview?: {
      title: string;
      excerpt: string;
      image?: string;
    }
  }) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.userId) {
      console.error('Cannot send message: WebSocket not connected or user not authenticated');
      return false;
    }
    
    const message: any = {
      type: 'direct_message',
      from: this.userId,
      to,
      content,
      timestamp: new Date()
    };

    // Add blog sharing properties if provided
    if (options?.messageType === 'blog_share' && options.sharedBlogId) {
      message.messageType = 'blog_share';
      message.sharedBlogId = options.sharedBlogId;
      
      if (options.sharedBlogPreview) {
        message.sharedBlogPreview = options.sharedBlogPreview;
      }
    }
    
    this.socket.send(JSON.stringify(message));
    
    return true;
  }
  
  // Send typing indicator
  sendTypingIndicator(to: string, isTyping: boolean) {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.userId) {
      return false;
    }
    
    this.socket.send(JSON.stringify({
      type: 'typing',
      from: this.userId,
      to,
      isTyping
    }));
    
    return true;
  }

  // Add a listener for a specific message type
  on(messageType: string, callback: MessageCallback) {
    if (!this.messageListeners.has(messageType)) {
      this.messageListeners.set(messageType, new Set());
    }
    
    this.messageListeners.get(messageType)?.add(callback);
    
    // Return a function to unsubscribe
    return () => {
      const listeners = this.messageListeners.get(messageType);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.messageListeners.delete(messageType);
        }
      }
    };
  }

  // Add connection event listeners
  onConnect(callback: ConnectionCallback) {
    this.connectionListeners.onConnect.add(callback);
    return () => this.connectionListeners.onConnect.delete(callback);
  }

  onDisconnect(callback: ConnectionCallback) {
    this.connectionListeners.onDisconnect.add(callback);
    return () => this.connectionListeners.onDisconnect.delete(callback);
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.userId = null;
  }

  // Send a generic message through the WebSocket
  send(message: WebSocketMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  // Check if the WebSocket is currently connected
  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Create a singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;