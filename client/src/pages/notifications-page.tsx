import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, MessageSquare, Heart, UserPlus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function NotificationsPage() {
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { 
    data: notifications, 
    isLoading, 
    isError,
    refetch 
  } = useQuery({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread/count"] });
      toast({
        title: "Notifications marked as read",
        description: "All notifications have been marked as read",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread/count"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };

  const handleNotificationClick = (id: string, read: boolean) => {
    if (!read) {
      markAsReadMutation.mutate(id);
    }
  };

  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="h-5 w-5 text-pink-500" />;
      case 'comment':
        return <MessageSquare className="h-5 w-5 text-green-500" />;
      case 'follow':
        return <UserPlus className="h-5 w-5 text-primary" />;
      default:
        return <User className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const renderNotificationText = (notification: any) => {
    // Get the actor ID, preferring _id (MongoDB) over id (legacy)
    const actorId = notification.actor?._id || notification.actor?.id;
    const blogId = notification.blog?._id || notification.blog?.id;
    
    switch (notification.type) {
      case 'like':
        return (
          <>
            <Link href={`/profile/${actorId}`}>
              <a className="font-semibold hover:underline">{notification.actor?.displayName}</a>
            </Link>
            {" liked your "}
            <Link href={`/blog/${blogId}`}>
              <a className="hover:underline">blog</a>
            </Link>
          </>
        );
      case 'comment':
        return (
          <>
            <Link href={`/profile/${actorId}`}>
              <a className="font-semibold hover:underline">{notification.actor?.displayName}</a>
            </Link>
            {" commented on your "}
            <Link href={`/blog/${blogId}`}>
              <a className="hover:underline">blog</a>
            </Link>
          </>
        );
      case 'follow':
        return (
          <>
            <Link href={`/profile/${actorId}`}>
              <a className="font-semibold hover:underline">{notification.actor?.displayName}</a>
            </Link>
            {" followed you"}
            <button 
              className="ml-2 px-2 py-1 bg-primary text-white rounded-full text-xs hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation(); // Prevent the notification click handler
                window.location.href = `/profile/${actorId}`;
              }}
            >
              View Profile
            </button>
          </>
        );
      default:
        return "New notification";
    }
  };

  // Don't render anything during SSR to avoid hydration mismatch with date formatting
  if (!isClient) {
    return (
      <MainLayout pageTitle="Notifications">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Notifications">
      {/* Header with Mark All as Read button */}
      {notifications && notifications.length > 0 && (
        <div className="p-4 border-b border-border">
          <Button 
            variant="outline" 
            onClick={handleMarkAllAsRead}
            disabled={markAllAsReadMutation.isPending}
          >
            {markAllAsReadMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Marking...
              </>
            ) : (
              "Mark all as read"
            )}
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="py-8 text-center">
          <p className="text-destructive mb-2">Failed to load notifications</p>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && notifications && notifications.length === 0 && (
        <div className="py-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No notifications yet</h3>
          <p className="text-muted-foreground">
            When someone interacts with your blogs or profile, you'll see notifications here.
          </p>
        </div>
      )}

      {/* Notifications list */}
      <div className="divide-y divide-border">
        {notifications && notifications.map((notification: any) => {
          // Get the notification ID, preferring _id (MongoDB) over id (legacy)
          const notificationId = notification._id || notification.id;
          return (
            <div 
              key={notificationId} 
              className={`p-4 hover:bg-secondary/50 transition ${!notification.read ? 'bg-primary/5' : ''}`}
              onClick={() => handleNotificationClick(notificationId, notification.read)}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-secondary">
                  {renderNotificationIcon(notification.type)}
                </div>
                <div>
                  <p className="mb-1">
                    {renderNotificationText(notification)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </MainLayout>
  );
}

function Bell(props: React.SVGProps<SVGSVGElement>) {
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
