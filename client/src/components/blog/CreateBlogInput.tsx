import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Image, 
  Film, 
  BarChart2, 
  Smile, 
  Calendar, 
  MapPin 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import BlogEditor from "./BlogEditor";

export default function CreateBlogInput() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  const createBlogMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string, content: string }) => {
      const res = await apiRequest("POST", "/api/blogs", { title, content });
      return await res.json();
    },
    onSuccess: () => {
      setContent("");
      toast({
        title: "Blog created!",
        description: "Your blog has been published",
      });
      // Invalidate queries to refresh the feed
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to create blog",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleOpenEditor = () => {
    setIsEditorOpen(true);
  };

  const handleQuickPost = () => {
    if (!content.trim()) {
      toast({
        title: "Empty blog",
        description: "Please write something first!",
        variant: "destructive",
      });
      return;
    }

    // For quick posts, use the first line as title, or first few words if no newline
    const lines = content.split('\n');
    let title = lines[0];
    
    // If title is too long, truncate it
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    // If content is empty after taking the title, prevent submission
    const remainingContent = lines.length > 1 ? lines.slice(1).join('\n') : content;
    if (!remainingContent.trim()) {
      toast({
        title: "Content too short",
        description: "Please add more content to your blog",
        variant: "destructive",
      });
      return;
    }

    createBlogMutation.mutate({ 
      title, 
      content: remainingContent
    });
  };

  if (!user) return null;

  return (
    <>
      <div className="p-4 border-b border-border">
        <div className="flex gap-3">
          <img 
            src={user.profileImage || "https://via.placeholder.com/40"} 
            alt={user.displayName} 
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1">
            <div className="mb-2">
              <textarea 
                ref={textareaRef}
                className="w-full bg-transparent outline-none resize-none text-xl"
                placeholder="What's happening?"
                rows={2}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onClick={handleOpenEditor}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex gap-2 text-primary">
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <Image size={18} />
                </button>
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <Film size={18} />
                </button>
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <BarChart2 size={18} />
                </button>
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <Smile size={18} />
                </button>
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <Calendar size={18} />
                </button>
                <button className="p-2 rounded-full hover:bg-primary/10" onClick={handleOpenEditor}>
                  <MapPin size={18} />
                </button>
              </div>
              <Button
                onClick={handleQuickPost}
                disabled={!content.trim() || createBlogMutation.isPending}
                className={!content.trim() ? "opacity-50" : ""}
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      </div>

      <BlogEditor 
        isOpen={isEditorOpen} 
        onClose={() => setIsEditorOpen(false)} 
        initialContent={content}
      />
    </>
  );
}
