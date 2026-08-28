import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadProps {
  accept: string;
  onUpload: (file: File) => void;
  children: React.ReactNode;
  disabled?: boolean;
  maxSize?: number; // in bytes
}

export function FileUpload({ accept, onUpload, children, disabled, maxSize = 5 * 1024 * 1024 }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `Please select a file smaller than ${Math.round(maxSize / 1024 / 1024)}MB`,
          variant: "destructive"
        });
        return;
      }
      onUpload(file);
    }
    // Reset the input value to allow selecting the same file again
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <div onClick={handleClick} style={{ cursor: disabled ? "not-allowed" : "pointer" }}>
        {children}
      </div>
    </>
  );
}

export function PhotoUpload({ onUpload, currentPhoto, disabled }: {
  onUpload: (file: File) => void;
  currentPhoto?: string;
  disabled?: boolean;
}) {
  return (
    <FileUpload
      accept="image/*"
      onUpload={onUpload}
      disabled={disabled}
      maxSize={5 * 1024 * 1024} // 5MB
    >
      <div className="flex items-center space-x-4">
        <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
          {currentPhoto ? (
            <img 
              src={currentPhoto} 
              alt="Profile" 
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <Upload className="h-6 w-6 text-gray-400" />
          )}
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" type="button">
            <Upload className="h-4 w-4 mr-2" />
            Change Photo
          </Button>
        )}
      </div>
    </FileUpload>
  );
}

export function CVUpload({ onUpload, currentCV, currentCVName, currentCVUploadedAt, onDownload, onDelete, disabled }: {
  onUpload: (file: File) => void;
  currentCV?: string | null;
  currentCVName?: string;
  currentCVUploadedAt?: string;
  onDownload?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const hasCV = Boolean(currentCV);

  return (
    <FileUpload
      accept=".pdf,.doc,.docx"
      onUpload={onUpload}
      disabled={disabled}
      maxSize={2 * 1024 * 1024} // 2MB
    >
      <div className="space-y-4">
        {hasCV && (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {currentCVName || "Uploaded CV"}
              </p>
              <p className="text-xs text-gray-500">
                {currentCVUploadedAt ? `Uploaded on ${currentCVUploadedAt}` : "CV uploaded"}
              </p>
            </div>
            {!disabled && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full bg-gray-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDownload?.();
                  }}
                  aria-label="Download CV"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full bg-gray-50"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.();
                  }}
                  aria-label="Delete CV"
                >
                  <Trash2 className="h-4 w-4 text-blue-600" />
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center hover:border-gray-400 transition-colors">
          {hasCV ? (
            <Button type="button" variant="outline" size="sm" className="rounded-full text-blue-600 border-blue-600">
              Update resume
            </Button>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">
                {disabled ? "CV upload disabled in preview mode" : "Click to upload your CV (PDF, DOC)"}
              </p>
            </>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Supported formats: DOC, DOCX, PDF, up to 2 MB
          </p>
        </div>
      </div>
    </FileUpload>
  );
}