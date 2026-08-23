import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Building,
  Globe,
  Compass,
  Edit3,
} from 'lucide-react';
import { StructuredAddress, searchAddresses, reverseGeocode } from '../utils/addressGeocoding';
import { Button } from './Button';

export interface AddressAutocompleteProps {
  value: string;
  onSelectAddress: (address: StructuredAddress) => void;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  className?: string;
  selectedLocation?: StructuredAddress | null;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onSelectAddress,
  onChangeText,
  placeholder = 'Type your restaurant address (e.g. Park Street Kolkata or MG Road Bengaluru)...',
  className = '',
  selectedLocation,
}) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<StructuredAddress[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSelected, setHasSelected] = useState(Boolean(selectedLocation?.city));

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<any>(null);

  // Sync internal query with prop value if modified externally
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Click outside to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setHasSelected(false);
    setSearchError('');
    if (onChangeText) onChangeText(val);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!val || val.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setShowDropdown(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchAddresses(val);
        setSuggestions(results);
        setIsSearching(false);
        if (results.length === 0) {
          setSearchError('No matching venue addresses found. Try typing city or area name.');
        }
      } catch (err) {
        setIsSearching(false);
        setSearchError('Failed to fetch address suggestions. You can manually complete details below.');
      }
    }, 250);
  };

  const handleSelectSuggestion = (item: StructuredAddress) => {
    setQuery(item.fullAddress);
    setSuggestions([]);
    setShowDropdown(false);
    setHasSelected(true);
    onSelectAddress(item);
  };

  // Browser GPS Geolocation Handler
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation permission is not supported by your browser.');
      return;
    }

    setIsLocatingGPS(true);
    setShowDropdown(false);
    setSearchError('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const addressObj = await reverseGeocode(latitude, longitude);
          if (addressObj) {
            setQuery(addressObj.fullAddress);
            setHasSelected(true);
            onSelectAddress(addressObj);
          }
        } catch (err) {
          setSearchError('Could not resolve address from GPS. Please type address manually.');
        } finally {
          setIsLocatingGPS(false);
        }
      },
      (err) => {
        setIsLocatingGPS(false);
        alert('Could not access current location. Please grant location permissions or type address.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className={`w-full space-y-3 relative ${className}`} ref={dropdownRef}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="block text-xs font-bold text-slate-300">
          Restaurant Venue Address Autocomplete *
        </label>
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocatingGPS}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700/80 text-xs font-semibold transition-all cursor-pointer shadow-sm w-fit active:scale-95 disabled:opacity-50"
        >
          {isLocatingGPS ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
              <span>Detecting GPS Location...</span>
            </>
          ) : (
            <>
              <Navigation className="w-3.5 h-3.5 text-rose-400" />
              <span>Use Current Location (GPS)</span>
            </>
          )}
        </button>
      </div>

      {/* Autocomplete Input */}
      <div className="relative">
        <div className="absolute left-3.5 top-3 text-slate-400 pointer-events-none">
          <MapPin className="w-4 h-4 text-rose-500" />
        </div>

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          className="w-full bg-slate-950 text-slate-100 text-sm rounded-xl pl-10 pr-10 py-3 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition-all placeholder:text-slate-500"
        />

        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          {isSearching && <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />}
          {query && !isSearching && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setShowDropdown(false);
                setHasSelected(false);
              }}
              className="text-slate-500 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Suggestion Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
          {isSearching ? (
            <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
              <span>Searching venue locations...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 space-y-1">
              <AlertCircle className="w-4 h-4 text-amber-400 mx-auto" />
              <p className="font-semibold text-slate-300">No matching addresses found</p>
              <p className="text-[11px] text-slate-500">Type your street name, area, or landmark in India</p>
            </div>
          ) : (
            suggestions.map((item, idx) => (
              <button
                key={item.placeId || idx}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className="w-full p-3.5 text-left hover:bg-slate-900 transition-colors flex items-start gap-3 cursor-pointer group"
              >
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors shrink-0 mt-0.5">
                  <Building className="w-4 h-4" />
                </div>
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-xs font-bold text-white group-hover:text-rose-300 transition-colors truncate">
                    {item.fullAddress}
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {[item.locality, item.city, item.state, item.country].filter(Boolean).join(' • ')}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Auto-Populated Location Extracted Summary Card */}
      {(hasSelected || selectedLocation?.city) && selectedLocation && (
        <div className="p-4 bg-slate-950/90 rounded-2xl border border-emerald-500/30 text-xs space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Address & Geocoding Extracted
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              GPS: {selectedLocation.latitude ? `${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude?.toFixed(4)}` : 'Verified'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-mono">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">City</span>
              <span className="font-bold text-white truncate block">{selectedLocation.city || 'Kolkata'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">State / Region</span>
              <span className="font-bold text-slate-200 truncate block">{selectedLocation.state || 'West Bengal'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Country</span>
              <span className="font-bold text-slate-200 truncate block">{selectedLocation.country || 'India'}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">PIN Code</span>
              <span className="font-bold text-amber-400 block">{selectedLocation.postalCode || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
