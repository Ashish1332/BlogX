import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import BlogCard from "@/components/blog/BlogCard";
import CreateBlogInput from "@/components/blog/CreateBlogInput";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"for-you" | "following">("for-you");
  const [page, setPage] = useState(1);

  const forYouQuery = useQuery({
    queryKey: ["/api/blogs", page],
    queryFn: async ({ queryKey }) => {
      const [_, pageNum] = queryKey;
      const res = await fetch(`/api/blogs?page=${pageNum}&limit=10`);
      if (!res.ok) throw new Error("Failed to fetch blogs");
      return res.json();
    },
    enabled: activeTab === "for-you",
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  const followingQuery = useQuery({
    queryKey: ["/api/blogs/feed", page],
    queryFn: async ({ queryKey }) => {
      const [_, pageNum] = queryKey;
      const res = await fetch(`/api/blogs/feed?page=${pageNum}&limit=10`);
      if (!res.ok) throw new Error("Failed to fetch blogs");
      return res.json();
    },
    enabled: activeTab === "following",
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });

  const currentQuery = activeTab === "for-you" ? forYouQuery : followingQuery;
  const blogs = currentQuery.data || [];
  const isLoading = currentQuery.isLoading;
  const isError = currentQuery.isError;

  const loadMore = () => {
    setPage(prev => prev + 1);
  };

  const handleDeleteBlog = (blogId: number) => {
    // Filter out the deleted blog from the UI
    if (activeTab === "for-you" && forYouQuery.data) {
      const updatedBlogs = forYouQuery.data.filter((blog: any) => blog.id !== blogId);
      forYouQuery.updateData(old => updatedBlogs);
    } else if (activeTab === "following" && followingQuery.data) {
      const updatedBlogs = followingQuery.data.filter((blog: any) => blog.id !== blogId);
      followingQuery.updateData(old => updatedBlogs);
    }
  };

  return (
    <MainLayout pageTitle="Home">
      <div className="flex mt-0 border-b border-border">
        <button 
          className={`flex-1 py-3 text-center font-bold ${activeTab === "for-you" ? 'border-b-4 border-primary' : 'text-muted-foreground hover:bg-secondary'}`}
          onClick={() => setActiveTab("for-you")}
        >
          For You
        </button>
        <button 
          className={`flex-1 py-3 text-center font-bold ${activeTab === "following" ? 'border-b-4 border-primary' : 'text-muted-foreground hover:bg-secondary'}`}
          onClick={() => setActiveTab("following")}
        >
          Following
        </button>
      </div>

      <CreateBlogInput />
      
      <div className="divide-y divide-border">
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {isError && (
          <div className="py-8 text-center">
            <p className="text-destructive mb-2">Failed to load blogs</p>
            <Button 
              variant="outline" 
              onClick={() => currentQuery.refetch()}
            >
              Try Again
            </Button>
          </div>
        )}

        {!isLoading && !isError && blogs.length === 0 && (
          <div className="py-10 text-center">
            {activeTab === "following" ? (
              <>
                <h3 className="text-xl font-semibold mb-2">Follow more people to see their blogs</h3>
                <p className="text-muted-foreground mb-4">When you follow people, their blogs will show up here.</p>
                <Button onClick={() => setActiveTab("for-you")}>
                  Switch to For You
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">No blogs available right now. Check back later!</p>
            )}
          </div>
        )}

        {blogs.map((blog: any) => (
          <BlogCard 
            key={blog.id} 
            blog={blog} 
            onDelete={handleDeleteBlog}
          />
        ))}

        {blogs.length > 0 && (
          <div className="py-4 text-center">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={currentQuery.isFetching}
            >
              {currentQuery.isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
