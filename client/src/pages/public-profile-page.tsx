import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Award, Briefcase, Code, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SharedProfile = {
  name?: string | null;
  email?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  education?: Array<{
    degree?: string | null;
    university?: string | null;
    duration?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
  }>;
  projects?: Array<{
    name?: string | null;
    description?: string | null;
    link?: string | null;
    duration?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
  }>;
  skills?: Array<{
    name?: string | null;
    proficiency?: string | null;
  }>;
  experiences?: Array<{
    role?: string | null;
    company?: string | null;
    description?: string | null;
    duration?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isCurrent?: boolean | null;
  }>;
};

function formatMonthLabel(value?: string | null) {
  if (!value) return "";
  const monthValue = /^\d{4}-\d{2}$/.test(value) ? value : new Date(value).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthValue}-01T00:00:00.000Z`));
}

function formatDuration(item: {
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean | null;
}) {
  const startLabel = formatMonthLabel(item.startDate);
  if (startLabel) {
    if (item.isCurrent) return `${startLabel} - Present`;
    const endLabel = formatMonthLabel(item.endDate);
    return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
  }
  return item.duration || "";
}

export default function PublicProfilePage({ params }: { params?: { shareSlug?: string } }) {
  const routeParams = useParams<{ shareSlug?: string }>();
  const shareSlug = params?.shareSlug || routeParams.shareSlug || "";

  const { data: profile, isLoading, isError } = useQuery<SharedProfile | null>({
    queryKey: [`/api/profile/share/${shareSlug}`],
    enabled: Boolean(shareSlug),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Profile not found</h1>
            <p className="text-sm text-gray-600">This public profile link is invalid or no longer available.</p>
            <Link href="/" className="text-sm text-primary">Back to Canar</Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="page-container-narrow flex h-16 items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">Canar</Link>
          <Badge variant="secondary">Public profile</Badge>
        </div>
      </div>

      <div className="page-container-narrow space-y-8 py-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:p-8">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden flex-shrink-0">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.name || "Profile photo"} className="w-24 h-24 object-cover" />
              ) : (
                <Briefcase className="w-10 h-10 text-white" />
              )}
            </div>
            <div className="text-center sm:text-left">
              <h1 className="break-words text-3xl font-bold text-gray-900">{profile.name || "Professional profile"}</h1>
              {profile.email && <p className="text-gray-600 mt-1">{profile.email}</p>}
              {profile.bio && <p className="text-gray-700 mt-4 whitespace-pre-wrap">{profile.bio}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> Education</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.education?.length ? profile.education.map((item, index) => (
              <div key={index} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                <p className="font-medium text-gray-900">{item.degree}</p>
                <p className="text-sm text-gray-600">{item.university}</p>
                <p className="text-sm text-gray-500">{formatDuration(item)}</p>
              </div>
            )) : <p className="text-sm text-gray-500">No education added.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.experiences?.length ? profile.experiences.map((item, index) => (
              <div key={index} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                <p className="font-medium text-gray-900">{item.role}</p>
                <p className="text-sm text-gray-600">{item.company}</p>
                <p className="text-sm text-gray-500">{formatDuration(item)}</p>
                {item.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{item.description}</p>}
              </div>
            )) : <p className="text-sm text-gray-500">No experience added.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Code className="h-5 w-5" /> Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.projects?.length ? profile.projects.map((item, index) => (
              <div key={index} className="border-b border-gray-200 pb-4 last:border-0 last:pb-0">
                <p className="font-medium text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-500">{formatDuration(item)}</p>
                {item.description && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{item.description}</p>}
                {item.link && (
                  <a href={item.link} className="text-sm text-primary break-all" target="_blank" rel="noreferrer">
                    {item.link}
                  </a>
                )}
              </div>
            )) : <p className="text-sm text-gray-500">No projects added.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Skills</CardTitle>
          </CardHeader>
          <CardContent>
            {profile.skills?.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((item, index) => (
                  <Badge key={index} variant="secondary">
                    {item.name}{item.proficiency ? ` · ${item.proficiency}` : ""}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No skills added.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
