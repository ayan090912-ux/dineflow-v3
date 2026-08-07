import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from './Input';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}) => {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      leftIcon={<Search className="w-4 h-4 text-slate-400" />}
      rightIcon={
        value ? (
          <button onClick={() => onChange('')} className="p-0.5 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    />
  );
};
