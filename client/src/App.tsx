import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import ProfilePage from "@/pages/profile-page";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "@/hooks/use-auth";
import NotificationsPage from "@/pages/notifications-page";
import MessagesPage from "@/pages/messages-page";
import BookmarksPage from "@/pages/bookmarks-page";
import ExplorePage from "@/pages/explore-page";
import BlogDetailPage from "@/pages/blog-detail-page";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/profile/:id?" component={ProfilePage} />
      <ProtectedRoute path="/notifications" component={NotificationsPage} />
      <ProtectedRoute path="/messages/:id?" component={MessagesPage} />
      <ProtectedRoute path="/bookmarks" component={BookmarksPage} />
      <ProtectedRoute path="/explore" component={ExplorePage} />
      <ProtectedRoute path="/blog/:id" component={BlogDetailPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
