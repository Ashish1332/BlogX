import { useState, useEffect } from "react";
import { X, Image, Film, Link as LinkIcon, BarChart2, Smile, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Globe } from "lucide-react";

interface BlogEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  editMode?: boolean;
  blogId?: number;
}

const blogSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long"),
  content: z.string().min(1, "Content is required")
});

export default function BlogEditor({ 
  isOpen, 
  onClose, 
  initialContent = "", 
  editMode = false,
  blogId
}: BlogEditorProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft] = useState(false);

  useEffect(() => {
    if (isOpen && editMode && blogId) {
      // Fetch blog data if in edit mode
      const fetchBlog = async () => {
        try {
          const response = await fetch(`/api/blogs/${blogId}`);
          if (!response.ok) throw new Error("Failed to fetch blog");
          const blog = await response.json();
          setTitle(blog.title);
          setContent(blog.content);
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to load blog content",
            variant: "destructive"
          });
        }
      };
      
      fetchBlog();
    } else if (isOpen && initialContent) {
      setContent(initialContent);
    }
  }, [isOpen, editMode, blogId, initialContent]);

  const saveDraft = () => {
    // Save draft locally (could be enhanced with local storage)
    setDraft(true);
    toast({
      title: "Draft saved",
      description: "Your blog draft has been saved",
    });
    onClose();
  };

  const publishMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
      if (editMode && blogId) {
        const res = await apiRequest("PUT", `/api/blogs/${blogId}`, data);
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/blogs", data);
        return await res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: editMode ? "Blog updated" : "Blog published!",
        description: editMode 
          ? "Your blog has been updated successfully" 
          : "Your blog has been published successfully",
      });
      setTitle("");
      setContent("");
      setDraft(false);
      onClose();
      // Invalidate queries to refresh the feed
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
      if (blogId) {
        queryClient.invalidateQueries({ queryKey: [`/api/blogs/${blogId}`] });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handlePublish = () => {
    try {
      const validatedData = blogSchema.parse({ title, content });
      publishMutation.mutate(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
      <div 
        className="bg-background rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-auto my-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center">
          <button className="rounded-full hover:bg-secondary p-2" onClick={onClose}>
            <X />
          </button>
          <Button
            variant="outline"
            onClick={saveDraft}
          >
            Save Draft
          </Button>
        </div>
        <div className="p-4">
          <div className="mb-4">
            <input 
              type="text" 
              placeholder="Title" 
              className="w-full bg-transparent border-b border-border pb-2 text-xl font-bold focus:outline-none focus:border-primary"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="mb-4 flex gap-2">
            <div className="flex items-center gap-2 text-primary border border-border rounded-full px-3 py-1.5">
              <Globe size={14} />
              <span className="text-sm">Everyone</span>
            </div>
          </div>
          <div className="mb-4">
            <textarea 
              placeholder="What's on your mind?" 
              className="w-full bg-transparent min-h-[200px] resize-none focus:outline-none text-lg"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="flex justify-between items-center border-t border-border pt-4">
            <div className="flex gap-2 text-primary">
              <button className="p-2 rounded-full hover:bg-primary/10">
                <Image size={18} />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10">
                <Film size={18} />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10">
                <LinkIcon size={18} />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10">
                <BarChart2 size={18} />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10">
                <Smile size={18} />
              </button>
              <button className="p-2 rounded-full hover:bg-primary/10">
                <Calendar size={18} />
              </button>
            </div>
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending}
            >
              {editMode ? "Update" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
