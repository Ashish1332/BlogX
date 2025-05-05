import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Search, UserPlus, MessageSquare as MessageSquareIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import webSocketService from "@/services/webSocketService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function MessagesPage() {
  const { id } = useParams();
  const [_, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch conversations
  const { 
    data: conversations, 
    isLoading: isConversationsLoading,
    isError: isConversationsError
  } = useQuery({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/messages/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  // Fetch user data for the conversation partner if needed
  const {
    data: userData
  } = useQuery({
    queryKey: [`/api/users/message/${id}`],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/users/message/${id}`);
      if (!res.ok) throw new Error("Failed to fetch user data");
      return res.json();
    },
    // Enable this query only when we need it (when the conversation isn't in the list)
    enabled: !!id && !!conversations && !conversations.find((c: any) => c.user._id.toString() === id.toString()),
  });

  // Fetch messages for selected conversation
  const { 
    data: messages,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages
  } = useQuery({
    queryKey: [`/api/messages/${id}`],
    queryFn: async () => {
      if (!id) return null;
      try {
        // Make authenticated request with proper credentials
        const res = await fetch(`/api/messages/${id}`, {
          credentials: 'include' // Important for session cookies
        });
        
        if (!res.ok) {
          console.error("Message fetch error:", await res.text());
          throw new Error("Failed to fetch messages");
        }
        
        return res.json();
      } catch (error) {
        console.error("Message fetch exception:", error);
        throw error;
      }
    },
    enabled: !!id,
    refetchInterval: 5000, // Poll for new messages every 5 seconds
    retry: 3, // Retry failed requests
  });
  
  // Handle 401 errors by redirecting to login
  useEffect(() => {
    if (isMessagesError && messagesError) {
      const errorMessage = (messagesError as Error).message;
      console.log("Messages error:", errorMessage);
      
      // If we get authentication errors repeatedly, redirect to messages home
      if (errorMessage === "Failed to fetch messages" && id) {
        console.log("Authentication error detected, redirecting to messages home");
        
        // Wait a moment before redirecting to avoid immediate redirection loops
        const timeout = setTimeout(() => {
          navigate("/messages");
        }, 2000);
        
        return () => clearTimeout(timeout);
      }
    }
  }, [isMessagesError, messagesError, id]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!id) throw new Error("No recipient selected");
      
      // Try real-time delivery via WebSocket first, but don't send via API if successful
      // Instead, let the server handle persistence when it receives the WebSocket message
      if (webSocketService.isConnected() && currentUser?._id) {
        const sent = webSocketService.sendDirectMessage(id, content);
        if (sent) {
          console.log('Message sent via WebSocket only - server will persist');
          // Return a temporary placeholder message object since the server will handle persistence
          // This avoids the duplicate message issue
          return {
            _id: 'temp-' + Date.now(),
            senderId: currentUser._id,
            receiverId: id,
            content: content,
            createdAt: new Date().toISOString(),
            read: false
          };
        } else {
          console.log('WebSocket sending failed, falling back to API');
        }
      }
      
      // Fall back to regular API call if WebSocket is not connected
      const res = await apiRequest("POST", `/api/messages/${id}`, { content });
      return await res.json();
    },
    onSuccess: () => {
      setMessage("");
      refetchMessages();
      // Also update conversations to show latest message
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Setup WebSocket listeners for real-time messages
  useEffect(() => {
    // Listen for incoming messages
    const unsubscribeNewMessage = webSocketService.on('new_message', (data) => {
      console.log('New message received via WebSocket:', data);
      
      // If the message is from the current conversation, trigger a refetch
      if (id && data.message && (
        (data.message.senderId === id) || 
        (data.message.receiverId === id) ||
        // Also when we sent the message and it's being reflected back to us
        (data.isSender && data.message.receiverId === id)
      )) {
        // Add a small delay to avoid race conditions with database
        setTimeout(() => {
          refetchMessages();
        }, 100);
      }
      
      // Also update conversations list to show latest messages
      queryClient.invalidateQueries({ queryKey: ['/api/messages/conversations'] });
    });
    
    // Listen for typing indicators
    const unsubscribeTyping = webSocketService.on('typing_indicator', (data) => {
      // Update typing state when the other user is typing
      if (id && data.from === id) {
        setIsTyping(data.isTyping);
      }
      console.log('Typing indicator:', data);
    });
    
    return () => {
      // Clean up listeners when component unmounts or id changes
      unsubscribeNewMessage();
      unsubscribeTyping();
    };
  }, [id, refetchMessages]);
  
  // Clean up the typing timeout when component unmounts
  useEffect(() => {
    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        
        // Send a final "stopped typing" indicator if navigating away while typing
        if (id && webSocketService.isConnected()) {
          webSocketService.sendTypingIndicator(id, false);
        }
      }
    };
  }, [typingTimeout, id]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    // Reset typing state immediately on sending a message
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      setTypingTimeout(null);
    }
    
    // Send typing stopped indicator
    if (id && webSocketService.isConnected()) {
      webSocketService.sendTypingIndicator(id, false);
    }
    
    // Send the message
    sendMessageMutation.mutate(message);
  };

  // Fetch following list for conversation suggestions
  const {
    data: following,
    isLoading: isFollowingLoading,
  } = useQuery({
    queryKey: [`/api/users/${currentUser?._id}/following`],
    queryFn: async () => {
      if (!currentUser?._id) return [];
      const res = await fetch(`/api/users/${currentUser._id}/following`);
      if (!res.ok) throw new Error("Failed to fetch following list");
      return res.json();
    },
    enabled: !!currentUser?._id,
  });
  
  // State for search functionality
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Filter following list based on search term
  const filteredFollowing = following?.filter((user: any) => {
    if (!searchTerm) return true;
    return (
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  
  // Function to start a new conversation
  const startConversation = (userId: string) => {
    navigate(`/messages/${userId}`);
    setIsDialogOpen(false);
    setSearchTerm("");
  };
  
  // Don't render anything during SSR to avoid hydration mismatch with date formatting
  if (!isClient) {
    return (
      <MainLayout pageTitle="Messages">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Messages">
      <div className="flex h-[calc(100vh-16rem)]">
        {/* Conversations List */}
        <div className={`w-80 border-r border-border ${id ? 'hidden md:block' : 'block'}`}>
          <div className="p-4 border-b border-border flex justify-between items-center">
            <h2 className="font-bold text-lg">Messages</h2>
            
            {/* New Message Button */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <UserPlus className="w-4 h-4" /> 
                  <span className="hidden sm:inline">New Message</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>New Conversation</DialogTitle>
                </DialogHeader>
                
                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search people you follow..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                {/* Following List */}
                <div className="mt-2 max-h-80 overflow-y-auto">
                  {isFollowingLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : filteredFollowing && filteredFollowing.length > 0 ? (
                    <div className="space-y-2">
                      {filteredFollowing.map((user: any) => (
                        <div 
                          key={user._id} 
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-secondary cursor-pointer"
                          onClick={() => startConversation(user._id)}
                        >
                          <img 
                            src={user.profileImage || "https://via.placeholder.com/40"} 
                            alt={user.displayName} 
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-medium">{user.displayName}</p>
                            <p className="text-sm text-muted-foreground">@{user.username}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground">
                        {searchTerm ? "No matching users found" : "You're not following anyone yet"}
                      </p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isConversationsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : isConversationsError ? (
            <div className="p-4 text-center">
              <p className="text-destructive">Failed to load conversations</p>
            </div>
          ) : conversations && conversations.length === 0 ? (
            <div className="p-4 text-center flex flex-col items-center gap-3">
              <MessageSquareIcon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">No conversations yet</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Start a conversation with someone you follow.
                </p>
              </div>
              <Button 
                onClick={() => setIsDialogOpen(true)} 
                className="w-full md:w-auto gap-2"
              >
                <UserPlus className="w-4 h-4" /> 
                Start New Conversation
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto max-h-full">
              {conversations && conversations.map((conversation: any) => (
                <Link key={conversation.user._id} href={`/messages/${conversation.user._id}`}>
                  <a className={`block p-4 hover:bg-secondary/50 transition ${id === conversation.user._id.toString() ? 'bg-secondary' : ''}`}>
                    <div className="flex gap-3">
                      <div className="relative">
                        <img 
                          src={conversation.user.profileImage || "https://via.placeholder.com/40"} 
                          alt={conversation.user.displayName} 
                          className="w-12 h-12 rounded-full object-cover" 
                        />
                        {conversation.unreadCount > 0 && (
                          <span className="absolute top-0 right-0 h-4 w-4 bg-primary rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-semibold truncate">{conversation.user.displayName}</h3>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conversation.lastMessage.createdAt), { addSuffix: false })}
                          </span>
                        </div>
                        <p className={`text-sm truncate ${!conversation.lastMessage.read && conversation.lastMessage.senderId === conversation.user._id ? 'font-semibold' : 'text-muted-foreground'}`}>
                          {conversation.lastMessage.senderId === currentUser?._id ? 'You: ' : `${conversation.user.displayName}: `}
                          {conversation.lastMessage.content}
                        </p>
                      </div>
                    </div>
                  </a>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Message Thread or Empty State */}
        {id ? (
          <div className={`flex-1 flex flex-col ${id ? 'block' : 'hidden md:block'}`}>
            {/* Header with user info */}
            <div className="p-4 border-b border-border flex items-center gap-3">
                {id && conversations && (
                  <>
                    {/* Find the conversation that matches the current user ID */}
                    {(() => {
                      // Find the matching conversation
                      const conversation = conversations.find(
                        (c: any) => c.user._id.toString() === id.toString()
                      );
                      
                      // If we have userData from the direct API call, use that
                      if (userData) {
                        return (
                          <>
                            <Link href={`/profile/${id}`}>
                              <a>
                                <img 
                                  src={userData.profileImage || "https://via.placeholder.com/40"} 
                                  alt={userData.displayName} 
                                  className="w-10 h-10 rounded-full object-cover" 
                                />
                              </a>
                            </Link>
                            <div>
                              <Link href={`/profile/${id}`}>
                                <a className="font-semibold hover:underline">
                                  {userData.displayName}
                                </a>
                              </Link>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                @{userData.username}
                                <UserStatusIndicator userId={id} />
                              </p>
                            </div>
                          </>
                        );
                      }
                      
                      // If we found a matching conversation, use that
                      if (conversation) {
                        return (
                          <>
                            <Link href={`/profile/${id}`}>
                              <a>
                                <img 
                                  src={conversation.user.profileImage || "https://via.placeholder.com/40"} 
                                  alt={conversation.user.displayName} 
                                  className="w-10 h-10 rounded-full object-cover" 
                                />
                              </a>
                            </Link>
                            <div>
                              <Link href={`/profile/${id}`}>
                                <a className="font-semibold hover:underline">
                                  {conversation.user.displayName}
                                </a>
                              </Link>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                @{conversation.user.username}
                                <UserStatusIndicator userId={id} />
                              </p>
                            </div>
                          </>
                        );
                      }
                      
                      // If neither data source is available
                      return (
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span>Loading user information...</span>
                        </div>
                      );
                    })()}
                  </>
                )}
                <button 
                  onClick={() => navigate("/messages")}
                  className="md:hidden ml-auto text-muted-foreground"
                >
                  Back
                </button>
              </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {isMessagesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : isMessagesError ? (
                <div className="p-4 text-center">
                  <p className="text-destructive">Failed to load messages</p>
                  <Button 
                    variant="outline" 
                    className="mt-2"
                    onClick={() => refetchMessages()}
                  >
                    Try Again
                  </Button>
                </div>
              ) : messages && messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-sm text-muted-foreground">
                    Send a message to start the conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages && messages.map((msg: any) => (
                    <div 
                      key={msg._id} 
                      className={`flex ${msg.senderId === currentUser?._id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[70%] px-4 py-2 ${
                          msg.senderId === currentUser?._id 
                            ? 'bg-primary text-white rounded-tl-lg rounded-tr-lg rounded-bl-lg' 
                            : 'bg-secondary text-foreground rounded-tl-lg rounded-tr-lg rounded-br-lg'
                        }`}
                      >
                        <p>{msg.content}</p>
                        <p className={`text-xs mt-1 ${
                          msg.senderId === currentUser?._id 
                            ? 'text-white/70' 
                            : 'text-muted-foreground'
                        }`}>
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm ml-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '600ms' }}></div>
                      </div>
                      <span className="ml-2">typing...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-border">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    
                    // Handle typing indicator
                    if (id && webSocketService.isConnected()) {
                      // Clear any existing timeout
                      if (typingTimeout) {
                        clearTimeout(typingTimeout);
                      }
                      
                      // Send typing indicator (true)
                      webSocketService.sendTypingIndicator(id, true);
                      
                      // Set timeout to send typing stopped indicator after 2 seconds of inactivity
                      const timeout = setTimeout(() => {
                        if (id && webSocketService.isConnected()) {
                          webSocketService.sendTypingIndicator(id, false);
                        }
                      }, 2000);
                      
                      setTypingTimeout(timeout);
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={!message.trim() || sendMessageMutation.isPending}
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Your Messages</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Select a conversation to read and send messages, or start a new conversation with someone you follow.
            </p>
            <Button 
              onClick={() => setIsDialogOpen(true)} 
              className="gap-2"
            >
              <UserPlus className="w-4 h-4" /> 
              Start New Conversation
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function MessageSquare(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// User online status indicator component
function UserStatusIndicator({ userId }: { userId: string }) {
  const { data: statusData, isLoading } = useQuery({
    queryKey: [`/api/users/${userId}/status`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 15000, // Check status every 15 seconds
  });

  if (isLoading) {
    return null;
  }

  if (!statusData) {
    return null;
  }

  const { isOnline, lastActive } = statusData;
  
  let statusText = "Offline";
  if (isOnline) {
    statusText = "Online";
  } else if (lastActive) {
    statusText = `Last active ${formatDistanceToNow(new Date(lastActive), { addSuffix: true })}`;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <span 
              className={`h-2 w-2 rounded-full ml-1 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{statusText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
