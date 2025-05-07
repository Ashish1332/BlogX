import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Send, SearchIcon, User, Loader2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";

interface ShareDialogProps {
  blogId: string;
  blogTitle: string;
  children: React.ReactNode;
}

export function ShareDialog({ blogId, blogTitle, children }: ShareDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  // Fetch users for sharing (exclude current user)
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["/api/users/search", searchTerm],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/search?query=${searchTerm}`);
      const allUsers = await res.json();
      // Filter out current user
      return allUsers.filter((u: any) => u._id !== user?._id);
    },
    enabled: open && !!searchTerm && searchTerm.length > 1
  });

  // Recent conversations
  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/messages/conversations");
      return await res.json();
    },
    enabled: open
  });

  // Share mutation
  const shareMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Format blog share message
      const content = `${message ? message + "\n\n" : ""}Check out this blog: "${blogTitle}"\nLink: /blog/${blogId}`;
      
      const res = await apiRequest("POST", `/api/messages/${userId}`, {
        content
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to share blog",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Function to share with multiple users
  const handleShareWithSelected = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: "No users selected",
        description: "Please select at least one user to share with",
        variant: "destructive",
      });
      return;
    }

    // Share with each selected user
    const sharePromises = selectedUsers.map(userId => shareMutation.mutateAsync(userId));
    
    try {
      await Promise.all(sharePromises);
      toast({
        title: `Blog shared with ${selectedUsers.length} user${selectedUsers.length > 1 ? 's' : ''}`,
        description: "The blog link has been sent successfully",
      });
      // Reset and close dialog
      setSelectedUsers([]);
      setMessage("");
      setOpen(false);
    } catch (error) {
      // Error is already handled in the mutation
    }
  };

  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  // Reset selections when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedUsers([]);
      setSearchTerm("");
      setMessage("");
    }
  }, [open]);

  if (!user) return <>{children}</>;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Blog</DialogTitle>
          <DialogDescription>
            Send "{blogTitle}" to other users directly within the app.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center space-x-2 mb-4">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4 max-h-[300px] overflow-y-auto">
          {isLoadingUsers || isLoadingConversations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : searchTerm && users.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Search Results</h4>
              {users.map((user: any) => (
                <div 
                  key={user._id} 
                  className={`flex items-center justify-between p-2 rounded-lg hover:bg-secondary cursor-pointer ${
                    selectedUsers.includes(user._id) ? 'bg-secondary/80' : ''
                  }`}
                  onClick={() => toggleUserSelection(user._id)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.profileImage} alt={user.displayName} />
                      <AvatarFallback>
                        {user.displayName?.charAt(0) || user.username?.charAt(0) || <User size={16} />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{user.username}</p>
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    {selectedUsers.includes(user._id) && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                </div>
              ))}
            </div>
          ) : searchTerm && users.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground">No users found</p>
          ) : conversations.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Recent Conversations</h4>
              {conversations.map((conversation: any) => (
                <div 
                  key={conversation.user._id} 
                  className={`flex items-center justify-between p-2 rounded-lg hover:bg-secondary cursor-pointer ${
                    selectedUsers.includes(conversation.user._id) ? 'bg-secondary/80' : ''
                  }`}
                  onClick={() => toggleUserSelection(conversation.user._id)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={conversation.user.profileImage} alt={conversation.user.displayName} />
                      <AvatarFallback>
                        {conversation.user.displayName?.charAt(0) || conversation.user.username?.charAt(0) || <User size={16} />}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{conversation.user.displayName}</p>
                      <p className="text-xs text-muted-foreground">@{conversation.user.username}</p>
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded-full border border-primary flex items-center justify-center">
                    {selectedUsers.includes(conversation.user._id) && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-center text-muted-foreground">Start a conversation by selecting users to share with</p>
          )}
        </div>

        <div className="space-y-2 pt-2">
          <Label htmlFor="message">Add a message (optional)</Label>
          <Textarea 
            id="message" 
            placeholder="Write something about this blog..." 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="resize-none"
            rows={3}
          />
        </div>

        <div className="flex justify-end">
          <Button
            variant="secondary"
            className="mr-2"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            className="gap-2"
            onClick={handleShareWithSelected}
            disabled={selectedUsers.length === 0 || shareMutation.isPending}
          >
            {shareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}