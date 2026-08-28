import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { ProfileBuilderHeader } from "@/components/profile-builder-header";
import { AutosaveToast } from "@/components/autosave-toast";
import { CreditTopupModal } from "@/components/modals/credit-topup-modal";
import { ShareProfileModal } from "@/components/modals/share-profile-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, FileText, Share, Upload, GraduationCap, Code, Briefcase, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import debounce from "lodash.debounce";
import { PhotoUpload, CVUpload } from "@/components/file-upload";
import { generateProfilePDF } from "@/lib/pdf-generator";
import { useLocation } from "wouter";
import {
  companySuggestions,
  degreeSuggestions,
  roleSuggestions,
  skillSuggestions,
  universitySuggestions,
} from "@/data/profile-suggestions";

interface ProfileData {
  id?: string;
  name?: string;
  email?: string;
  bio?: string;
  photoUrl?: string;
  cvUrl?: string;
  shareSlug?: string;
  education: Array<{
    id?: string;
    degree: string;
    university: string;
    duration: string;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
  }>;
  projects: Array<{
    id?: string;
    name: string;
    description: string;
    link: string;
    duration: string;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
  }>;
  skills: Array<{
    id?: string;
    name: string;
    proficiency: string;
  }>;
  experiences: Array<{
    id?: string;
    role: string;
    company: string;
    duration: string;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
    description: string;
  }>;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type PendingDelete =
  | { kind: "education" | "projects" | "skills" | "experiences"; id: string; label: string }
  | { kind: "cv"; label: string };
type SectionType = "education" | "projects" | "skills" | "experiences";
type PendingSectionUpdate = {
  type: SectionType;
  id: string;
  data: Record<string, string | boolean | null>;
};

type StoredCV = {
  url: string;
  name: string;
  uploadedAt: string;
};

type UploadKind = "photo" | "cv";

function isStaleBlobUrl(value?: string | null) {
  return Boolean(value?.startsWith("blob:"));
}

function parseStoredCV(value?: string | null): StoredCV | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<StoredCV>;
    if (parsed.url && !isStaleBlobUrl(parsed.url)) {
      return {
        url: parsed.url,
        name: parsed.name || "Uploaded CV",
        uploadedAt: parsed.uploadedAt || "",
      };
    }
  } catch {
    if (isStaleBlobUrl(value)) return null;
    return {
      url: value,
      name: "Uploaded CV",
      uploadedAt: "",
    };
  }

  return null;
}

function formatUploadDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function currentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function toMonthValue(value?: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 7);
}

