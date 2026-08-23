import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, X, Link as LinkIcon, HardDrive } from 'lucide-react';
import { Button } from './Button';

export interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value,
  onChange,
  label = 'Upload Image or Logo',
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        onChange(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      onChange(customUrl.trim());
      setShowUrlInput(false);
      setCustomUrl('');
    }
  };

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-300">{label}</label>}

      {/* Hidden file input for Local Drive Selection */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {value ? (
        <div className="relative group rounded-2xl overflow-hidden border border-slate-800 h-40 bg-slate-900 shadow-md">
          <img src={value} alt="Uploaded preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              icon={<HardDrive className="w-3.5 h-3.5" />}
            >
              Change Local File
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => onChange('')}
              icon={<X className="w-3.5 h-3.5" />}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : showUrlInput ? (
        <form onSubmit={handleUrlSubmit} className="p-4 border border-slate-800 rounded-2xl bg-slate-950 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span>Enter Image URL</span>
            <button type="button" onClick={() => setShowUrlInput(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="url"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="https://images.unsplash.com/photo-..."
            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-rose-500"
          />
          <div className="flex items-center gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowUrlInput(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="brand" size="sm">
              Use URL
            </Button>
          </div>
        </form>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
            isDragging
              ? 'border-rose-500 bg-rose-500/10'
              : 'border-slate-800 hover:border-rose-500/50 bg-slate-950/70 text-slate-200'
          }`}
        >
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm mb-2 text-rose-500">
            <HardDrive className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-200 text-center">
            Upload picture from local drive or drag & drop
          </p>
          <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, WEBP, GIF supported</p>

          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-800/80 w-full justify-center">
            <Button
              type="button"
              variant="brand"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              icon={<HardDrive className="w-3.5 h-3.5" />}
              className="text-xs font-bold"
            >
              Browse Local Drive
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(true)}
              icon={<LinkIcon className="w-3.5 h-3.5" />}
              className="text-xs"
            >
              URL Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
