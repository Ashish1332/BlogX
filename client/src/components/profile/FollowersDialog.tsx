import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, UserPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface FollowersDialogProps {
  userId: string;
  type: 'followers' | 'following';
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowersDialog({
  userId,
  type,
  isOpen,
  onClose
}: FollowersDialogProps) {
  const { user } = useAuth();
  const [followStatus, setFollowStatus] = useState<Record<string, boolean>>({});

  const { 
    data: users, 
    isLoading 
  } = useQuery({
    queryKey: [type === 'followers' ? `/api/users/${userId}/followers` : `/api/users/${userId}/following`],
    queryFn: async () => {
      console.log("Fetching", type, "list for user", userId);
      const res = await fetch(type === 'followers' 
        ? `/api/users/${userId}/followers` 
        : `/api/users/${userId}/following`
      );
      if (!res.ok) throw new Error(`Failed to fetch ${type}`);
      return res.json();
    },
    enabled: isOpen
  });

  useEffect(() => {
    if (users && user) {
      console.log(`Checking follow status for ${users.length} users`);
      const checkFollowStatus = async () => {
        const statuses: Record<string, boolean> = {};
        
        for (const followUser of users) {
          // Skip checking follow status for the current user
          if (followUser._id === user._id) {
            statuses[followUser._id] = false;
            continue;
          }
          
          try {
            const res = await fetch(`/api/users/${followUser._id}/is-following`);
            if (res.ok) {
              const data = await res.json();
              statuses[followUser._id] = data.isFollowing;
            }
          } catch (error) {
            console.error("Error checking follow status", error);
          }
        }
        
        setFollowStatus(statuses);
      };
      
      checkFollowStatus();
    }
  }, [users, user]);

  const handleFollow = async (followUserId: string) => {
    if (!user) return;
    
    try {
      console.log("Following user:", followUserId);
      await apiRequest("POST", `/api/users/${followUserId}/follow`);
      setFollowStatus(prev => ({ ...prev, [followUserId]: true }));
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/users/${followUserId}`] });
      
    } catch (error) {
      console.error("Error following user", error);
    }
  };
  
  const handleUnfollow = async (followUserId: string) => {
    if (!user) return;
    
    try {
      console.log("Unfollowing user:", followUserId);
      await apiRequest("DELETE", `/api/users/${followUserId}/follow`);
      setFollowStatus(prev => ({ ...prev, [followUserId]: false }));
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/users/${followUserId}`] });
      
    } catch (error) {
      console.error("Error unfollowing user", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {type === 'followers' ? 'Followers' : 'Following'}
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : users && users.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            {type === 'followers' 
              ? 'This user doesn\'t have any followers yet.' 
              : 'This user isn\'t following anyone yet.'}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {users && users.map((followUser: any) => (
              <div 
                key={followUser._id} 
                className="flex items-center justify-between py-3 px-1 border-b border-border last:border-b-0"
              >
                <Link href={`/profile/${followUser._id}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-secondary">
                      {followUser.profileImage ? (
                        <img 
                          src={followUser.profileImage} 
                          alt={followUser.displayName} 
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">
                          {followUser.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{followUser.displayName}</p>
                      <p className="text-sm text-muted-foreground">@{followUser.username}</p>
                    </div>
                  </div>
                </Link>
                
                {/* Don't show follow/unfollow button for current user */}
                {user && followUser._id !== user._id && (
                  followStatus[followUser._id] ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => handleUnfollow(followUser._id)}
                    >
                      <Check className="h-4 w-4" />
                      Following
                    </Button>
                  ) : (
                    <Button 
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => handleFollow(followUser._id)}
                    >
                      <UserPlus className="h-4 w-4" />
                      Follow
                    </Button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}