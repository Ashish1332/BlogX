import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { X, Image, Upload, Link as LinkIcon, Heading, Type, Smile, Hash, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface BlogEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  editMode?: boolean;
  blogId?: string;
}

const blogSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title is too long"),
  content: z.string().min(1, "Content is required"),
  image: z.string().optional(),
  category: z.string().optional(),
  hashtags: z.array(z.string()).optional()
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
  const [blogImage, setBlogImage] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState<string>("");
  const [draft, setDraft] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("write");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Available blog categories
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
    if (isOpen && editMode && blogId) {
      // Fetch blog data if in edit mode
      const fetchBlog = async () => {
        try {
          const response = await fetch(`/api/blogs/${blogId}`);
          if (!response.ok) throw new Error("Failed to fetch blog");
          const blog = await response.json();
          setTitle(blog.title);
          setContent(blog.content);
          if (blog.image) {
            setBlogImage(blog.image);
          }
          if (blog.category) {
            setCategory(blog.category);
          }
          if (blog.hashtags && Array.isArray(blog.hashtags)) {
            setHashtags(blog.hashtags);
          }
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

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select an image less than 5MB",
        variant: "destructive"
      });
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select a valid image file",
        variant: "destructive"
      });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("blogImage", file);
      
      const response = await fetch("/api/upload/blog-image", {
        method: "POST",
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload image");
      }
      
      const data = await response.json();
      setBlogImage(data.imageUrl);
      toast({
        title: "Image uploaded",
        description: "Your image has been uploaded successfully",
      });
    } catch (error) {
      console.error("Image upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const publishMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      content: string; 
      image?: string;
      category?: string;
      hashtags?: string[];
    }) => {
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
      setBlogImage(null);
      setCategory("");
      setHashtags([]);
      setHashtagInput("");
      setDraft(false);
      onClose();
      // Invalidate queries to refresh the feed
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/trending"] });
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

  const handleAddHeading = () => {
    const headingText = "## Heading";
    const newContent = content ? `${content}\n\n${headingText}\n` : `${headingText}\n`;
    setContent(newContent);
  };

  const handleAddParagraph = () => {
    const paragraphText = "\nNew paragraph. Start typing here...\n";
    setContent(content + paragraphText);
  };

  // Function to handle hashtag input
  const handleHashtagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (hashtagInput.trim()) {
        // Remove # if present and spaces
        const formattedTag = hashtagInput.trim().replace(/^#/, '').replace(/\s+/g, '');
        if (formattedTag && !hashtags.includes(formattedTag)) {
          setHashtags([...hashtags, formattedTag]);
        }
        setHashtagInput('');
      }
    }
  };

  const removeHashtag = (tagToRemove: string) => {
    setHashtags(hashtags.filter(tag => tag !== tagToRemove));
  };

  const handlePublish = () => {
    try {
      const blogData = {
        title,
        content,
        ...(blogImage && { image: blogImage }),
        ...(category && { category }),
        ...(hashtags.length > 0 && { hashtags })
      };
      
      const validatedData = blogSchema.parse(blogData);
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

  // Format the content for preview
  const formatContentForPreview = () => {
    // Basic formatting: convert line breaks to paragraphs
    // and ## headings to h2 elements
    if (!content) return '';
    
    return content
      .split('\n\n')
      .map(paragraph => {
        if (paragraph.startsWith('## ')) {
          return `<h2 class="text-xl font-bold my-3">${paragraph.substring(3)}</h2>`;
        }
        return `<p class="my-2">${paragraph}</p>`;
      })
      .join('');
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
          
          {/* Image upload input (hidden) */}
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files && handleImageUpload(e.target.files[0])}
          />
          
          {/* Image preview */}
          {blogImage && (
            <div className="mb-4 relative">
              <img 
                src={blogImage} 
                alt="Blog image" 
                className="w-full h-auto rounded-lg"
              />
              <button 
                className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"
                onClick={() => setBlogImage(null)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          
          {/* Category selection */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Tag size={16} className="text-primary" />
              <span className="text-sm font-medium">Category</span>
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Hashtags input */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Hash size={16} className="text-primary" />
              <span className="text-sm font-medium">Hashtags</span>
            </div>
            <div className="flex gap-2 flex-wrap mb-2">
              {hashtags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 px-3 py-1">
                  #{tag}
                  <button 
                    className="ml-1 hover:text-destructive" 
                    onClick={() => removeHashtag(tag)}
                  >
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onKeyDown={handleHashtagKeyDown}
              placeholder="Type hashtag and press Enter"
              className="w-full"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Press Enter or comma (,) to add hashtags
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
            <TabsList className="mb-2">
              <TabsTrigger value="write">Write</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            
            <TabsContent value="write" className="min-h-[200px]">
              <textarea 
                placeholder="What's on your mind? Use blank lines to separate paragraphs. Use ## to create headings." 
                className="w-full bg-transparent min-h-[200px] resize-none focus:outline-none text-lg"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </TabsContent>
            
            <TabsContent value="preview" className="min-h-[200px]">
              <div 
                className="blog-preview prose prose-lg h-full"
                dangerouslySetInnerHTML={{ __html: formatContentForPreview() }}
              />
            </TabsContent>
          </Tabs>
          
          <div className="flex justify-between items-center border-t border-border pt-4">
            <div className="flex gap-2 text-primary">
              <button 
                className="p-2 rounded-full hover:bg-primary/10 relative"
                onClick={handleImageButtonClick}
                disabled={isUploading}
              >
                {isUploading ? (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-20"></span>
                ) : null}
                <Image size={18} />
              </button>
              <button 
                className="p-2 rounded-full hover:bg-primary/10"
                onClick={handleAddHeading}
              >
                <Heading size={18} />
              </button>
              <button 
                className="p-2 rounded-full hover:bg-primary/10"
                onClick={handleAddParagraph}
              >
                <Type size={18} />
              </button>
              <button 
                className="p-2 rounded-full hover:bg-primary/10"
              >
                <Smile size={18} />
              </button>
            </div>
            <Button
              onClick={handlePublish}
              disabled={publishMutation.isPending || isUploading}
            >
              {editMode ? "Update" : "Publish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
