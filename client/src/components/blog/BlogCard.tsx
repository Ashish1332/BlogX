import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark, 
  ExternalLink,
  MoreHorizontal
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShareMessageButton } from "@/components/ui/share-message-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Function to format blog content with proper headings and paragraphs
function formatBlogContent(content: string, expanded: boolean): string {
  if (!content) return '';
  
  // Limit content length if not expanded
  let processedContent = content;
  if (!expanded && content.length > 250) {
    processedContent = content.substring(0, 250) + '...';
  }
  
  // Process content to add proper formatting
  return processedContent
    .split('\n\n')
    .map(paragraph => {
      if (paragraph.startsWith('## ')) {
        return `<h2 class="text-xl font-bold my-3">${paragraph.substring(3)}</h2>`;
      }
      return `<p class="my-2">${paragraph}</p>`;
    })
    .join('');
}

interface BlogCardProps {
  blog: {
    _id: string;
    id?: string; // For backward compatibility
    title: string;
    content: string;
    image?: string;
    createdAt: string;
    likeCount: number;
    commentCount: number;
    isLiked?: boolean;
    isBookmarked?: boolean;
    author: {
      _id: string;
      id?: string; // For backward compatibility
      username: string;
      displayName: string;
      profileImage?: string;
    };
  };
  onDelete?: (blogId: string) => void;
}

