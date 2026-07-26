
import React, { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { type CompanySettings } from '@/types';
import { toast } from 'sonner';
import { getToken } from '@/utils/api';

interface BrandingImageSectionProps {
  settings: CompanySettings;
  onImageUpload: (logoPath: string) => void;
  onImageDelete?: () => void;
}

export const BrandingImageSection: React.FC<BrandingImageSectionProps> = ({
  settings,
  onImageUpload,
  onImageDelete
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const token = getToken();

      const response = await fetch('/api/settings/company/logo', {
        method: 'POST',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        onImageUpload(result.logoPath);
        toast.success('Logo uploaded successfully');
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error(`Failed to upload logo: ${(error as Error).message}`);
    } finally {
      setIsUploading(false);
      // Clear the input value so the same file can be selected again
      event.target.value = '';
    }
  };

  const handleImageDelete = async () => {
    if (!settings.brandingImage) return;

    setIsDeleting(true);

    try {
      const token = getToken();

      const response = await fetch('/api/settings/company/logo', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ logoPath: settings.brandingImage })
      });

      const result = await response.json();

      if (result.success) {
        onImageDelete?.();
        toast.success('Logo deleted successfully');
      } else {
        throw new Error(result.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Logo delete error:', error);
      toast.error(`Failed to delete logo: ${(error as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-muted-foreground mb-2">Branding Image</label>
      <div className="flex items-start space-x-4">
        <div>
          <input
            id="branding-upload"
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
          <button
            onClick={() => document.getElementById('branding-upload')?.click()}
            disabled={isUploading}
            className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-accent hover:text-accent-foreground text-card-foreground bg-card disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              settings.brandingImage ? 'Change Image' : 'Upload Image'
            )}
          </button>
        </div>

        {settings.brandingImage ? (
          <div className="relative">
            <img
              src={settings.brandingImage}
              alt="Company Logo"
              className="h-16 w-16 object-cover rounded-lg border border-border"
            />
            <button
              onClick={handleImageDelete}
              disabled={isDeleting}
              className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete logo"
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
          </div>
        ) : (
          <div className="h-16 w-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};
