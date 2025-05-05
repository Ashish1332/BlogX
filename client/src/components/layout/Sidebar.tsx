import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Home, 
  Search, 
  Bell, 
  MessageSquare, 
  Bookmark, 
  User, 
  MoreHorizontal,
  LogOut
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import BlogEditor from "../blog/BlogEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [showBlogEditor, setShowBlogEditor] = useState(false);
  
  // Get unread notification count
  const { data: notificationData } = useQuery({
    queryKey: ["/api/notifications/unread/count"],
    enabled: !!user,
  });
  
  const unreadNotificationCount = notificationData?.count || 0;
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const navItems = [
    { path: "/", icon: <Home className="h-6 w-6" />, label: "Home" },
    { path: "/explore", icon: <Search className="h-6 w-6" />, label: "Explore" },
    { 
      path: "/notifications", 
      icon: <Bell className="h-6 w-6" />, 
      label: "Notifications",
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined
    },
    { path: "/messages", icon: <MessageSquare className="h-6 w-6" />, label: "Messages" },
    { path: "/bookmarks", icon: <Bookmark className="h-6 w-6" />, label: "Bookmarks" },
    { path: `/profile/${user?.id}`, icon: <User className="h-6 w-6" />, label: "Profile" },
  ];

  return (
    <>
      <div className="hidden md:flex md:w-64 lg:w-72 flex-col h-screen sticky top-0 p-2 border-r border-border">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-3 mb-4">
            <Link href="/">
              <a className="text-2xl font-bold text-primary">BlogX</a>
            </Link>
          </div>
          
          {/* Main Navigation */}
          <nav className="flex-1">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link href={item.path}>
                    <a className={`flex items-center gap-4 p-3 rounded-full hover:bg-secondary text-xl font-medium ${location === item.path ? 'font-bold' : ''}`}>
                      {item.icon}
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="absolute notification-indicator bg-primary text-white h-5 w-5 flex items-center justify-center rounded-full text-xs">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </a>
                  </Link>
                </li>
              ))}
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-4 p-3 rounded-full hover:bg-secondary text-xl font-medium w-full text-left">
                      <MoreHorizontal className="h-6 w-6" />
                      <span>More</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            </ul>
          </nav>
          
          {/* New Blog Button */}
          <div className="my-3">
            <button 
              className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-4 rounded-full w-full"
              onClick={() => setShowBlogEditor(true)}
            >
              Write Blog
            </button>
          </div>
          
          {/* User Profile */}
          {user && (
            <div className="mt-auto p-3 flex items-center gap-3 hover:bg-secondary rounded-full cursor-pointer">
              <Link href={`/profile/${user.id}`}>
                <a className="flex items-center gap-3 w-full">
                  <img 
                    src={user.profileImage || "https://via.placeholder.com/40"} 
                    alt={user.displayName} 
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold truncate">{user.displayName}</h3>
                    <p className="text-muted-foreground text-sm truncate">@{user.username}</p>
                  </div>
                </a>
              </Link>
            </div>
          )}
        </div>
      </div>
      
      {/* Blog Editor Modal */}
      <BlogEditor isOpen={showBlogEditor} onClose={() => setShowBlogEditor(false)} />
    </>
  );
}
