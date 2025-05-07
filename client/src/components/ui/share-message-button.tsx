import { MessageCircle } from "lucide-react";
import { MessageShareDialog } from "./message-share-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface ShareMessageButtonProps {
  blogId: string;
  blogTitle: string;
  iconSize?: number;
}

export function ShareMessageButton({ blogId, blogTitle, iconSize = 18 }: ShareMessageButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleUnauthenticatedClick = () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to share blogs with others",
        variant: "destructive",
      });
    }
  };

  if (!user) {
    return (
      <button
        className="flex items-center gap-1 hover:text-blue-500 group"
        onClick={handleUnauthenticatedClick}
      >
        <div className="p-2 rounded-full group-hover:bg-blue-500/10">
          <MessageCircle size={iconSize} />
        </div>
      </button>
    );
  }

  return (
    <MessageShareDialog blogId={blogId} blogTitle={blogTitle}>
      <button className="flex items-center gap-1 hover:text-blue-500 group">
        <div className="p-2 rounded-full group-hover:bg-blue-500/10">
          <MessageCircle size={iconSize} />
        </div>
      </button>
    </MessageShareDialog>
  );
}