function formatMonthLabel(value?: string | null) {
  const monthValue = toMonthValue(value);
  if (!monthValue) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthValue}-01T00:00:00.000Z`));
}

function buildDurationLabel(startDate?: string | null, endDate?: string | null, isCurrent?: boolean | null, fallback = "") {
  const startLabel = formatMonthLabel(startDate);
  if (!startLabel) return fallback;

  if (isCurrent) return `${startLabel} - Present`;

  const endLabel = formatMonthLabel(endDate);
  return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
}

type DateRangeItem = {
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean | null;
  duration?: string | null;
};

const monthOptions = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const yearOptions = Array.from(
  { length: new Date().getFullYear() - 1950 + 1 },
  (_, index) => String(new Date().getFullYear() - index),
);

function splitMonthValue(value?: string | null) {
  const monthValue = toMonthValue(value);
  if (!monthValue) return { year: "", month: "" };

  const [year, month] = monthValue.split("-");
  return { year, month };
}

function MonthYearSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [{ year, month }, setDraftDate] = useState(splitMonthValue(value));

  useEffect(() => {
    setDraftDate(splitMonthValue(value));
  }, [value]);

  const emitChange = (nextYear: string, nextMonth: string) => {
    setDraftDate({ year: nextYear, month: nextMonth });
    onChange(nextYear && nextMonth ? `${nextYear}-${nextMonth}` : "");
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={month}
          onValueChange={(nextMonth) => emitChange(year, nextMonth)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={year}
          onValueChange={(nextYear) => emitChange(nextYear, month)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DateRangeFields({
  item,
  currentLabel,
  disabled,
  onChange,
}: {
  item: DateRangeItem;
  currentLabel: string;
  disabled: boolean;
  onChange: (updates: Record<string, string | boolean | null>) => void;
}) {
  const [draftRange, setDraftRange] = useState({
    startDate: toMonthValue(item.startDate),
    endDate: toMonthValue(item.endDate),
    isCurrent: Boolean(item.isCurrent),
  });

  useEffect(() => {
    setDraftRange({
      startDate: toMonthValue(item.startDate),
      endDate: toMonthValue(item.endDate),
      isCurrent: Boolean(item.isCurrent),
    });
  }, [item.startDate, item.endDate, item.isCurrent]);

  const emitChange = (updates: Partial<DateRangeItem>) => {
    const nextStartDate = updates.startDate !== undefined ? updates.startDate : draftRange.startDate;
    const nextEndDate = updates.endDate !== undefined ? updates.endDate : draftRange.endDate;
    const nextIsCurrent = updates.isCurrent !== undefined ? updates.isCurrent : draftRange.isCurrent;
    const nextRange = {
      startDate: nextStartDate || "",
      endDate: nextIsCurrent ? "" : nextEndDate || "",
      isCurrent: Boolean(nextIsCurrent),
    };

    setDraftRange(nextRange);
    onChange({
      startDate: nextRange.startDate || null,
      endDate: nextRange.endDate || null,
      isCurrent: nextRange.isCurrent,
      duration: buildDurationLabel(nextRange.startDate, nextRange.endDate, nextRange.isCurrent, item.duration || ""),
    });
  };

  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <MonthYearSelect
        label="From"
        value={draftRange.startDate}
        onChange={(value) => emitChange({ startDate: value })}
        disabled={disabled}
      />
      <MonthYearSelect
        label="To"
        value={draftRange.isCurrent ? "" : draftRange.endDate}
        onChange={(value) => emitChange({ endDate: value })}
        disabled={disabled || draftRange.isCurrent}
      />
      <label className="sm:col-span-2 flex items-center gap-2 text-sm text-gray-700">
        <Checkbox
          checked={draftRange.isCurrent}
          onCheckedChange={(checked) => emitChange({ isCurrent: checked === true, endDate: null })}
          disabled={disabled}
        />
        {currentLabel}
      </label>
      {item.duration && !draftRange.startDate && (
        <p className="sm:col-span-2 text-xs text-gray-500">Existing duration: {item.duration}</p>
      )}
    </div>
  );
}

async function uploadProfileFile(kind: UploadKind, file: File) {
  const res = await fetch(`/api/uploads/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "X-File-Name": file.name,
    },
    body: file,
    credentials: "include",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || "File upload failed");
  }

  return res.json() as Promise<{ url: string; name: string }>;
}

