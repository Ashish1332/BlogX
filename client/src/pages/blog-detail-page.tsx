import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { 
  Heart, 
  MessageSquare, 
  Share2, 
  Bookmark, 
  MoreHorizontal,
  ArrowLeft,
  Loader2,
  Search,
  X,
  MessageSquareText,
  Link as LinkIcon,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { insertCommentSchema } from "@shared/schema";
import { z } from "zod";

export default function BlogDetailPage() {
  const { id } = useParams();
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch blog with refetching on window focus
  const { 
    data: blog = {}, 
    isLoading: isBlogLoading, 
    isError: isBlogError,
    refetch: refetchBlog 
  } = useQuery({
    queryKey: [`/api/blogs/${id}`],
    enabled: !!id && id.length === 24, // Ensure valid MongoDB id format
    refetchOnWindowFocus: true,
    staleTime: 0 // Always refetch for latest data
  });

  // Fetch comments with refetching on window focus
  const { 
    data: comments = [], 
    isLoading: isCommentsLoading, 
    isError: isCommentsError,
    refetch: refetchComments 
  } = useQuery({
    queryKey: [`/api/blogs/${id}/comments`],
    enabled: !!id && id.length === 24, // Ensure valid MongoDB id format
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0 // Always refetch for latest data
  });

  // Like mutation
  const likeMutation = useMutation({
    mutationFn: async () => {
      if (blog?.isLiked) {
        const res = await apiRequest("DELETE", `/api/blogs/${id}/like`);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/blogs/${id}/like`);
        return await res.json();
      }
    },
    onSuccess: (data) => {
      // Update the blog data with new like count and status
      queryClient.setQueryData([`/api/blogs/${id}`], {
        ...blog,
        likeCount: data.likeCount,
        isLiked: !blog?.isLiked,
      });
      
      // Invalidate queries to ensure consistent state across the app
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${blog.author?.id}/blogs`] });
    },
    onError: (error) => {
      toast({
        title: blog?.isLiked ? "Failed to unlike" : "Failed to like",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Bookmark mutation
  const bookmarkMutation = useMutation({
    mutationFn: async () => {
      if (blog?.isBookmarked) {
        const res = await apiRequest("DELETE", `/api/blogs/${id}/bookmark`);
        return await res.json();
      } else {
        const res = await apiRequest("POST", `/api/blogs/${id}/bookmark`);
        return await res.json();
      }
    },
    onSuccess: () => {
      // Update the blog data with new bookmark status
      queryClient.setQueryData([`/api/blogs/${id}`], {
        ...blog,
        isBookmarked: !blog?.isBookmarked,
      });
      if (!blog?.isBookmarked) {
        toast({
          title: "Blog saved",
          description: "Blog has been added to your bookmarks",
        });
      }
      
      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
    },
    onError: (error) => {
      toast({
        title: blog?.isBookmarked ? "Failed to remove bookmark" : "Failed to bookmark",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Delete blog mutation
  const deleteBlogMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/blogs/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Blog deleted",
        description: "Your blog has been deleted",
      });
      navigate("/");
      // Invalidate relevant queries
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

  // Post comment mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      try {
        // Validate comment
        insertCommentSchema.parse({ content });
        
        const res = await apiRequest("POST", `/api/blogs/${id}/comments`, { content });
        return await res.json();
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(error.errors[0].message);
        }
        throw error;
      }
    },
    onSuccess: () => {
      setComment("");
      refetchComments();
      // Update comment count in blog data locally
      if (blog) {
        queryClient.setQueryData([`/api/blogs/${id}`], {
          ...blog,
          commentCount: blog.commentCount + 1,
        });
      }
      
      // Invalidate all related queries to ensure consistency across app
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${blog?.author?.id}/blogs`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to post comment",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/comments/${commentId}`);
    },
    onSuccess: () => {
      refetchComments();
      // Update comment count in blog data locally
      if (blog) {
        queryClient.setQueryData([`/api/blogs/${id}`], {
          ...blog,
          commentCount: blog.commentCount > 0 ? blog.commentCount - 1 : 0,
        });
      }
      
      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/blogs/${id}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete comment",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Share via direct message mutation
  const shareMutation = useMutation({
    mutationFn: async ({ userId, message }: { userId: string, message?: string }) => {
      await apiRequest("POST", `/api/messages/share/${userId}`, { blogId: id, message });
    },
    onSuccess: () => {
      toast({
        title: "Blog shared!",
        description: "Blog post has been shared via direct message",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to share blog",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });
  
  // User search for sharing
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  
  // Get followers to share with
  const { 
    data: followers,
    isLoading: isFollowersLoading 
  } = useQuery({
    queryKey: [`/api/users/${user?._id || user?.id}/followers`],
    enabled: !!user && shareDialogOpen && !!(user?._id || user?.id),
  });
  
  // Filter followers based on search term
  const filteredFollowers = searchTerm && followers ? 
    followers.filter((follower: any) => 
      follower.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      follower.username.toLowerCase().includes(searchTerm.toLowerCase())
    ) : 
    followers;
  
  const handleShare = () => {
    // Clipboard share
    navigator.clipboard.writeText(`${window.location.origin}/blog/${id}`);
    toast({
      title: "Link copied!",
      description: "Blog link has been copied to clipboard",
    });
  };
  
  const handleShareViaMessage = (userId: string) => {
    shareMutation.mutate({ userId, message: shareMessage });
    setShareDialogOpen(false);
    setShareMessage("");
  };

  const handleDeleteBlog = () => {
    if (window.confirm("Are you sure you want to delete this blog?")) {
      deleteBlogMutation.mutate();
    }
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    commentMutation.mutate(comment);
  };

  const handleDeleteComment = (commentId: string) => {
    if (window.confirm("Are you sure you want to delete this comment?")) {
      deleteCommentMutation.mutate(commentId);
    }
  };

  const goBack = () => {
    navigate(-1);
  };

  if (!isClient) {
    return (
      <MainLayout pageTitle="Blog">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (isBlogLoading) {
    return (
      <MainLayout pageTitle="Blog">
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (isBlogError || !blog) {
    return (
      <MainLayout pageTitle="Blog Not Found">
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold mb-2">Blog not found</h2>
          <p className="text-muted-foreground mb-4">The blog you're looking for doesn't exist or has been removed.</p>
          <Button onClick={goBack}>Go Back</Button>
        </div>
      </MainLayout>
    );
  }

  // Handle MongoDB _id field or regular id field for users
  const userId = user?._id || user?.id;
  const authorId = blog.author?._id || blog.author?.id;
  const isAuthor = userId === authorId;
  const timeAgo = formatDistanceToNow(new Date(blog.createdAt), { addSuffix: true });

  return (
    <MainLayout pageTitle="Blog" showRightSidebar={false}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center">
          <button 
            onClick={goBack} 
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold text-xl">Blog</h1>
        </div>

        {/* Blog Content */}
        <article className="p-4 border-b border-border">
          {/* Author Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link href={`/profile/${blog.author?._id || blog.author?.id}`}>
                <a>
                  <img 
                    src={blog.author?.profileImage || "https://via.placeholder.com/40"} 
                    alt={blog.author?.displayName} 
                    className="w-12 h-12 rounded-full object-cover" 
                  />
                </a>
              </Link>
              <div>
                <Link href={`/profile/${blog.author?._id || blog.author?.id}`}>
                  <a className="font-bold hover:underline">{blog.author?.displayName}</a>
                </Link>
                <p className="text-muted-foreground text-sm">@{blog.author?.username}</p>
              </div>
            </div>

            {isAuthor && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-full hover:bg-secondary">
                    <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    className="text-destructive focus:text-destructive"
                    onClick={handleDeleteBlog}
                  >
                    Delete Blog
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Blog Title */}
          <h1 className="text-2xl font-bold mb-3">{blog.title}</h1>

          {/* Blog Content */}
          <div className="mb-4 whitespace-pre-wrap">{blog.content}</div>

          {/* Blog Image */}
          {blog.image && (
            <div className="mb-4 rounded-2xl overflow-hidden">
              <img 
                src={blog.image} 
                alt={blog.title} 
                className="w-full h-auto" 
              />
            </div>
          )}

          {/* Blog Metadata */}
          <div className="text-muted-foreground text-sm mb-4">
            {timeAgo}
          </div>

          {/* Interaction Stats */}
          <div className="flex items-center gap-4 py-3 border-y border-border mb-4">
            <div className="flex items-center gap-1">
              <span className="font-semibold">{blog.commentCount}</span>
              <span className="text-muted-foreground">Comments</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{blog.likeCount}</span>
              <span className="text-muted-foreground">Likes</span>
            </div>
          </div>

          {/* Interaction Buttons */}
          <div className="flex justify-between text-muted-foreground">
            <button 
              className="flex items-center gap-1 hover:text-primary group"
              aria-label="Comment"
            >
              <div className="p-2 rounded-full group-hover:bg-primary/10">
                <MessageSquare size={20} />
              </div>
            </button>
            
            {/* Share Button with Dialog */}
            <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
              <DialogTrigger asChild>
                <button 
                  className="flex items-center gap-1 hover:text-green-500 group"
                  aria-label="Share"
                >
                  <div className="p-2 rounded-full group-hover:bg-green-500/10">
                    <Share2 size={20} />
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Share Blog Post</DialogTitle>
                  <DialogDescription>
                    Share this blog post with your friends or copy the link
                  </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col gap-4 py-4">
                  {/* Copy Link Option */}
                  <div 
                    className="flex items-center justify-between p-3 border rounded-md cursor-pointer hover:bg-secondary"
                    onClick={handleShare}
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <LinkIcon size={20} className="text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">Copy Link</h4>
                        <p className="text-sm text-muted-foreground">Share via clipboard</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Direct Message Option */}
                  <div className="border rounded-md p-3">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <MessageSquareText size={20} className="text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">Send as Message</h4>
                        <p className="text-sm text-muted-foreground">Share with specific people</p>
                      </div>
                    </div>
                    
                    {/* Message Input */}
                    <Textarea
                      placeholder="Add a message (optional)"
                      value={shareMessage}
                      onChange={(e) => setShareMessage(e.target.value)}
                      className="mb-3"
                    />
                    
                    {/* Search Users */}
                    <div className="relative mb-3">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search followers"
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-2 top-2.5"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                    
                    {/* User List */}
                    <div className="max-h-60 overflow-y-auto pr-1">
                      {isFollowersLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      ) : !filteredFollowers || filteredFollowers.length === 0 ? (
                        <div className="text-center py-4">
                          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-muted-foreground text-sm">
                            {searchTerm 
                              ? "No matching followers found" 
                              : "You don't have any followers yet"}
                          </p>
                        </div>
                      ) : (
                        filteredFollowers.map((follower: any) => (
                          <div 
                            key={follower._id} 
                            className="flex items-center justify-between p-2 rounded-md hover:bg-secondary cursor-pointer"
                            onClick={() => handleShareViaMessage(follower._id)}
                          >
                            <div className="flex items-center gap-2">
                              <img 
                                src={follower.profileImage || "https://via.placeholder.com/40"} 
                                alt={follower.displayName} 
                                className="w-8 h-8 rounded-full object-cover" 
                              />
                              <div>
                                <p className="font-medium">{follower.displayName}</p>
                                <p className="text-xs text-muted-foreground">@{follower.username}</p>
                              </div>
                            </div>
                            <Button 
                              size="sm" 
                              className="h-8"
                              disabled={shareMutation.isPending}
                            >
                              Share
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                
                <DialogFooter className="sm:justify-start">
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">
                      Close
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <button 
              className={`flex items-center gap-1 group ${blog.isLiked ? 'text-pink-500' : 'hover:text-pink-500'}`}
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
              aria-label={blog.isLiked ? "Unlike" : "Like"}
            >
              <div className={`p-2 rounded-full ${blog.isLiked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'}`}>
                {blog.isLiked ? (
                  <Heart size={20} fill="currentColor" />
                ) : (
                  <Heart size={20} />
                )}
              </div>
            </button>
            <button 
              className={`flex items-center gap-1 group ${blog.isBookmarked ? 'text-primary' : 'hover:text-primary'}`}
              onClick={() => bookmarkMutation.mutate()}
              disabled={bookmarkMutation.isPending}
              aria-label={blog.isBookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <div className={`p-2 rounded-full ${blog.isBookmarked ? 'bg-primary/10' : 'group-hover:bg-primary/10'}`}>
                {blog.isBookmarked ? (
                  <Bookmark size={20} fill="currentColor" />
                ) : (
                  <Bookmark size={20} />
                )}
              </div>
            </button>
          </div>
        </article>

        {/* Comment Input */}
        {user && (
          <div className="p-4 border-b border-border">
            <form onSubmit={handlePostComment} className="flex flex-col gap-3">
              <div className="flex gap-3">
                <img 
                  src={user.profileImage || "https://via.placeholder.com/40"} 
                  alt={user.displayName} 
                  className="w-10 h-10 rounded-full object-cover"
                />
                <Textarea
                  placeholder="Write a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="flex-1 min-h-[80px]"
                />
              </div>
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={!comment.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Posting...
                    </>
                  ) : (
                    "Post"
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Comments */}
        <div className="divide-y divide-border">
          <div className="p-4">
            <h2 className="font-bold text-xl">Comments</h2>
          </div>

          {isCommentsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : isCommentsError ? (
            <div className="p-4 text-center">
              <p className="text-destructive mb-2">Failed to load comments</p>
              <Button 
                variant="outline" 
                onClick={() => refetchComments()}
              >
                Try Again
              </Button>
            </div>
          ) : comments && comments.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">No comments yet</p>
              <p className="text-sm text-muted-foreground">Be the first to comment on this blog!</p>
            </div>
          ) : (
            comments && comments.map((comment: any) => (
              <div key={comment._id || comment.id} className="p-4 hover:bg-secondary/50">
                <div className="flex gap-3">
                  <Link href={`/profile/${comment.user?._id || comment.user?.id}`}>
                    <a>
                      <img 
                        src={comment.user?.profileImage || "https://via.placeholder.com/40"} 
                        alt={comment.user?.displayName} 
                        className="w-10 h-10 rounded-full object-cover" 
                      />
                    </a>
                  </Link>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <Link href={`/profile/${comment.user?._id || comment.user?.id}`}>
                          <a className="font-bold hover:underline">{comment.user?.displayName}</a>
                        </Link>
                        <span className="text-muted-foreground mx-1">·</span>
                        <span className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      {(user?._id || user?.id) === (comment.user?._id || comment.user?.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-muted-foreground rounded-full p-1 hover:bg-secondary">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteComment(comment._id || comment.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <p className="mt-1">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
}