export default function BlogCard({ blog, onDelete }: BlogCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [liked, setLiked] = useState(blog.isLiked || false);
  const [likeCount, setLikeCount] = useState(blog.likeCount);
  const [bookmarked, setBookmarked] = useState(blog.isBookmarked || false);

  // Get the proper blog ID (MongoDB _id or fallback to .id)
  const blogId = blog._id || blog.id;
  
  const likeMutation = useMutation({
    mutationFn: async () => {
      if (liked) {
        const res = await apiRequest("DELETE", `/api/blogs/${blogId}/like`);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/blogs/${blogId}/like`);
        return await res.json();
      }
    },
    onSuccess: (data) => {
      setLiked(!liked);
      setLikeCount(data.likeCount);
    },
    onError: (error) => {
      toast({
        title: liked ? "Failed to unlike" : "Failed to like",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (bookmarked) {
        const res = await apiRequest("DELETE", `/api/blogs/${blogId}/bookmark`);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/blogs/${blogId}/bookmark`);
        return await res.json();
      }
    },
    onSuccess: () => {
      setBookmarked(!bookmarked);
      if (!bookmarked) {
        toast({
          title: "Blog saved",
          description: "Blog has been added to your bookmarks",
        });
      }
      // Invalidate bookmarks query if we're on the bookmarks page
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
    onError: (error) => {
      toast({
        title: bookmarked ? "Failed to remove bookmark" : "Failed to bookmark",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/blogs/${blogId}`);
    },
    onSuccess: () => {
      toast({
        title: "Blog deleted",
        description: "Your blog has been deleted",
      });
      if (onDelete && blogId) {
        onDelete(blogId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete blog",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleLike = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to like blogs",
        variant: "destructive",
      });
      return;
    }
    likeMutation.mutate();
  };

  const handleBookmark = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to bookmark blogs",
        variant: "destructive",
      });
      return;
    }
    bookmarkMutation.mutate();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/blog/${blogId}`);
    toast({
      title: "Link copied!",
      description: "Blog link has been copied to clipboard",
    });
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this blog?")) {
      deleteMutation.mutate();
    }
  };

  const timeAgo = formatDistanceToNow(new Date(blog.createdAt), { addSuffix: true });
  
  // Get author ID (MongoDB _id or fallback to .id)
  const authorId = blog.author._id || blog.author.id;
  const userId = user?._id || user?.id;
  const isAuthor = userId === authorId;

  return (
    <article className="p-4 hover:bg-secondary/50 transition cursor-pointer">
      <div className="flex gap-3">
        <div>
          <Link href={`/profile/${authorId}`}>
            <a>
              <img 
                src={blog.author.profileImage || "https://via.placeholder.com/40"} 
                alt={blog.author.displayName} 
                className="w-10 h-10 rounded-full object-cover" 
              />
            </a>
          </Link>
        </div>
        <div className="flex-1 min-w-0">
          {/* Blog Header */}
          <div className="flex items-center justify-between gap-1 mb-1">
            <div className="flex items-center gap-1">
              <Link href={`/profile/${authorId}`}>
                <a className="font-bold hover:underline">{blog.author.displayName}</a>
              </Link>
              <span className="text-muted-foreground">@{blog.author.username}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground hover:underline">{timeAgo}</span>
            </div>
            
            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-full hover:bg-secondary">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={handleDelete}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          {/* Blog Title */}
          <Link href={`/blog/${blogId}`}>
            <a>
              <h2 className="text-lg font-bold mb-2">{blog.title}</h2>
            </a>
          </Link>
          
          {/* Blog Image - Placed immediately after title with fixed dimensions */}
          {blog.image && (
            <Link href={`/blog/${blogId}`}>
              <a className="block mb-4 rounded-xl overflow-hidden">
                <img 
                  src={blog.image} 
                  alt={blog.title} 
                  className="w-full max-h-[300px] object-cover" 
                />
              </a>
            </Link>
          )}
          
          {/* Blog Content */}
          <div 
            className={`blog-content mb-3 ${expanded ? 'expanded' : ''}`}
            dangerouslySetInnerHTML={{
              __html: formatBlogContent(blog.content, expanded)
            }}
          />
          
          {blog.content.length > 250 && (
            <button 
              className="text-primary text-sm mb-3 hover:underline"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
          
          {/* Interaction Buttons */}
          <div className="flex justify-between text-muted-foreground">
            <Link href={`/blog/${blogId}`}>
              <a className="flex items-center gap-1 hover:text-primary group">
                <div className="p-2 rounded-full group-hover:bg-primary/10">
                  <MessageSquare size={18} />
                </div>
                <span>{blog.commentCount}</span>
              </a>
            </Link>
            {/* Copy Link Button */}
            <button 
              className="flex items-center gap-1 hover:text-green-500 group"
              onClick={handleShare}
              title="Copy link to clipboard"
            >
              <div className="p-2 rounded-full group-hover:bg-green-500/10">
                <Share2 size={18} />
              </div>
            </button>
            {/* Share via DM Button */}
            <ShareMessageButton
              blogId={blogId}
              blogTitle={blog.title}
            />
            {/* Like Button */}
            <button 
              className={`flex items-center gap-1 group ${liked ? 'text-pink-500' : 'hover:text-pink-500'}`}
              onClick={handleLike}
              disabled={likeMutation.isPending}
            >
              <div className={`p-2 rounded-full ${liked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'}`}>
                {liked ? (
                  <Heart size={18} fill="currentColor" />
                ) : (
                  <Heart size={18} />
                )}
              </div>
              <span>{likeCount}</span>
            </button>
            {/* Bookmark Button */}
            <button 
              className={`flex items-center gap-1 group ${bookmarked ? 'text-primary' : 'hover:text-primary'}`}
              onClick={handleBookmark}
              disabled={bookmarkMutation.isPending}
            >
              <div className={`p-2 rounded-full ${bookmarked ? 'bg-primary/10' : 'group-hover:bg-primary/10'}`}>
                {bookmarked ? (
                  <Bookmark size={18} fill="currentColor" />
                ) : (
                  <Bookmark size={18} />
                )}
              </div>
            </button>
            {/* View Blog Button */}
            <Link href={`/blog/${blogId}`}>
              <a className="flex items-center gap-1 hover:text-primary p-2 rounded-full hover:bg-primary/10" title="View full post">
                <ExternalLink size={18} />
              </a>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