export default function ProfileBuilderPage() {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showAutosaveToast, setShowAutosaveToast] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const pendingProfileUpdatesRef = useRef<Partial<ProfileData>>({});
  const pendingSectionUpdatesRef = useRef<Record<string, PendingSectionUpdate>>({});
  const lastRetryRef = useRef<(() => void) | null>(null);
  const saveResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => setLocation("/"),
    });
  };

  const markSaving = () => {
    if (saveResetTimerRef.current) {
      clearTimeout(saveResetTimerRef.current);
    }
    setSaveError("");
    setSaveStatus("saving");
  };

  const markSaved = () => {
    setSaveError("");
    setSaveStatus("saved");
    if (saveResetTimerRef.current) {
      clearTimeout(saveResetTimerRef.current);
    }
    saveResetTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const markFailed = (error: Error, retry: () => void) => {
    if (saveResetTimerRef.current) {
      clearTimeout(saveResetTimerRef.current);
    }
    lastRetryRef.current = retry;
    setSaveError(error.message);
    setSaveStatus("error");
  };

  const handleSaveError = (error: Error, retry: () => void) => {
    markFailed(error, retry);
    const isCreditError = error.message.toLowerCase().includes("credit");
    toast({
      title: isCreditError ? "Insufficient Credits" : "Save Failed",
      description: isCreditError
        ? `${error.message} Buy Credits adds 100 credits for ₹500 and does not change your plan.`
        : error.message,
      variant: "destructive",
    });
  };

  const { data: profile, isLoading, isError, error } = useQuery<ProfileData | null>({
    queryKey: ["/api/profile"],
  });

  const { data: credits } = useQuery<{
    creditsRemaining: number;
    creditsAllocated?: number;
    hasSubscription: boolean;
    planType?: string | null;
    status?: string;
  }>({
    queryKey: ["/api/credits"],
  });
  const hasActiveSubscription = Boolean(credits?.hasSubscription);
  const cvDetails = parseStoredCV(profile?.cvUrl);
  const photoUrl = isStaleBlobUrl(profile?.photoUrl) ? undefined : profile?.photoUrl;

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<ProfileData>) => {
      const res = await apiRequest("PATCH", "/api/profile", data);
      return res.json();
    },
    onMutate: () => {
      markSaving();
    },
    onSuccess: (savedProfile) => {
      queryClient.setQueryData<ProfileData | null>(["/api/profile"], (current) => ({
        ...(current || { education: [], projects: [], skills: [], experiences: [] }),
        ...savedProfile,
        education: current?.education || [],
        projects: current?.projects || [],
        skills: current?.skills || [],
        experiences: current?.experiences || [],
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => updateProfileMutation.mutate(variables)),
  });

  // Education mutations
  const addEducationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/education", data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => addEducationMutation.mutate(variables)),
  });

  const updateEducationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiRequest("PATCH", `/api/education/${id}`, data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => updateEducationMutation.mutate(variables)),
  });

  const deleteEducationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/education/${id}`);
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => deleteEducationMutation.mutate(variables)),
  });

  // Project mutations
  const addProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => addProjectMutation.mutate(variables)),
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => updateProjectMutation.mutate(variables)),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => deleteProjectMutation.mutate(variables)),
  });

  // Skill mutations
  const addSkillMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/skills", data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => addSkillMutation.mutate(variables)),
  });

  const updateSkillMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiRequest("PATCH", `/api/skills/${id}`, data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => updateSkillMutation.mutate(variables)),
  });

  const deleteSkillMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/skills/${id}`);
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => deleteSkillMutation.mutate(variables)),
  });

  // Experience mutations
  const addExperienceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/experiences", data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => addExperienceMutation.mutate(variables)),
  });

  const updateExperienceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => {
      const res = await apiRequest("PATCH", `/api/experiences/${id}`, data);
      return res.json();
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      setShowAutosaveToast(true);
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => updateExperienceMutation.mutate(variables)),
  });

  const deleteExperienceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/experiences/${id}`);
    },
    onMutate: () => markSaving(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      markSaved();
    },
    onError: (error: Error, variables) => handleSaveError(error, () => deleteExperienceMutation.mutate(variables)),
  });

  const debouncedProfileSave = useMemo(
    () =>
      debounce(() => {
        const updates = pendingProfileUpdatesRef.current;
        pendingProfileUpdatesRef.current = {};
        if (Object.keys(updates).length > 0) {
          updateProfileMutation.mutate(updates);
        }
      }, 1000),
    []
  );

  const debouncedSectionSave = useMemo(
    () =>
      debounce(() => {
        const updates = Object.values(pendingSectionUpdatesRef.current);
        pendingSectionUpdatesRef.current = {};

        updates.forEach(({ type, id, data }) => {
          if (type === "education") updateEducationMutation.mutate({ id, data });
          if (type === "projects") updateProjectMutation.mutate({ id, data });
          if (type === "skills") updateSkillMutation.mutate({ id, data });
          if (type === "experiences") updateExperienceMutation.mutate({ id, data });
        });
      }, 1000),
    []
  );

  useEffect(() => {
    const flushPendingSaves = () => {
      debouncedProfileSave.flush();
      debouncedSectionSave.flush();
    };

    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        flushPendingSaves();
      }
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushPendingSaves);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushPendingSaves);
      flushPendingSaves();
      if (saveResetTimerRef.current) {
        clearTimeout(saveResetTimerRef.current);
      }
    };
  }, [debouncedProfileSave, debouncedSectionSave]);

  const handleInputChange = (field: keyof ProfileData, value: string) => {
    pendingProfileUpdatesRef.current = {
      ...pendingProfileUpdatesRef.current,
      [field]: value,
    };
    markSaving();
    debouncedProfileSave();
  };

  const handleSectionChange = (type: SectionType, id: string, data: Record<string, string | boolean | null>) => {
    const key = `${type}:${id}`;
    pendingSectionUpdatesRef.current[key] = {
      type,
      id,
      data: {
        ...(pendingSectionUpdatesRef.current[key]?.data || {}),
        ...data,
      },
    };
    markSaving();
    debouncedSectionSave();
  };

  const handleExportPDF = () => {
    if (!profile) {
      toast({
        title: "No Profile Data",
        description: "Please fill out your profile first before exporting",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({ 
        title: "PDF Export", 
        description: "Generating PDF version of your profile...",
      });
      
      generateProfilePDF(profile);
      
      setTimeout(() => {
        toast({
          title: "PDF Generated!",
          description: "Your profile has been downloaded as PDF",
        });
      }, 1000);
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error generating your PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const uploaded = await uploadProfileFile("photo", file);
      updateProfileMutation.mutate({ photoUrl: uploaded.url });
      toast({
        title: "Photo Uploaded",
        description: "Your profile photo has been updated!",
      });
    } catch (error) {
      toast({
        title: "Photo Upload Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCVUpload = async (file: File) => {
    try {
      const uploaded = await uploadProfileFile("cv", file);
      updateProfileMutation.mutate({
        cvUrl: JSON.stringify({
          url: uploaded.url,
          name: uploaded.name,
          uploadedAt: new Date().toISOString(),
        }),
      });
      toast({
        title: "CV Uploaded",
        description: "Your CV has been uploaded successfully!",
      });
    } catch (error) {
      toast({
        title: "CV Upload Failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCVDownload = () => {
    if (!cvDetails?.url) return;

    const link = document.createElement("a");
    link.href = cvDetails.url;
    link.download = cvDetails.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCVDelete = () => {
    setPendingDelete({ kind: "cv", label: "your uploaded CV" });
  };

  const isDeleting =
    deleteEducationMutation.isPending ||
    deleteProjectMutation.isPending ||
    deleteSkillMutation.isPending ||
    deleteExperienceMutation.isPending ||
    updateProfileMutation.isPending;

  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "cv") {
      updateProfileMutation.mutate({ cvUrl: "" });
    } else if (pendingDelete.kind === "education") {
      deleteEducationMutation.mutate(pendingDelete.id);
    } else if (pendingDelete.kind === "projects") {
      deleteProjectMutation.mutate(pendingDelete.id);
    } else if (pendingDelete.kind === "skills") {
      deleteSkillMutation.mutate(pendingDelete.id);
    } else {
      deleteExperienceMutation.mutate(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Unable to load profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              {error instanceof Error ? error.message : "Please try again."}
            </p>
            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/profile"] })}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileBuilderHeader
        isPreviewMode={isPreviewMode}
        onEdit={() => setIsPreviewMode(false)}
        onPreview={() => setIsPreviewMode(true)}
        onHome={() => setLocation("/")}
        onBuyCredits={() => setShowCreditModal(true)}
        onChoosePlan={() => setLocation("/subscription")}
        onShare={() => setShowShareModal(true)}
        onExport={handleExportPDF}
        onLogout={handleLogout}
        onRetrySave={() => lastRetryRef.current?.()}
        hasActiveSubscription={hasActiveSubscription}
        creditsRemaining={credits?.creditsRemaining || 0}
        planType={credits?.planType}
        userEmail={user?.email}
        logoutPending={logoutMutation.isPending}
        saveStatus={saveStatus}
        saveError={saveError}
      />

      {/* Main Content */}
      <div className="page-container py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Profile Sections (Left Column) */}
          <div className="lg:col-span-2 min-w-0 space-y-6 sm:space-y-8">
            {/* Personal Information Section */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      defaultValue={profile?.name || ""}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      disabled={isPreviewMode}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={user?.email || profile?.email || ""}
                      readOnly
                      disabled={isPreviewMode}
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="bio">Professional Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us about yourself..."
                    rows={4}
                    defaultValue={profile?.bio || ""}
                    onChange={(e) => handleInputChange("bio", e.target.value)}
                    disabled={isPreviewMode}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Profile Photo</Label>
                    <div className="mt-2">
                      <PhotoUpload
                        onUpload={handlePhotoUpload}
                        currentPhoto={photoUrl}
                        disabled={isPreviewMode}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Resume/CV</Label>
                    <div className="mt-2">
                      {!isPreviewMode ? (
                        <CVUpload
                          onUpload={handleCVUpload}
                          currentCV={cvDetails?.url}
                          currentCVName={cvDetails?.name}
                          currentCVUploadedAt={formatUploadDate(cvDetails?.uploadedAt)}
                          onDownload={handleCVDownload}
                          onDelete={handleCVDelete}
                          disabled={isPreviewMode}
                        />
                      ) : (
                        <div className="border-2 border-gray-200 rounded-md p-6 text-center">
                          <FileText className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">
                            {cvDetails ? "CV uploaded" : "No CV uploaded"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Education Section */}
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Education</CardTitle>
                {!isPreviewMode && (
                  <Button
                    onClick={() => addEducationMutation.mutate({
                      degree: "Bachelor of Technology",
                      university: "University Name",
                      startDate: currentMonthValue(),
                      endDate: null,
                      isCurrent: true,
                      duration: buildDurationLabel(currentMonthValue(), null, true)
                    })}
                    size="sm"
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Add Education
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {profile?.education && profile.education.length > 0 ? (
                  <div className="space-y-6">
                    {profile.education.map((edu, index) => (
                      <div key={edu.id || index} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Degree</Label>
                            <SearchableCombobox
                              value={edu.degree}
                              groups={degreeSuggestions}
                              placeholder="Select or type degree"
                              searchPlaceholder="Search degrees..."
                              onChange={(value) => {
                                if (edu.id) {
                                  handleSectionChange("education", edu.id, { degree: value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <div>
                            <Label>University</Label>
                            <SearchableCombobox
                              value={edu.university}
                              groups={universitySuggestions}
                              placeholder="Select or type university"
                              searchPlaceholder="Search universities..."
                              onChange={(value) => {
                                if (edu.id) {
                                  handleSectionChange("education", edu.id, { university: value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <DateRangeFields
                            item={edu}
                            currentLabel="Currently studying"
                            disabled={isPreviewMode}
                            onChange={(updates) => {
                              if (edu.id) {
                                handleSectionChange("education", edu.id, updates);
                              }
                            }}
                          />
                          {!isPreviewMode && (
                            <div className="flex items-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => edu.id && setPendingDelete({
                                  kind: "education",
                                  id: edu.id,
                                  label: edu.degree || "this education entry",
                                })}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <GraduationCap className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="text-gray-500 mt-4">No education added yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Projects Section */}
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  Projects
                </CardTitle>
                {!isPreviewMode && (
                  <Button
                    onClick={() => addProjectMutation.mutate({
                      name: "New Project",
                      description: "Project description",
                      link: "",
                      startDate: currentMonthValue(),
                      endDate: null,
                      isCurrent: true,
                      duration: buildDurationLabel(currentMonthValue(), null, true)
                    })}
                    size="sm"
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Add Project
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {profile?.projects && profile.projects.length > 0 ? (
                  <div className="space-y-6">
                    {profile.projects.map((project, index) => (
                      <div key={project.id || index} className="border border-gray-200 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Project Name</Label>
                            <Input
                              defaultValue={project.name}
                              onChange={(e) => {
                                if (project.id) {
                                  handleSectionChange("projects", project.id, { name: e.target.value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Description</Label>
                            <Textarea
                              defaultValue={project.description}
                              rows={3}
                              onChange={(e) => {
                                if (project.id) {
                                  handleSectionChange("projects", project.id, { description: e.target.value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <div>
                            <Label>Project Link</Label>
                            <Input
                              type="url"
                              defaultValue={project.link}
                              placeholder="https://github.com/..."
                              onChange={(e) => {
                                if (project.id) {
                                  handleSectionChange("projects", project.id, { link: e.target.value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <DateRangeFields
                            item={project}
                            currentLabel="Currently working on this project"
                            disabled={isPreviewMode}
                            onChange={(updates) => {
                              if (project.id) {
                                handleSectionChange("projects", project.id, updates);
                              }
                            }}
                          />
                          {!isPreviewMode && (
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => project.id && setPendingDelete({
                                  kind: "projects",
                                  id: project.id,
                                  label: project.name || "this project",
                                })}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Code className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="text-gray-500 mt-4">No projects added yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Skills Section */}
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Skills
                </CardTitle>
                {!isPreviewMode && (
                  <Button
                    onClick={() => addSkillMutation.mutate({
                      name: "Communication",
                      proficiency: "Intermediate"
                    })}
                    size="sm"
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Add Skill
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {profile?.skills && profile.skills.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile.skills.map((skill, index) => (
                      <div key={skill.id || index} className="border border-gray-200 rounded-lg p-4">
                        <div className="space-y-3">
                          <div>
                            <Label>Skill Name</Label>
                            <SearchableCombobox
                              value={skill.name}
                              groups={skillSuggestions}
                              placeholder="Select or type skill"
                              searchPlaceholder="Search skills..."
                              onChange={(value) => {
                                if (skill.id) {
                                  handleSectionChange("skills", skill.id, { name: value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <div>
                            <Label>Proficiency</Label>
                            <Select 
                              defaultValue={skill.proficiency} 
                              disabled={isPreviewMode}
                              onValueChange={(value) => {
                                if (skill.id) {
                                  handleSectionChange("skills", skill.id, { proficiency: value });
                                }
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Beginner">Beginner</SelectItem>
                                <SelectItem value="Intermediate">Intermediate</SelectItem>
                                <SelectItem value="Advanced">Advanced</SelectItem>
                                <SelectItem value="Expert">Expert</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {!isPreviewMode && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => skill.id && setPendingDelete({
                                kind: "skills",
                                id: skill.id,
                                label: skill.name || "this skill",
                              })}
                              className="text-destructive hover:text-destructive w-full"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Award className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="text-gray-500 mt-4">No skills added yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work Experience Section */}
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 pb-6 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Work Experience
                </CardTitle>
                {!isPreviewMode && (
                  <Button
                    onClick={() => addExperienceMutation.mutate({
                      company: "Company Name",
                      role: "Software Engineer",
                      startDate: currentMonthValue(),
                      endDate: null,
                      isCurrent: true,
                      duration: buildDurationLabel(currentMonthValue(), null, true),
                      description: "Key responsibilities and achievements..."
                    })}
                    size="sm"
                    className="flex w-full items-center gap-2 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" />
                    Add Experience
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {profile?.experiences && profile.experiences.length > 0 ? (
                  <div className="space-y-6">
                    {profile.experiences.map((exp, index) => (
                      <div key={exp.id || index} className="border border-gray-200 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Company</Label>
                            <SearchableCombobox
                              value={exp.company}
                              groups={companySuggestions}
                              placeholder="Select or type company"
                              searchPlaceholder="Search companies..."
                              onChange={(value) => {
                                if (exp.id) {
                                  handleSectionChange("experiences", exp.id, { company: value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <div>
                            <Label>Role</Label>
                            <SearchableCombobox
                              value={exp.role}
                              groups={roleSuggestions}
                              placeholder="Select or type role"
                              searchPlaceholder="Search roles..."
                              onChange={(value) => {
                                if (exp.id) {
                                  handleSectionChange("experiences", exp.id, { role: value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          <DateRangeFields
                            item={exp}
                            currentLabel="Currently working here"
                            disabled={isPreviewMode}
                            onChange={(updates) => {
                              if (exp.id) {
                                handleSectionChange("experiences", exp.id, updates);
                              }
                            }}
                          />
                          <div className="md:col-span-2">
                            <Label>Key Responsibilities</Label>
                            <Textarea
                              defaultValue={exp.description}
                              rows={4}
                              onChange={(e) => {
                                if (exp.id) {
                                  handleSectionChange("experiences", exp.id, { description: e.target.value });
                                }
                              }}
                              disabled={isPreviewMode}
                            />
                          </div>
                          {!isPreviewMode && (
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => exp.id && setPendingDelete({
                                  kind: "experiences",
                                  id: exp.id,
                                  label: exp.role || "this experience entry",
                                })}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Briefcase className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="text-gray-500 mt-4">No work experience added yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Profile Summary */}
          <div className="min-w-0 space-y-6">
            {/* Profile Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Profile Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt="Profile" 
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    ) : (
                      <Briefcase className="w-10 h-10 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg break-words">{profile?.name || "Your Name"}</h3>
                    <p className="text-gray-600 text-sm break-all">{profile?.email || "your@email.com"}</p>
                  </div>
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    <p className="font-medium">Profile Completion</p>
                    <div className="mt-2 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ 
                          width: `${Math.min(100, (
                            (profile?.name ? 20 : 0) + 
                            (profile?.email ? 20 : 0) + 
                            (profile?.bio ? 20 : 0) + 
                            ((profile?.education?.length || 0) > 0 ? 20 : 0) + 
                            ((profile?.projects?.length || 0) > 0 ? 20 : 0)
                          ))}%`
                        }}
                      />
                    </div>
                    <p className="text-xs mt-1">
                      {Math.min(100, (
                        (profile?.name ? 20 : 0) + 
                        (profile?.email ? 20 : 0) + 
                        (profile?.bio ? 20 : 0) + 
                        ((profile?.education?.length || 0) > 0 ? 20 : 0) + 
                        ((profile?.projects?.length || 0) > 0 ? 20 : 0)
                      ))}% complete
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    <GraduationCap className="w-4 h-4" />
                    Education
                  </span>
                  <span className="font-medium">{profile?.education?.length || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Projects
                  </span>
                  <span className="font-medium">{profile?.projects?.length || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Skills
                  </span>
                  <span className="font-medium">{profile?.skills?.length || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    Experience
                  </span>
                  <span className="font-medium">{profile?.experiences?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={() => setShowShareModal(true)}
                  className="w-full flex items-center gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Share className="w-4 h-4" />
                  Share Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Export as PDF
                </Button>
                {hasActiveSubscription ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowCreditModal(true)}
                    className="w-full flex items-center gap-2"
                  >
                    <Award className="w-4 h-4" />
                    Buy More Credits
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/subscription")}
                    className="w-full flex items-center gap-2"
                  >
                    <Award className="w-4 h-4" />
                    Choose a subscription
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg text-blue-800">💡 Pro Tips</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-blue-700 space-y-2">
                <p>• Fill out all sections for a complete profile</p>
                <p>• Use action-oriented language in descriptions</p>
                <p>• Add links to your projects and portfolio</p>
                <p>• Keep your skills updated regularly</p>
                <p>• Each edit costs 5 credits - make them count!</p>
                <p>• Buy Credits adds 100 credits for ₹500 and does not change your plan</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreditTopupModal 
        open={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        currentCredits={credits?.creditsRemaining || 0}
        planType={credits?.planType}
        hasSubscription={hasActiveSubscription}
      />
      
      <ShareProfileModal 
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={profile?.shareSlug ? `${window.location.origin}/profile/share/${profile.shareSlug}` : ""}
      />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deleting a profile section uses 5 credits, the same as any other profile edit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPendingDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Autosave Toast */}
      <AutosaveToast 
        show={showAutosaveToast}
        onClose={() => setShowAutosaveToast(false)}
        creditsRemaining={credits?.creditsRemaining || 0}
      />
    </div>
  );
}
