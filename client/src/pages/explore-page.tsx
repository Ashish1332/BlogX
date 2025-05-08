import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import BlogCard from "@/components/blog/BlogCard";
import { Loader2, Search, Tag, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { User } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"trending" | "search" | "interests">("trending");
  const [isClient, setIsClient] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Available blog categories - should match the ones in BlogEditor
  const categories = [
    "Technology",
    "Environment",
    "Science",
    "Bollywood",
    "Space",
    "Information Technology",
    "Health",
    "Travel",
    "Food",
    "Fashion",
    "Sports",
    "Entertainment",
    "Politics",
    "Business",
    "Education"
  ];

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get trending blogs
  const { 
    data: trendingBlogs, 
    isLoading: isTrendingLoading, 
    isError: isTrendingError,
    refetch: refetchTrending
  } = useQuery({
    queryKey: ["/api/blogs/trending"],
    enabled: activeTab === "trending",
  });

  // Search results
  const { 
    data: searchResults, 
    isLoading: isSearchLoading, 
    isError: isSearchError,
    refetch: refetchSearch 
  } = useQuery({
    queryKey: ["/api/search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return null;
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: !!searchQuery.trim() && activeTab === "search",
  });
  
  // Category filtered blogs
  const {
    data: categoryBlogs,
    isLoading: isCategoryLoading,
    isError: isCategoryError,
    refetch: refetchCategory
  } = useQuery({
    queryKey: ["/api/blogs/category", selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      const res = await fetch(`/api/blogs?category=${encodeURIComponent(selectedCategory)}`);
      if (!res.ok) throw new Error("Failed to fetch blogs for category");
      return res.json();
    },
    enabled: activeTab === "interests" && !!selectedCategory,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab("search");
      refetchSearch();
    }
  };

  const handleDeleteBlog = (blogId: string) => {
    if (activeTab === "trending") {
      refetchTrending();
    } else if (activeTab === "search") {
      refetchSearch();
    } else if (activeTab === "interests") {
      refetchCategory();
    }
  };
  
  // Handle category selection
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    if (activeTab !== "interests") {
      setActiveTab("interests");
    }
    refetchCategory();
  };

  // Don't render anything during SSR to avoid hydration mismatch with date formatting
  if (!isClient) {
    return (
      <MainLayout pageTitle="Explore">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Explore">
      {/* Search Bar */}
      <div className="p-4 border-b border-border">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
          <Input
            type="text"
            placeholder="Search for people and blogs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 bg-secondary border-transparent focus:border-primary"
          />
        </form>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "trending" | "search" | "interests")}>
        <TabsList className="w-full border-b border-border rounded-none">
          <TabsTrigger value="trending" className="flex-1">Trending</TabsTrigger>
          <TabsTrigger value="interests" className="flex-1">Interests</TabsTrigger>
          <TabsTrigger value="search" className="flex-1" disabled={!searchQuery.trim()}>Search</TabsTrigger>
        </TabsList>

        {/* Trending Tab */}
        <TabsContent value="trending">
          {isTrendingLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : isTrendingError ? (
            <div className="py-8 text-center">
              <p className="text-destructive mb-2">Failed to load trending blogs</p>
              <Button 
                variant="outline" 
                onClick={() => refetchTrending()}
              >
                Try Again
              </Button>
            </div>
          ) : trendingBlogs && trendingBlogs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No trending blogs available right now</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {trendingBlogs && trendingBlogs.map((blog: any) => (
                <BlogCard 
                  key={blog._id} 
                  blog={blog} 
                  onDelete={handleDeleteBlog}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Search Results Tab */}
        {/* Interests Tab */}
        <TabsContent value="interests">
          <div className="p-4">
            <h2 className="text-lg font-bold mb-3">Browse by Interest</h2>
            <ScrollArea className="max-h-[200px] mb-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-1">
                {categories.map((category) => (
                  <Badge 
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1.5 flex items-center gap-1 justify-center"
                    onClick={() => handleCategorySelect(category)}
                  >
                    <Tag size={12} />
                    {category}
                  </Badge>
                ))}
              </div>
            </ScrollArea>
            
            {selectedCategory ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Tag size={16} className="text-primary" />
                    {selectedCategory}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedCategory(null)}
                  >
                    Clear
                  </Button>
                </div>
                
                {isCategoryLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : isCategoryError ? (
                  <div className="py-8 text-center">
                    <p className="text-destructive mb-2">Failed to load blogs</p>
                    <Button 
                      variant="outline" 
                      onClick={() => refetchCategory()}
                    >
                      Try Again
                    </Button>
                  </div>
                ) : categoryBlogs && categoryBlogs.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-muted-foreground">No blogs found in this category</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {categoryBlogs && categoryBlogs.map((blog: any) => (
                      <BlogCard 
                        key={blog._id} 
                        blog={blog} 
                        onDelete={() => refetchCategory()}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-muted-foreground">
                  Select a category to browse blogs
                </p>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="search">
          {isSearchLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : isSearchError ? (
            <div className="py-8 text-center">
              <p className="text-destructive mb-2">Search failed</p>
              <Button 
                variant="outline" 
                onClick={() => refetchSearch()}
              >
                Try Again
              </Button>
            </div>
          ) : !searchResults ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">
                Enter a search term to find blogs and people
              </p>
            </div>
          ) : (
            <>
              {/* Users section */}
              {searchResults.users && searchResults.users.length > 0 && (
                <div className="border-b border-border p-4">
                  <h2 className="text-lg font-bold mb-4">People</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {searchResults.users.map((user: User) => (
                      <Link key={user._id} href={`/profile/${user._id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition cursor-pointer">
                          {user.profileImage ? (
                            <img 
                              src={user.profileImage} 
                              alt={user.displayName} 
                              className="w-12 h-12 rounded-full object-cover" 
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                              {user.displayName?.charAt(0)?.toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold">{user.displayName}</h3>
                            <p className="text-sm text-muted-foreground">@{user.username}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Blogs section */}
              {searchResults.blogs && searchResults.blogs.length > 0 ? (
                <div className="divide-y divide-border">
                  <div className="p-4">
                    <h2 className="text-lg font-bold">Blogs</h2>
                  </div>
                  {searchResults.blogs.map((blog: any) => (
                    <BlogCard 
                      key={blog._id} 
                      blog={blog} 
                      onDelete={handleDeleteBlog}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center border-t border-border">
                  <p className="text-muted-foreground">No matching blogs found</p>
                </div>
              )}

              {/* No results at all */}
              {(!searchResults.users || searchResults.users.length === 0) &&
               (!searchResults.blogs || searchResults.blogs.length === 0) && (
                <div className="py-12 text-center">
                  <p className="text-xl font-semibold mb-2">No results found</p>
                  <p className="text-muted-foreground">
                    Try different keywords or check your spelling
                  </p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
