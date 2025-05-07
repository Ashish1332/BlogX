import { useState } from "react";
import { useNavigate } from "wouter";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface SharedBlogPreviewProps {
  blogData: {
    blogId: string;
    title: string;
    content: string;
    image: string | null;
    author: {
      id: string;
      displayName: string;
      username: string;
      profileImage: string | null;
    };
    userMessage?: string;
  };
}

export function SharedBlogPreview({ blogData }: SharedBlogPreviewProps) {
  const navigate = useNavigate;
  const [isHovered, setIsHovered] = useState(false);
  
  const handleViewBlog = () => {
    navigate(`/blog/${blogData.blogId}`);
  };
  
  return (
    <Card 
      className="w-full max-w-md mt-2 overflow-hidden border border-border bg-card/50 backdrop-blur-sm cursor-pointer hover:border-primary/50 transition-all"
      onClick={handleViewBlog}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {blogData.userMessage && (
        <div className="px-4 pt-3 pb-1 text-sm italic text-muted-foreground">
          "{blogData.userMessage}"
        </div>
      )}
      
      <CardHeader className="p-4 pb-0 flex flex-row items-center gap-2">
        <img 
          src={blogData.author.profileImage || "https://via.placeholder.com/40"} 
          alt={blogData.author.displayName} 
          className="w-8 h-8 rounded-full object-cover"
        />
        <div>
          <p className="text-sm font-semibold">{blogData.author.displayName}</p>
          <p className="text-xs text-muted-foreground">@{blogData.author.username}</p>
        </div>
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="mb-2 font-bold">{blogData.title}</div>
        <div className="text-sm text-muted-foreground line-clamp-2">{blogData.content}</div>
        
        {blogData.image && (
          <div className="mt-3 rounded-md overflow-hidden">
            <img 
              src={blogData.image} 
              alt={blogData.title} 
              className="w-full h-32 object-cover"
            />
          </div>
        )}
      </CardContent>
      
      <CardFooter className={`p-3 bg-muted/30 ${isHovered ? 'bg-primary/10' : ''}`}>
        <Button 
          variant="ghost" 
          size="sm" 
          className="ml-auto group text-xs"
          onClick={(e) => {
            e.stopPropagation();
            handleViewBlog();
          }}
        >
          <span>View Blog</span>
          <ExternalLink className="ml-1 h-3 w-3 opacity-70 group-hover:opacity-100" />
        </Button>
      </CardFooter>
    </Card>
  );
}