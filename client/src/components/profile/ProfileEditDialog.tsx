import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
import { Button } from "@/components/ui/button";

// Form schema
const profileFormSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  profileImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  coverImage: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

interface ProfileEditDialogProps {
  user: any;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export default function ProfileEditDialog({
  user,
  trigger,
  onSuccess,
}: ProfileEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  // Profile update form
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: user?.displayName || "",
      bio: user?.bio || "",
      profileImage: user?.profileImage || "",
      coverImage: user?.coverImage || "",
    },
  });

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
      setIsOpen(false);
      
      // Also update the current user data
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?._id || user?.id}`] });
      
      // Call the onSuccess callback if provided
      if (onSuccess) onSuccess();
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

  // Upload handlers
  const handleProfileImageUpload = async (file: File) => {
    // Add file validation
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image less than 5MB',
        variant: 'destructive'
      });
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (JPEG, PNG, GIF, etc.)',
        variant: 'destructive'
      });
      return;
    }
    
    toast({
      title: 'Uploading...',
      description: 'Your profile image is being uploaded',
    });
    
    const formData = new FormData();
    formData.append('profileImage', file);
    
    try {
      console.log('Uploading profile image:', file.name, file.type, file.size);
      
      // Use a timeout to ensure fetch doesn't hang indefinitely
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      const res = await fetch('/api/upload/profile-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Clear timeout after request completes
      
      // Log the raw response for debugging
      console.log('Profile image upload response status:', res.status);
      
      // Handle non-2xx responses with more detail
      if (!res.ok) {
        let errorMessage = 'Failed to upload image';
        try {
          const errorData = await res.json();
          console.error('Profile image upload failed:', res.status, errorData);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await res.text();
          console.error('Profile image upload failed:', res.status, errorText);
          errorMessage = `${errorMessage}: ${res.status} ${errorText || ''}`;
        }
        throw new Error(errorMessage);
      }
      
      // Parse the response
      const data = await res.json();
      console.log('Profile image upload successful:', data);
      
      if (!data.success || !data.fileUrl) {
        throw new Error('Server returned success but no file URL was provided');
      }
      
      // Update form value with the new image URL
      form.setValue('profileImage', data.fileUrl);
      
      toast({
        title: 'Profile image uploaded',
        description: 'Your profile image has been uploaded successfully',
      });
      
      return data.fileUrl;
    } catch (error) {
      console.error('Profile image upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload profile image',
        variant: 'destructive'
      });
      return null;
    }
  };

  const handleCoverImageUpload = async (file: File) => {
    // Add file validation
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Please select an image less than 5MB',
        variant: 'destructive'
      });
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file (JPEG, PNG, GIF, etc.)',
        variant: 'destructive'
      });
      return;
    }
    
    toast({
      title: 'Uploading...',
      description: 'Your cover image is being uploaded',
    });
    
    const formData = new FormData();
    formData.append('coverImage', file);
    
    try {
      console.log('Uploading cover image:', file.name, file.type, file.size);
      
      // Use a timeout to ensure fetch doesn't hang indefinitely
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
      
      const res = await fetch('/api/upload/cover-image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId); // Clear timeout after request completes
      
      // Log the raw response for debugging
      console.log('Cover image upload response status:', res.status);
      
      // Handle non-2xx responses with more detail
      if (!res.ok) {
        let errorMessage = 'Failed to upload image';
        try {
          const errorData = await res.json();
          console.error('Cover image upload failed:', res.status, errorData);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          const errorText = await res.text();
          console.error('Cover image upload failed:', res.status, errorText);
          errorMessage = `${errorMessage}: ${res.status} ${errorText || ''}`;
        }
        throw new Error(errorMessage);
      }
      
      // Parse the response
      const data = await res.json();
      console.log('Cover image upload successful:', data);
      
      if (!data.success || !data.fileUrl) {
        throw new Error('Server returned success but no file URL was provided');
      }
      
      // Update form value with the new image URL
      form.setValue('coverImage', data.fileUrl);
      
      toast({
        title: 'Cover image uploaded',
        description: 'Your cover image has been uploaded successfully',
      });
      
      return data.fileUrl;
    } catch (error) {
      console.error('Cover image upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload cover image',
        variant: 'destructive'
      });
      return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Edit Profile</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitProfileForm)} className="space-y-6">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your display name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bio</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us about yourself"
                      className="resize-none min-h-[80px]"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="profileImage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profile Image</FormLabel>
                    <div className="flex flex-col items-center space-y-4">
                      <div className="h-24 w-24 rounded-full overflow-hidden bg-secondary">
                        {field.value ? (
                          <img 
                            src={field.value} 
                            alt="Profile" 
                            className="w-full h-full object-cover" 
                          />
                        ) : user?.profileImage ? (
                          <img 
                            src={user.profileImage} 
                            alt={user.displayName || "Profile"} 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-bold">
                            {user?.displayName?.charAt(0).toUpperCase() || "U"}
                          </div>
                        )}
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="relative overflow-hidden"
                          onClick={() => {
                            // Create a file input element programmatically
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async (e) => {
                              const target = e.target as HTMLInputElement;
                              if (target.files?.length) {
                                await handleProfileImageUpload(target.files[0]);
                              }
                            };
                            input.click();
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="coverImage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover Image</FormLabel>
                    <div className="flex flex-col space-y-4">
                      <div className="h-32 w-full bg-secondary rounded-md overflow-hidden">
                        {field.value ? (
                          <img 
                            src={field.value} 
                            alt="Cover" 
                            className="w-full h-full object-cover" 
                          />
                        ) : user?.coverImage ? (
                          <img 
                            src={user.coverImage} 
                            alt="Cover" 
                            className="w-full h-full object-cover" 
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10">
                            <Upload className="h-6 w-6 text-primary/40" />
                          </div>
                        )}
                      </div>
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="relative overflow-hidden"
                          onClick={() => {
                            // Create a file input element programmatically
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = async (e) => {
                              const target = e.target as HTMLInputElement;
                              if (target.files?.length) {
                                await handleCoverImageUpload(target.files[0]);
                              }
                            };
                            input.click();
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </Button>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={updateProfileMutation.isPending}
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}