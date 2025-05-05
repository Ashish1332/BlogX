import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";
import MobileNav from "./MobileNav";
import { useMobile } from "@/hooks/use-mobile";

interface MainLayoutProps {
  children: ReactNode;
  showRightSidebar?: boolean;
  pageTitle: string;
}

export default function MainLayout({ 
  children, 
  showRightSidebar = true,
  pageTitle
}: MainLayoutProps) {
  const isMobile = useMobile();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar - hidden on mobile */}
      <Sidebar />
      
      {/* Main Content */}
      <main className="flex-1 min-w-0 border-x border-border">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/75 backdrop-blur-md border-b border-border p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">{pageTitle}</h2>
            <div className="md:hidden">
              <button className="text-primary">
                <i className="fas fa-bars text-xl"></i>
              </button>
            </div>
            <div className="hidden md:block">
              <button className="text-primary">
                <i className="fas fa-sparkles text-xl"></i>
              </button>
            </div>
          </div>
        </header>
        
        {/* Content */}
        {children}
      </main>
      
      {/* Right Sidebar - hidden on mobile */}
      {showRightSidebar && !isMobile && <RightSidebar />}
      
      {/* Mobile Bottom Navigation - only visible on mobile */}
      {isMobile && <MobileNav />}
    </div>
  );
}
