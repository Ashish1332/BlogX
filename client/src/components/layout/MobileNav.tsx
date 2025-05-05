import { Link, useLocation } from "wouter";
import { Home, Search, Bell, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export default function MobileNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Get unread notification count
  const { data: notificationData } = useQuery({
    queryKey: ["/api/notifications/unread/count"],
    enabled: !!user,
  });
  
  const unreadNotificationCount = notificationData?.count || 0;

  const navItems = [
    { path: "/", icon: <Home className="w-6 h-6" />, label: "Home" },
    { path: "/explore", icon: <Search className="w-6 h-6" />, label: "Explore" },
    { 
      path: "/notifications", 
      icon: <Bell className="w-6 h-6" />, 
      label: "Notifications",
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined 
    },
    { path: "/messages", icon: <MessageSquare className="w-6 h-6" />, label: "Messages" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-10">
      <div className="flex justify-around py-3 px-2">
        {navItems.map((item) => (
          <Link key={item.path} href={item.path}>
            <a className={`flex flex-col items-center justify-center relative ${location === item.path ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className="relative">
                {item.icon}
                {item.badge && (
                  <span className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 bg-primary text-white h-5 w-5 flex items-center justify-center rounded-full text-xs">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
            </a>
          </Link>
        ))}
      </div>
    </div>
  );
}
