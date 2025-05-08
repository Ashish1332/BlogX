import React, { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import MainLayout from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Loader2,
  Search,
  UserPlus,
  Trash2,
  MessageSquare as MessageSquareIcon,
  FileText,
  Heart,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import webSocketService from "@/services/webSocketService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function MessagesPage() {
  const { id } = useParams();
  const [_, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [messageInputs, setMessageInputs] = useState<{ [key: string]: string }>(
    {},
  );
  const [isClient, setIsClient] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [localMessages, setLocalMessages] = useState<any[]>([]);

  // Get the current message input for this conversation
  const currentMessage = id ? messageInputs[id] || "" : "";

  // Set the message for the current conversation
  const setCurrentMessage = (text: string) => {
    if (id) {
      setMessageInputs((prev) => ({
        ...prev,
        [id]: text,
      }));
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch conversations
  const {
    data: conversations,
    isLoading: isConversationsLoading,
    isError: isConversationsError,
  } = useQuery({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const res = await fetch("/api/messages/conversations");
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  // Fetch user data for the conversation partner if needed
  const { data: userData } = useQuery({
    queryKey: [`/api/users/message/${id}`],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/users/message/${id}`);
      if (!res.ok) throw new Error("Failed to fetch user data");
      return res.json();
    },
    // Enable this query only when we need it (when the conversation isn't in the list)
    enabled:
      !!id &&
      !!conversations &&
      !conversations.find((c: any) => c.user._id.toString() === id.toString()),
  });

  // Fetch messages for selected conversation
  const {
    data: messages,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: [`/api/messages/${id}`],
    queryFn: async () => {
      if (!id) return null;
      try {
        // Make authenticated request with proper credentials
        const res = await fetch(`/api/messages/${id}`, {
          credentials: "include", // Important for session cookies
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
        console.log(
          "Authentication error detected, redirecting to messages home",
        );

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
          console.log("Message sent via WebSocket only - server will persist");
          // Return a temporary placeholder message object since the server will handle persistence
          // This avoids the duplicate message issue
          return {
            _id: "temp-" + Date.now(),
            senderId: currentUser._id,
            receiverId: id,
            content: content,
            createdAt: new Date().toISOString(),
            read: false,
          };
        } else {
          console.log("WebSocket sending failed, falling back to API");
        }
      }

      // Fall back to regular API call if WebSocket is not connected
      const res = await apiRequest("POST", `/api/messages/${id}`, { content });
      return await res.json();
    },
    onSuccess: () => {
      setCurrentMessage("");
      refetchMessages();
      // Also update conversations to show latest message
      queryClient.invalidateQueries({
        queryKey: ["/api/messages/conversations"],
      });
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
    const unsubscribeNewMessage = webSocketService.on("new_message", (data) => {
      console.log("New message received via WebSocket:", data);

      // If the message is from the current conversation, trigger a refetch
      if (
        id &&
        data.message &&
        (data.message.senderId === id ||
          data.message.receiverId === id ||
          // Also when we sent the message and it's being reflected back to us
          (data.isSender && data.message.receiverId === id))
      ) {
        // Add a small delay to avoid race conditions with database
        setTimeout(() => {
          refetchMessages();
        }, 100);
      }

      // Also update conversations list to show latest messages
      queryClient.invalidateQueries({
        queryKey: ["/api/messages/conversations"],
      });
    });

    // Listen for typing indicators
    const unsubscribeTyping = webSocketService.on(
      "typing_indicator",
      (data) => {
        // Update typing state when the other user is typing
        if (id && data.from === id) {
          setIsTyping(data.isTyping);
        }
        console.log("Typing indicator:", data);
      },
    );

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

  // Update local messages when API messages change
  useEffect(() => {
    if (messages) {
      setLocalMessages(messages);
    }
  }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim()) return;

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
    sendMessageMutation.mutate(currentMessage);
  };

  // Fetch following list for conversation suggestions
  const { data: following, isLoading: isFollowingLoading } = useQuery({
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

  // If not logged in, show login prompt
  if (!currentUser) {
    return (
      <MainLayout pageTitle="Messages">
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <MessageSquareIcon className="h-16 w-16 text-primary mb-6" />
          <h2 className="text-2xl font-bold mb-2">Sign in to view messages</h2>
          <p className="text-muted-foreground text-center mb-6 max-w-md">
            You need to be signed in to send and receive messages with other
            users.
          </p>
          <div className="flex gap-4">
            <Button onClick={() => navigate("/auth?tab=login")}>Sign In</Button>
            <Button
              variant="outline"
              onClick={() => navigate("/auth?tab=register")}
            >
              Create Account
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Messages">
      <div className="flex h-[calc(100vh-16rem)]">
        {/* Conversations List */}
        <div
          className={`w-80 border-r border-border ${id ? "hidden md:block" : "block"}`}
        >
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
                          className="flex items-center gap-3 p-2 hover:bg-secondary rounded-md cursor-pointer"
                          onClick={() => startConversation(user._id)}
                        >
                          <img
                            src={
                              user.profileImage ||
                              "https://via.placeholder.com/40"
                            }
                            alt={user.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          <div>
                            <p className="font-medium">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground">
                              @{user.username}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      {searchTerm
                        ? "No users found matching your search"
                        : "You aren't following anyone yet"}
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* List of Conversations */}
          {isConversationsLoading ? (
            <div className="p-4 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : isConversationsError || !conversations ? (
            <div className="p-4 flex flex-col items-center gap-2">
              <p className="text-destructive">Failed to load conversations</p>
              <Button
                variant="outline"
                className="mt-2"
                onClick={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["/api/messages/conversations"],
                  })
                }
              >
                Try Again
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto max-h-full messages-scrollbar">
              {conversations.map((conversation: any) => (
                <div key={conversation.user._id} className="relative group">
                  <div className="absolute right-3 top-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="bg-gray-700 hover:bg-red-600 text-white p-1 rounded-full transition-colors duration-200"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();

                              if (confirm("Delete this entire conversation?")) {
                                fetch(
                                  `/api/messages/conversation/${conversation.user._id}`,
                                  {
                                    method: "DELETE",
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                    credentials: "include", // Add credentials for authentication
                                  },
                                )
                                  .then((response) => {
                                    if (response.ok) {
                                      toast({
                                        title: "Conversation deleted",
                                        description:
                                          "All messages in this conversation have been deleted",
                                      });

                                      // Refresh conversations list
                                      queryClient.invalidateQueries({
                                        queryKey: [
                                          "/api/messages/conversations",
                                        ],
                                      });

                                      // If we're viewing this conversation, go back to messages home
                                      if (
                                        id === conversation.user._id.toString()
                                      ) {
                                        navigate("/messages");
                                      }
                                    } else {
                                      console.error(
                                        "Failed to delete conversation",
                                      );
                                      toast({
                                        title: "Error",
                                        description:
                                          "Failed to delete conversation",
                                        variant: "destructive",
                                      });
                                    }
                                  })
                                  .catch((err) => {
                                    console.error(
                                      "Error deleting conversation:",
                                      err,
                                    );
                                    toast({
                                      title: "Error",
                                      description:
                                        "Something went wrong while deleting the conversation",
                                      variant: "destructive",
                                    });
                                  });
                              }
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete conversation</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div
                    className={`block p-4 hover:bg-secondary/50 transition cursor-pointer ${id === conversation.user._id.toString() ? "bg-secondary" : ""}`}
                    onClick={() =>
                      navigate(`/messages/${conversation.user._id}`)
                    }
                  >
                    <div className="flex gap-3">
                      <div className="relative">
                        <img
                          src={
                            conversation.user.profileImage ||
                            "https://via.placeholder.com/40"
                          }
                          alt={conversation.user.displayName}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                        {conversation.unreadCount > 0 && (
                          <span className="absolute top-0 right-0 h-4 w-4 bg-primary rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h3 className="font-semibold truncate">
                            {conversation.user.displayName}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(conversation.lastMessage.createdAt),
                              { addSuffix: false },
                            )}
                          </span>
                        </div>
                        <p
                          className={`text-sm truncate ${!conversation.lastMessage.read && conversation.lastMessage.senderId === conversation.user._id ? "font-semibold" : "text-muted-foreground"}`}
                        >
                          {conversation.lastMessage.senderId ===
                          currentUser?._id
                            ? "You: "
                            : `${conversation.user.displayName}: `}
                          {conversation.lastMessage.content}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Message Thread or Empty State */}
        {id ? (
          <div
            className={`flex-1 flex flex-col ${id ? "block" : "hidden md:block"}`}
          >
            {/* Header with user info */}
            <div className="p-4 border-b border-border flex items-center gap-3">
              {id && conversations && (
                <>
                  {/* Find the conversation that matches the current user ID */}
                  {(() => {
                    // Find the matching conversation
                    const conversation = conversations.find(
                      (c: any) => c.user._id.toString() === id.toString(),
                    );

                    // If we have userData from the direct API call, use that
                    if (userData) {
                      return (
                        <>
                          <div
                            onClick={() => navigate(`/profile/${id}`)}
                            className="cursor-pointer"
                          >
                            <img
                              src={
                                userData.profileImage ||
                                "https://via.placeholder.com/40"
                              }
                              alt={userData.displayName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          </div>
                          <div>
                            <div
                              onClick={() => navigate(`/profile/${id}`)}
                              className="font-semibold hover:underline cursor-pointer"
                            >
                              {userData.displayName}
                            </div>
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
                          <div
                            onClick={() => navigate(`/profile/${id}`)}
                            className="cursor-pointer"
                          >
                            <img
                              src={
                                conversation.user.profileImage ||
                                "https://via.placeholder.com/40"
                              }
                              alt={conversation.user.displayName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          </div>
                          <div>
                            <div
                              onClick={() => navigate(`/profile/${id}`)}
                              className="font-semibold hover:underline cursor-pointer"
                            >
                              {conversation.user.displayName}
                            </div>
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
            <div className="flex-1 overflow-y-auto p-4 messages-scrollbar">
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
              ) : localMessages && localMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <MessageSquareIcon className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No messages yet</p>
                  <p className="text-sm text-muted-foreground">
                    Send a message to start the conversation.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {localMessages &&
                    localMessages.map((msg: any) => {
                      // For debugging - check current user vs message sender
                      const currentUserId = String(currentUser?._id || "");

                      // Make sure we get the right sender ID - check all possible formats
                      let msgSenderId;
                      if (msg.sender && msg.sender._id) {
                        msgSenderId = String(msg.sender._id);
                      } else if (msg.senderId) {
                        msgSenderId = String(msg.senderId);
                      } else if (msg.sender) {
                        // Direct sender reference (string format)
                        msgSenderId = String(msg.sender);
                      } else {
                        // If all else fails, check if this might be our message
                        msgSenderId = "";
                        console.log(
                          "Warning: Could not determine message sender",
                          msg,
                        );
                      }

                      // Log for debugging
                      console.log(
                        `Message: ${msg.content} | Current user: ${currentUserId} | Sender: ${msgSenderId} | ${currentUserId === msgSenderId ? "MY MESSAGE" : "OTHER'S MESSAGE"}`,
                      );

                      // Messages from current user should be on the right
                      const isFromCurrentUser = msgSenderId === currentUserId;

                      return (
                        <div
                          key={msg._id}
                          className="flex w-full"
                          style={{
                            justifyContent: isFromCurrentUser
                              ? "flex-end"
                              : "flex-start",
                          }}
                        >
                          <div
                            className={`relative group rounded-md p-3 max-w-[70%] ${isFromCurrentUser ? "bg-blue-600 text-white" : "bg-gray-700 text-white"}`}
                            style={{
                              borderTopLeftRadius: !isFromCurrentUser
                                ? "0"
                                : undefined,
                              borderTopRightRadius: isFromCurrentUser
                                ? "0"
                                : undefined,
                            }}
                          >
                            {/* Render different message types */}
                            {msg.messageType === 'blog_share' ? (
                              <div className="flex flex-col">
                                {/* Shared blog preview */}
                                <div 
                                  className="border border-border rounded-md p-3 mb-2 bg-background hover:bg-accent/50 cursor-pointer"
                                  onClick={() => {
                                    // Navigate to blog detail page when clicked
                                    if (msg.sharedBlog?._id) {
                                      window.location.href = `/blog/${msg.sharedBlog._id}`;
                                    }
                                  }}
                                >
                                  {/* Blog image if available */}
                                  {(msg.sharedBlogPreview?.image || msg.sharedBlog?.image) && (
                                    <div className="relative w-full h-32 mb-2 overflow-hidden rounded-md">
                                      <img 
                                        src={msg.sharedBlogPreview?.image || msg.sharedBlog?.image} 
                                        alt={msg.sharedBlogPreview?.title || msg.sharedBlog?.title}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  
                                  {/* Blog title */}
                                  <h4 className="font-semibold text-sm mb-1">
                                    {msg.sharedBlogPreview?.title || msg.sharedBlog?.title || "Shared blog post"}
                                  </h4>
                                  
                                  {/* Blog excerpt */}
                                  <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
                                    {msg.sharedBlogPreview?.excerpt || 
                                     (msg.sharedBlog?.content && msg.sharedBlog.content.substring(0, 100) + "...") || 
                                     "Click to view the full blog post"}
                                  </p>
                                  
                                  <p className="text-xs text-primary">View full blog post</p>
                                </div>
                                
                                {/* Message content as caption */}
                                <p className="whitespace-pre-wrap break-words">
                                  {msg.content}
                                </p>
                                <p className="text-xs opacity-70 mt-1 text-right">
                                  {formatDistanceToNow(new Date(msg.createdAt), {
                                    addSuffix: true,
                                  })}
                                </p>
                              </div>
                            ) : (
                              <>
                                {/* Regular text message */}
                                <p className="whitespace-pre-wrap break-words">
                                  {msg.content}
                                </p>
                                <p className="text-xs opacity-70 mt-1 text-right">
                                  {formatDistanceToNow(new Date(msg.createdAt), {
                                    addSuffix: true,
                                  })}
                                </p>
                              </>
                            )}
                            

                            {/* Message deletion button */}
                            {isFromCurrentUser && (
                              <div
                                className="absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                style={{
                                  right: isFromCurrentUser ? "auto" : "0",
                                  left: isFromCurrentUser ? "-24px" : "auto",
                                  transform: isFromCurrentUser
                                    ? "translateX(-50%)"
                                    : "translateX(50%)",
                                }}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        className="bg-gray-700 hover:bg-red-600 text-white p-1 rounded-full transition-colors duration-200"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          // Confirm before deleting
                                          if (confirm("Delete this message?")) {
                                            // Make API call to delete message
                                            fetch(`/api/messages/${msg._id}`, {
                                              method: "DELETE",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              credentials: "include", // Add credentials for authentication
                                            })
                                              .then((response) => {
                                                if (response.ok) {
                                                  // Show success toast
                                                  toast({
                                                    title: "Message deleted",
                                                    description:
                                                      "Message was successfully deleted",
                                                  });

                                                  // Remove message from local state
                                                  setLocalMessages((prev) =>
                                                    prev.filter(
                                                      (m) => m._id !== msg._id,
                                                    ),
                                                  );

                                                  // Notify the other user via WebSocket if connected
                                                  if (
                                                    id &&
                                                    webSocketService.isConnected()
                                                  ) {
                                                    webSocketService.send({
                                                      type: "message_deleted",
                                                      messageId: msg._id,
                                                      recipientId: id,
                                                    });
                                                  }
                                                } else {
                                                  console.error(
                                                    "Failed to delete message",
                                                  );
                                                  toast({
                                                    title: "Error",
                                                    description:
                                                      "Failed to delete message",
                                                    variant: "destructive",
                                                  });
                                                }
                                              })
                                              .catch((err) => {
                                                console.error(
                                                  "Error deleting message:",
                                                  err,
                                                );
                                                toast({
                                                  title: "Error",
                                                  description:
                                                    "Something went wrong while deleting the message",
                                                  variant: "destructive",
                                                });
                                              });
                                          }
                                        }}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete message</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex items-center gap-1 text-muted-foreground text-sm ml-2">
                      <div className="flex space-x-1">
                        <div
                          className="w-2 h-2 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        ></div>
                        <div
                          className="w-2 h-2 rounded-full bg-primary animate-bounce"
                          style={{ animationDelay: "600ms" }}
                        ></div>
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
                  value={currentMessage}
                  onChange={(e) => {
                    setCurrentMessage(e.target.value);

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
                {/* Blog sharing button */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="text-muted-foreground"
                      title="Share a blog post"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Share a blog post</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <BlogSharePicker
                        onSelectBlog={(blog) => {
                          // Close dialog programmatically
                          document.querySelector('[data-state="open"] button[data-dismiss]')?.click();
                          
                          if (!id) {
                            toast({
                              title: "Cannot share blog",
                              description: "No recipient selected. Please try again.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Create blog preview data
                          const excerpt = blog.content.length > 100 
                            ? blog.content.substring(0, 100) + "..." 
                            : blog.content;
                          
                          // Message caption - use current message if any, or default
                          const messageContent = currentMessage.trim() || `Check out this blog: "${blog.title}"`;
                          
                          sendMessageMutation.mutate({
                            receiverId: id,
                            content: messageContent,
                            messageType: 'blog_share',
                            sharedBlogId: blog._id,
                            sharedBlogPreview: {
                              title: blog.title,
                              excerpt: excerpt,
                              image: blog.image
                            }
                          });
                          
                          // Clear message input
                          setCurrentMessage('');
                        }}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
                
                {/* Send button */}
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    !currentMessage.trim() || sendMessageMutation.isPending
                  }
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
            <MessageSquareIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Your Messages</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Select a conversation to read and send messages, or start a new
              conversation with someone you follow.
            </p>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Start New Conversation
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

// Define type for user status data
interface UserStatus {
  isOnline: boolean;
  lastActive?: string;
}

// User online status indicator component
function UserStatusIndicator({ userId }: { userId: string }) {
  const { data: statusData, isLoading } = useQuery<UserStatus>({
    queryKey: [`/api/users/${userId}/status`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 15000, // Check status every 15 seconds
  });

  if (isLoading || !statusData) {
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
              className={`h-2 w-2 rounded-full ml-1 ${isOnline ? "bg-green-500" : "bg-gray-400"}`}
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

// Component for picking a blog to share
interface BlogSharePickerProps {
  onSelectBlog: (blog: any) => void;
}

function BlogSharePicker({ onSelectBlog }: BlogSharePickerProps) {
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<"my" | "bookmarks">("my");
  
  // Query for user's blogs
  const { data: myBlogs, isLoading: myBlogsLoading } = useQuery({
    queryKey: [`/api/blogs/user/${user?._id}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user?._id,
  });
  
  // Query for bookmarked blogs
  const { data: bookmarkedBlogs, isLoading: bookmarksLoading } = useQuery({
    queryKey: ['/api/bookmarks'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!user?._id,
  });
  
  return (
    <div className="w-full">
      <Tabs defaultValue="my" onValueChange={(value) => setSelectedTab(value as "my" | "bookmarks")}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="my" className="flex-1">My Blogs</TabsTrigger>
          <TabsTrigger value="bookmarks" className="flex-1">Bookmarked Blogs</TabsTrigger>
        </TabsList>
        <TabsContent value="my">
          {myBlogsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : myBlogs?.length > 0 ? (
            <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-1">
              {myBlogs.map((blog: any) => (
                <BlogShareCard 
                  key={blog._id} 
                  blog={blog} 
                  onSelect={() => onSelectBlog(blog)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>You haven't created any blogs yet.</p>
              <Button asChild className="mt-4">
                <a href="/create-blog">Create a Blog</a>
              </Button>
            </div>
          )}
        </TabsContent>
        <TabsContent value="bookmarks">
          {bookmarksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : bookmarkedBlogs?.length > 0 ? (
            <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-1">
              {bookmarkedBlogs.map((blog: any) => (
                <BlogShareCard 
                  key={blog._id} 
                  blog={blog} 
                  onSelect={() => onSelectBlog(blog)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>You haven't bookmarked any blogs yet.</p>
              <Button asChild className="mt-4">
                <a href="/explore">Explore Blogs</a>
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Card component for displaying a blog in the share picker
interface BlogShareCardProps {
  blog: any;
  onSelect: () => void;
}

function BlogShareCard({ blog, onSelect }: BlogShareCardProps) {
  return (
    <div 
      className="border border-border rounded-lg p-3 hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onSelect}
    >
      <div className="flex gap-3">
        {blog.image && (
          <div className="w-20 h-20 rounded-md overflow-hidden flex-shrink-0">
            <img 
              src={blog.image} 
              alt={blog.title} 
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm mb-1 truncate">{blog.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {blog.content.substring(0, 100)}
            {blog.content.length > 100 && "..."}
          </p>
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1 mr-3">
              <Heart className="w-3 h-3" /> {blog.likeCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> {blog.commentCount ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
