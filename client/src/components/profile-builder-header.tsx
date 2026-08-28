import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CreditCounter } from "@/components/credit-counter";
import {
  Award,
  Briefcase,
  ChevronDown,
  Coins,
  Edit,
  Eye,
  FileText,
  LogOut,
  Menu,
  Plus,
  Share,
  User,
} from "lucide-react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProfileBuilderHeaderProps {
  isPreviewMode: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onHome: () => void;
  onBuyCredits: () => void;
  onChoosePlan: () => void;
  onShare: () => void;
  onExport: () => void;
  onLogout: () => void;
  onRetrySave: () => void;
  hasActiveSubscription: boolean;
  creditsRemaining: number;
  planType?: string | null;
  userEmail?: string | null;
  logoutPending: boolean;
  saveStatus: SaveStatus;
  saveError?: string;
}

function EditPreviewToggle({
  isPreviewMode,
  onEdit,
  onPreview,
}: Pick<ProfileBuilderHeaderProps, "isPreviewMode" | "onEdit" | "onPreview">) {
  return (
    <div className="flex flex-shrink-0 items-center rounded-lg bg-gray-100 p-1">
      <Button
        variant={!isPreviewMode ? "default" : "ghost"}
        onClick={onEdit}
        size="sm"
        className="rounded-md text-sm"
      >
        <Edit className="mr-1 h-4 w-4" />
        Edit
      </Button>
      <Button
        variant={isPreviewMode ? "default" : "ghost"}
        onClick={onPreview}
        size="sm"
        className="rounded-md text-sm"
      >
        <Eye className="mr-1 h-4 w-4" />
        Preview
      </Button>
    </div>
  );
}

function SaveStatusBadge({
  saveStatus,
  saveError,
  onRetrySave,
}: Pick<ProfileBuilderHeaderProps, "saveStatus" | "saveError" | "onRetrySave">) {
  if (saveStatus === "idle") return null;

  return (
    <div className="flex flex-shrink-0 items-center gap-2">
      <Badge variant={saveStatus === "error" ? "destructive" : "secondary"}>
        {saveStatus === "saving" && "Saving..."}
        {saveStatus === "saved" && "Saved ✓"}
        {saveStatus === "error" && "Unable to save"}
      </Badge>
      {saveStatus === "error" && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetrySave}
          title={saveError || "Retry save"}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

export function ProfileBuilderHeader({
  isPreviewMode,
  onEdit,
  onPreview,
  onHome,
  onBuyCredits,
  onChoosePlan,
  onShare,
  onExport,
  onLogout,
  onRetrySave,
  hasActiveSubscription,
  creditsRemaining,
  planType,
  userEmail,
  logoutPending,
  saveStatus,
  saveError,
}: ProfileBuilderHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const runAndClose = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="page-container">
        <div className="hidden h-16 items-center justify-between gap-3 lg:flex">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onHome}
              className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Go to home page"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <h1 className="truncate text-2xl font-bold text-gray-900">Canar</h1>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <CreditCounter
              credits={creditsRemaining}
              planType={planType}
              showBuyButton={false}
            />
            <Separator orientation="vertical" className="h-6" />
            <EditPreviewToggle
              isPreviewMode={isPreviewMode}
              onEdit={onEdit}
              onPreview={onPreview}
            />
            <SaveStatusBadge
              saveStatus={saveStatus}
              saveError={saveError}
              onRetrySave={onRetrySave}
            />
          </div>

          <div className="flex items-center gap-3">
            {hasActiveSubscription ? (
              <Button
                onClick={onBuyCredits}
                size="sm"
                className="flex items-center gap-2 bg-green-600 text-white hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
                Buy Credits
              </Button>
            ) : (
              <Button onClick={onChoosePlan} size="sm" variant="outline">
                Choose a plan
              </Button>
            )}
            <Separator orientation="vertical" className="h-6" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full px-3">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs text-gray-500">Account</DropdownMenuLabel>
                <div className="truncate px-2 pb-2 text-sm font-medium text-gray-900">
                  {userEmail || "Signed in user"}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onShare}>
                  <Share className="h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>
                  <FileText className="h-4 w-4" />
                  Export PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} disabled={logoutPending}>
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onHome}
              className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Go to home page"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <h1 className="truncate text-xl font-bold text-gray-900">Canar</h1>
            </button>
            <EditPreviewToggle
              isPreviewMode={isPreviewMode}
              onEdit={onEdit}
              onPreview={onPreview}
            />
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="profile-mobile-menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <SheetContent
                side="left"
                id="profile-mobile-menu"
                className="flex w-[min(90vw,21.25rem)] flex-col overflow-y-auto sm:max-w-[21.25rem]"
              >
                <SheetHeader className="pr-8 text-left">
                  <SheetTitle>Account</SheetTitle>
                  <SheetDescription className="sr-only">
                    Credits, sharing, export, and account actions.
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => runAndClose(hasActiveSubscription ? onBuyCredits : onChoosePlan)}
                    >
                      <Plus className="h-4 w-4" />
                      {hasActiveSubscription ? "Buy Credits" : "Choose a plan"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => runAndClose(onShare)}
                    >
                      <Share className="h-4 w-4" />
                      Share Profile
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={() => runAndClose(onExport)}
                    >
                      <FileText className="h-4 w-4" />
                      Export Profile (PDF)
                    </Button>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid grid-cols-1 gap-2 rounded-lg bg-gray-50 p-3">
                    <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5">
                      <Award className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current Plan</p>
                        <p className="text-sm font-semibold text-gray-900">{planType || "None"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5">
                      <Coins className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current Credits</p>
                        <p className="text-sm font-semibold text-gray-900">{creditsRemaining} credits</p>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start gap-3 px-2 py-3 text-left text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => runAndClose(onLogout)}
                    disabled={logoutPending}
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <SaveStatusBadge
              saveStatus={saveStatus}
              saveError={saveError}
              onRetrySave={onRetrySave}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
