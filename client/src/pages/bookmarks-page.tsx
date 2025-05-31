import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import BlogCard from "@/components/blog/BlogCard";
import { Loader2, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BookmarksPage() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { 
    data: bookmarks, 
    isLoading, 
    isError,
    refetch 
  } = useQuery({
    queryKey: ["/api/bookmarks"],
    queryFn: async () => {
      const res = await fetch("/api/bookmarks");
      if (!res.ok) throw new Error("Failed to fetch bookmarks");
      return res.json();
    },
  });

  const handleDeleteBlog = (blogId: number) => {
    // Refresh the bookmarks list after deletion
    refetch();
  };

  // Don't render anything during SSR to avoid hydration mismatch with date formatting
  if (!isClient) {
    return (
      <MainLayout pageTitle="Bookmarks">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout pageTitle="Bookmarks">
      {/* Loading state */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="py-8 text-center">
          <p className="text-destructive mb-2">Failed to load bookmarks</p>
          <Button 
            variant="outline" 
            onClick={() => refetch()}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && bookmarks && bookmarks.length === 0 && (
        <div className="py-12 text-center">
          <Bookmark className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No bookmarks yet</h3>
          <p className="text-muted-foreground">
            Save blogs to read later by bookmarking them. They'll appear here.
          </p>
        </div>
      )}

      {/* Bookmarks list */}
      <div className="divide-y divide-border">
        {bookmarks && bookmarks.map((blog: any) => (
          <BlogCard 
            key={blog.id} 
            blog={blog} 
            onDelete={handleDeleteBlog}
          />
        ))}
      </div>
    </MainLayout>
  );
}
