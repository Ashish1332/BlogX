import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import BlogCard from "@/components/blog/BlogCard";
import ProfileEditDialog from "@/components/profile/ProfileEditDialog";
import FollowersDialog from "@/components/profile/FollowersDialog";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, PenSquare, Calendar, ArrowLeft, Upload } from "lucide-react";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Define this schema for type compatibility but not used directly anymore
const profileFormSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  profileImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  coverImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { id } = useParams();
  const [_, navigate] = useLocation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [followDialogType, setFollowDialogType] = useState<'followers' | 'following' | null>(null);
  
  // Properly handle userId to avoid MongoDB ObjectID casting errors
  // Only use values that are defined and not "undefined"
  let userId: string | undefined = undefined;
  
  if (id && id !== "undefined" && id.length === 24) {
    // Use ID from URL if it's valid
    userId = id;
  } else if (currentUser && (currentUser._id || currentUser.id)) {
    // Otherwise use logged in user's ID if available
    userId = currentUser._id?.toString() || currentUser.id?.toString();
  }
  const isOwnProfile = (currentUser?._id === userId) || (currentUser?.id === userId);

  const [activeTab, setActiveTab] = useState<"blogs" | "replies" | "media" | "likes">("blogs");

  // Fetch user profile with improved caching strategy
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile
  } = useQuery({
    queryKey: [`/api/users/${userId}`],
    enabled: !!userId && userId !== "undefined",
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
  });

  // Fetch user's blogs with improved caching strategy
  const {
    data: blogs,
    isLoading: isBlogsLoading,
    isError: isBlogsError,
    refetch: refetchBlogs
  } = useQuery({
    queryKey: [`/api/blogs/user/${userId}`],
    enabled: !!userId && userId !== "undefined" && activeTab === "blogs",
    refetchOnWindowFocus: true,
    staleTime: 30000, // 30 seconds
  });

  // Follow/unfollow mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      console.log(`Making ${profile?.isFollowing ? 'unfollow' : 'follow'} request for user:`, userId);
      
      try {
        if (profile?.isFollowing) {
          console.log("Sending UNFOLLOW request to:", `/api/users/${userId}/follow`);
          const res = await apiRequest("DELETE", `/api/users/${userId}/follow`);
          const data = await res.json();
          console.log("Unfollow response:", data);
          return data;
        } else {
          console.log("Sending FOLLOW request to:", `/api/users/${userId}/follow`);
          const res = await apiRequest("POST", `/api/users/${userId}/follow`);
          const data = await res.json();
          console.log("Follow response:", data);
          return data;
        }
      } catch (error) {
        console.error("Error in follow mutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log(`Follow/unfollow successful! Invalidating query for user ${userId}`);
      console.log("Response data:", data);
      
      // Invalidate all related queries to ensure consistency across views
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] }); // For user search
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] }); // To update feed
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUser?._id || currentUser?.id}/following`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}/followers`] });
      
      toast({
        title: profile?.isFollowing ? "Unfollowed" : "Followed",
        description: profile?.isFollowing 
          ? `You are no longer following ${profile?.displayName}` 
          : `You are now following ${profile?.displayName}`,
      });
    },
    onError: (error) => {
      console.error("Follow/unfollow mutation error:", error);
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  // Profile update form
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: "",
      bio: "",
      profileImage: "",
      coverImage: "",
    },
  });

  // Update form values when profile data is available
  useEffect(() => {
    if (profile && isOwnProfile) {
      form.reset({
        displayName: profile.displayName,
        bio: profile.bio || "",
        profileImage: profile.profileImage || "",
        coverImage: profile.coverImage || "",
      });
    }
  }, [profile, isOwnProfile, form]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const res = await apiRequest("PUT", "/api/users/profile", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });
      setIsEditProfileOpen(false);
      refetchProfile();
      
      // Invalidate all related queries to ensure UI consistency
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${userId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/blogs"] }); // Update author info in blog lists
      queryClient.invalidateQueries({ queryKey: ["/api/blogs/feed"] }); 
      queryClient.invalidateQueries({ queryKey: ["/api/users"] }); // For search results
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const onSubmitProfileForm = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const handleFollow = () => {
    if (!currentUser) {
      toast({
        title: "Authentication required",
        description: "Please log in to follow users",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Follow button clicked. Current state:", {
      profileId: userId,
      isFollowing: profile?.isFollowing,
      currentUser: currentUser?._id || currentUser?.id
    });
    
    followMutation.mutate();
  };

  const handleDeleteBlog = (blogId: string) => {
    // Refresh the blog list after deletion
    refetchBlogs();
  };

  const goBack = () => {
    navigate(-1);
  };

  const handleViewFollowing = () => {
    setFollowDialogType('following');
  };

  const handleViewFollowers = () => {
    setFollowDialogType('followers');
  };

  if (isProfileLoading) {
    return (
      <MainLayout pageTitle="Profile">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (isProfileError || !profile) {
    return (
      <MainLayout pageTitle="Profile">
        <div className="p-6 text-center">
          <h2 className="text-xl font-bold mb-2">Failed to load profile</h2>
          <p className="text-muted-foreground mb-4">The user profile could not be loaded.</p>
          <Button onClick={goBack}>Go Back</Button>
        </div>
      </MainLayout>
    );
  }

  const joinedDate = profile.createdAt 
    ? format(new Date(profile.createdAt), "MMMM yyyy")
    : "Unknown";

  return (
    <MainLayout pageTitle={profile.displayName}>
      <div className="relative">
        {/* Back button - only show when viewing other profiles */}
        {!isOwnProfile && (
          <button 
            onClick={goBack} 
            className="absolute left-4 top-4 z-10 bg-background/50 backdrop-blur-md p-2 rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* Cover Image */}
        <div className="h-48 bg-secondary relative overflow-hidden">
          {profile.coverImage && (
            <img 
              src={profile.coverImage} 
              alt={`${profile.displayName}'s cover`} 
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Profile Image & Buttons */}
        <div className="px-4 pb-4 border-b border-border">
          <div className="flex justify-between">
            <div className="relative -mt-16">
              <div className="h-32 w-32 rounded-full border-4 border-background overflow-hidden bg-secondary">
                {profile.profileImage ? (
                  <img 
                    src={profile.profileImage} 
                    alt={profile.displayName} 
                    className="w-full h-full object-cover" 
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-bold">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4">
              {isOwnProfile ? (
                <ProfileEditDialog
                  user={profile}
                  trigger={<Button variant="outline">Edit Profile</Button>}
                  onSuccess={refetchProfile}
                />
              ) : (
                <Button 
                  variant={profile.isFollowing ? "outline" : "default"}
                  onClick={handleFollow}
                  disabled={followMutation.isPending}
                >
                  {profile.isFollowing ? "Unfollow" : "Follow"}
                </Button>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="mt-4">
            <h1 className="text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-muted-foreground">@{profile.username}</p>
            {profile.bio && <p className="mt-2">{profile.bio}</p>}
            <div className="flex items-center gap-4 mt-3 text-muted-foreground">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                <span>Joined {joinedDate}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <button 
                className="hover:underline" 
                onClick={handleViewFollowing}
              >
                <span className="font-bold">{profile.followingCount || 0}</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </button>
              <button 
                className="hover:underline"
                onClick={handleViewFollowers}
              >
                <span className="font-bold">{profile.followerCount || 0}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
          <TabsList className="w-full border-b border-border rounded-none">
            <TabsTrigger value="blogs" className="flex-1">Blogs</TabsTrigger>
            <TabsTrigger value="replies" className="flex-1">Replies</TabsTrigger>
            <TabsTrigger value="media" className="flex-1">Media</TabsTrigger>
            <TabsTrigger value="likes" className="flex-1">Likes</TabsTrigger>
          </TabsList>

          <TabsContent value="blogs" className="divide-y divide-border">
            {isBlogsLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {isBlogsError && (
              <div className="py-8 text-center">
                <p className="text-destructive mb-2">Failed to load blogs</p>
                <Button 
                  variant="outline" 
                  onClick={() => refetchBlogs()}
                >
                  Try Again
                </Button>
              </div>
            )}

            {!isBlogsLoading && !isBlogsError && blogs && blogs.length === 0 && (
              <div className="py-12 text-center">
                <PenSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No blogs yet</h3>
                {isOwnProfile ? (
                  <p className="text-muted-foreground">
                    When you create blogs, they'll show up here.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {profile.displayName} hasn't published any blogs yet.
                  </p>
                )}
              </div>
            )}

            {blogs && blogs.map((blog: any) => (
              <BlogCard 
                key={blog.id} 
                blog={blog} 
                onDelete={handleDeleteBlog}
              />
            ))}
          </TabsContent>

          <TabsContent value="replies">
            <div className="py-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No replies yet</h3>
              <p className="text-muted-foreground">
                When {isOwnProfile ? "you reply" : `${profile.displayName} replies`} to blogs, they'll show up here.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="media">
            <div className="py-12 text-center">
              <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No media yet</h3>
              <p className="text-muted-foreground">
                When {isOwnProfile ? "you share" : `${profile.displayName} shares`} photos or videos, they'll show up here.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="likes">
            <div className="py-12 text-center">
              <Heart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No likes yet</h3>
              <p className="text-muted-foreground">
                Blogs that {isOwnProfile ? "you've liked" : `${profile.displayName} has liked`} will show up here.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        {userId && followDialogType && (
          <FollowersDialog
            userId={userId}
            type={followDialogType}
            isOpen={!!followDialogType}
            onClose={() => setFollowDialogType(null)}
          />
        )}
      </div>
    </MainLayout>
  );
}

function MessageSquare(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function Heart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function ImageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}
