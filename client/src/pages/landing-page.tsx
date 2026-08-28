import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Check, ChevronDown, CreditCard, Edit, FileText, LogOut, Share, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LandingPage() {
  const [, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="page-container">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-primary">Canar</h1>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <User className="h-4 w-4" />
                      Profile
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="text-xs text-muted-foreground">Signed in as</div>
                      <div className="truncate text-sm font-medium text-foreground">{user.email}</div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLocation("/profile")}>
                      <User className="h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/subscription")}>
                      <CreditCard className="h-4 w-4" />
                      Subscription
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button onClick={() => setLocation("/auth")}>
                  Get Started
                </Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="bg-white overflow-hidden">
        <div className="page-container py-12 sm:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center">
            <main>
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-bold text-gray-900 sm:text-5xl md:text-6xl">
                  <span className="block xl:inline">Build Your</span>{' '}
                  <span className="block text-primary xl:inline">Professional Profile</span>
                </h1>
                <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  Create stunning professional profiles with our credit-based builder. Autosave, export to PDF, and share with the world.
                </p>
                <div className="mt-5 sm:mt-8 flex flex-col gap-3 md:flex-row md:justify-center lg:justify-start">
                  <div className="rounded-md shadow">
                    <Button
                      size="lg"
                      onClick={() => setLocation(user ? "/profile" : "/auth")}
                      className="w-full md:w-auto px-8 py-4 text-base md:text-lg"
                    >
                      {user ? "Continue Profile" : "Start Building"}
                    </Button>
                  </div>
                  <div>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setLocation(user ? "/subscription" : "/auth")}
                      className="w-full md:w-auto px-8 py-4 text-base md:text-lg text-primary border-primary hover:bg-primary hover:text-white"
                    >
                      {user ? "Manage Subscription" : "View Demo"}
                    </Button>
                  </div>
                </div>
              </div>
            </main>
            <div>
              <img
                className="h-56 w-full object-cover sm:h-72 md:h-96 lg:h-[26.875rem]"
                src="https://images.unsplash.com/photo-1556740758-90de374c12ad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
                alt="Professional workspace"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 bg-gray-50">
        <div className="page-container">
          <div className="lg:text-center">
            <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-bold tracking-tight text-gray-900 sm:text-4xl text-balance">
              Everything you need to build professional profiles
            </p>
          </div>

          <div className="mt-10">
            <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Edit className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <dt className="text-lg leading-6 font-medium text-gray-900">Credit-Based Editing</dt>
                  <dd className="mt-2 text-base text-gray-500">Smart autosave system with credit deduction. Only pay for what you edit.</dd>
                </div>
              </div>

              <div className="flex">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <FileText className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <dt className="text-lg leading-6 font-medium text-gray-900">PDF Export</dt>
                  <dd className="mt-2 text-base text-gray-500">Export your profile to professional PDF format for easy sharing.</dd>
                </div>
              </div>

              <div className="flex">
                <div className="flex-shrink-0">
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary text-white">
                    <Share className="h-6 w-6" />
                  </div>
                </div>
                <div className="ml-4">
                  <dt className="text-lg leading-6 font-medium text-gray-900">Public Sharing</dt>
                  <dd className="mt-2 text-base text-gray-500">Share your profile with unique URLs. Perfect for job applications.</dd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
