import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

type TrendingHashtag = {
  hashtag: string;
  category: string;
  count: number;
};

type SuggestedUser = User & {
  isFollowing: boolean;
};

export default function RightSidebar() {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();

  // Fetch real trending hashtags from the backend
  const { data: trendingHashtags, isLoading: isLoadingHashtags } = useQuery({
    queryKey: ["/api/hashtags/trending"],
    queryFn: async () => {
      const res = await fetch("/api/hashtags/trending");
      if (!res.ok) throw new Error("Failed to fetch trending hashtags");
      return res.json();
    }
  });

  // Get suggested users to follow
  const { data: searchResults } = useQuery({
    queryKey: ["/api/search", searchQuery],
    queryFn: async ({ queryKey }) => {
      if (!searchQuery || searchQuery.length < 2) return null;
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  // Navigate to explore page with hashtag filter
  const handleHashtagClick = (hashtag: string) => {
    // Remove the # symbol if present
    const searchTerm = hashtag.startsWith('#') ? hashtag.substring(1) : hashtag;
    // Navigate to explore page with hashtag filter
    navigate(`/explore?hashtag=${encodeURIComponent(searchTerm)}`);
  };

  // Follow/unfollow a user
  const followUser = async (userId: number, isFollowing: boolean) => {
    try {
      if (isFollowing) {
        await apiRequest("DELETE", `/api/users/${userId}/follow`);
      } else {
        await apiRequest("POST", `/api/users/${userId}/follow`);
      }
      // Refetch search results to update followed status
      if (searchQuery) {
        const searchQueryKey = ["/api/search", searchQuery];
        const queryClient = await import("@/lib/queryClient").then(m => m.queryClient);
        queryClient.invalidateQueries({ queryKey: searchQueryKey });
      }
    } catch (error) {
      console.error("Failed to follow/unfollow user:", error);
    }
  };

  return (
    <div className="hidden lg:block w-80 h-screen sticky top-0 p-2 overflow-y-auto">
      {/* Search Bar */}
      <div className="p-3 sticky top-0 z-10 bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search Blogr" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-secondary border border-transparent focus:border-primary text-foreground rounded-full py-2 pl-10 pr-4 focus:outline-none"
          />
        </div>
      </div>
      
      {/* Search Results (when searching) */}
      {searchQuery && searchResults && (
        <div className="bg-card rounded-2xl mt-3 overflow-hidden">
          <h2 className="text-xl font-bold p-4">Search Results</h2>
          <div className="divide-y divide-border">
            {searchResults.users && searchResults.users.length > 0 ? (
              searchResults.users.map((user: SuggestedUser) => (
                <div key={user.id} className="p-4 hover:bg-secondary/50">
                  <div className="flex items-center justify-between">
                    <Link href={`/profile/${user.id}`}>
                      <a className="flex items-center gap-3">
                        <img 
                          src={user.profileImage || "https://via.placeholder.com/40"} 
                          alt={user.displayName} 
                          className="w-10 h-10 rounded-full object-cover" 
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold truncate">{user.displayName}</h4>
                          <p className="text-muted-foreground text-sm truncate">@{user.username}</p>
                        </div>
                      </a>
                    </Link>
                    {user.id !== currentUser?.id && (
                      <Button 
                        variant={user.isFollowing ? "outline" : "default"}
                        className="h-8 text-sm px-3"
                        onClick={() => followUser(user.id, user.isFollowing)}
                      >
                        {user.isFollowing ? "Unfollow" : "Follow"}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-muted-foreground">No users found</div>
            )}
            
            {searchResults.blogs && searchResults.blogs.length > 0 && (
              <>
                <div className="p-4 border-t border-border">
                  <h3 className="font-semibold mb-2">Blogs</h3>
                  {searchResults.blogs.map((blog: any) => (
                    <Link key={blog.id} href={`/blog/${blog.id}`}>
                      <a className="block p-2 hover:bg-secondary/50 rounded-md">
                        <p className="font-medium">{blog.title}</p>
                        <p className="text-sm text-muted-foreground">
                          By {blog.author.displayName}
                        </p>
                      </a>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Trending Hashtags (when not searching) */}
      {!searchQuery && (
        <div className="bg-card rounded-2xl mt-3 overflow-hidden">
          <h2 className="text-xl font-bold p-4">Trending Topics</h2>
          <div className="divide-y divide-border">
            {isLoadingHashtags ? (
              // Loading state
              <div className="p-4 text-muted-foreground">Loading trending hashtags...</div>
            ) : trendingHashtags && trendingHashtags.length > 0 ? (
              // Display real trending hashtags
              trendingHashtags.map((hashtag: TrendingHashtag, index) => (
                <div 
                  key={index} 
                  className="p-4 hover:bg-secondary/50 cursor-pointer"
                  onClick={() => handleHashtagClick(hashtag.hashtag)}
                >
                  <div className="text-muted-foreground text-sm">Trending in {hashtag.category || 'BlogX'}</div>
                  <div className="font-bold my-0.5">{hashtag.hashtag}</div>
                  <div className="text-muted-foreground text-sm">{hashtag.count.toLocaleString()} posts</div>
                </div>
              ))
            ) : (
              // No hashtags found
              <div className="p-4 text-muted-foreground">No trending hashtags found</div>
            )}
            {trendingHashtags && trendingHashtags.length > 0 && (
              <div className="p-4 hover:bg-secondary/50 cursor-pointer text-primary">
                Show more
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Footer Links */}
      <div className="p-4 text-muted-foreground text-sm">
        <div className="flex flex-wrap gap-1">
          <a href="#" className="hover:underline">Terms of Service</a>
          <span>·</span>
          <a href="#" className="hover:underline">Privacy Policy</a>
          <span>·</span>
          <a href="#" className="hover:underline">Cookie Policy</a>
          <span>·</span>
          <a href="#" className="hover:underline">Accessibility</a>
          <span>·</span>
          <a href="#" className="hover:underline">Ads Info</a>
          <span>·</span>
          <a href="#" className="hover:underline">More</a>
        </div>
        <div className="mt-2">© {new Date().getFullYear()} Blogr, Inc.</div>
        <div className="mt-2 flex items-center gap-1 text-muted-foreground">
          Made by Pranjal Sonowane <span className="text-red-500">♥</span>
        </div>
      </div>
    </div>
  );
}

function Search({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
