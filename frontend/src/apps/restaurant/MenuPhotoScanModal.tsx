import React, { useState, useRef } from 'react';
import { Upload, Sparkles, Check, Trash2, Plus, FileText, Camera, RefreshCw } from 'lucide-react';
import { Modal, Button } from '../../packages/ui';
import { api } from '../../packages/api/client';

interface ScannedMenuItem {
  _key: string;
  selected: boolean;
  name: string;
  price: string;
  category: string;
  isVegetarian: boolean;
  targetDestination: 'KITCHEN' | 'BAR' | 'HOOKAH';
  description: string;
}

interface MenuPhotoScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  stationMode?: 'FOOD' | 'BAR' | 'HOOKAH';
  onItemsImported: () => void;
}

export const MenuPhotoScanModal: React.FC<MenuPhotoScanModalProps> = ({
  isOpen,
  onClose,
  restaurantId,
  stationMode = 'FOOD',
  onItemsImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedMenuItem[]>([]);

  const mapParsedRows = (rows: any[]): ScannedMenuItem[] =>
    (rows || []).map((r, i) => ({
      _key: `scan-${Date.now()}-${i}`,
      selected: true,
      name: String(r.name || ''),
      price: String(r.price || ''),
      category: String(r.category || (stationMode === 'BAR' ? 'Cocktails & Beverages' : stationMode === 'HOOKAH' ? 'Hookah & Shisha' : 'Main Course')),
      isVegetarian: r.isVegetarian !== false,
      targetDestination: (r.targetDestination || (stationMode === 'FOOD' ? 'KITCHEN' : stationMode)) as 'KITCHEN' | 'BAR' | 'HOOKAH',
      description: String(r.description || ''),
    }));

  const safeStationMode: 'FOOD' | 'BAR' | 'HOOKAH' =
    stationMode === 'BAR' || stationMode === 'HOOKAH' ? stationMode : 'FOOD';

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setScanError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setIsScanning(true);
    try {
      const res = await api.restaurant.scanMenuImage(restaurantId, file, safeStationMode);
      setRawText(res.rawText || '');
      const mapped = mapParsedRows(res.items || []);
      setScannedItems(mapped);
      if (mapped.length === 0) {
        setShowRawText(true);
        setScanError('No priced menu items were auto-detected from this photo. You can edit the extracted text below or add rows manually.');
      }
    } catch (err: any) {
      setScanError(err?.message || 'Failed to read menu image. Try a clearer photo or paste menu text.');
      setShowRawText(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleParseText = async () => {
    if (!rawText.trim()) return;
    setScanError(null);
    setIsScanning(true);
    try {
      const res = await api.restaurant.parseMenuText(restaurantId, rawText, safeStationMode);
      const mapped = mapParsedRows(res.items || []);
      setScannedItems(mapped);
      if (mapped.length === 0) {
        setScanError('Could not detect items with prices. Format lines like "Paneer Tikka 280".');
      }
    } catch (err: any) {
      setScanError(err?.message || 'Failed to parse menu text.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddEmptyRow = () => {
    setScannedItems((prev) => [
      ...prev,
      {
        _key: `manual-${Date.now()}`,
        selected: true,
        name: '',
        price: '',
        category: stationMode === 'BAR' ? 'Cocktails & Beverages' : stationMode === 'HOOKAH' ? 'Hookah & Shisha' : 'Main Course',
        isVegetarian: true,
        targetDestination: stationMode === 'FOOD' ? 'KITCHEN' : stationMode,
        description: '',
      },
    ]);
  };

  const handleImportSelected = async () => {
    const valid = scannedItems.filter((it) => it.selected && it.name.trim() && parseFloat(it.price) > 0);
    if (valid.length === 0) {
      setScanError('Select at least one item with a valid name and price.');
      return;
    }
    setIsSaving(true);
    setScanError(null);
    try {
      await api.restaurant.bulkCreateMenuItems(
        restaurantId,
        valid.map((it) => ({
          name: it.name.trim(),
          price: parseFloat(it.price),
          category: it.category.trim() || 'Main Course',
          description: it.description.trim(),
          isVegetarian: it.isVegetarian,
          targetDestination: it.targetDestination,
        }))
      );
      onItemsImported();
      setScannedItems([]);
      setPreviewUrl(null);
      setRawText('');
      onClose();
    } catch (err: any) {
      setScanError(err?.message || 'Failed to import menu items.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = scannedItems.filter((it) => it.selected && it.name.trim() && parseFloat(it.price) > 0).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan Hardcopy Menu Photo" size="lg">
      <div className="space-y-4">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-[#2d3545] hover:border-emerald-500/60 bg-[#0d1017] rounded-xl p-5 text-center cursor-pointer transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
              {isScanning ? (
                <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <p className="text-xs font-semibold text-white">
              {isScanning ? 'Reading menu items from photo...' : 'Upload or drop a photo of your printed menu'}
            </p>
            <p className="text-[11px] text-slate-400">
              Extracts dish names, categories, prices &amp; Veg/Non-Veg automatically so you can review and add in one click.
            </p>
          </div>
        </div>

        {previewUrl && (
          <div className="flex items-center justify-between bg-[#12151b] border border-[#1e232e] rounded-xl p-2.5">
            <div className="flex items-center gap-3">
              <img src={previewUrl} alt="Menu preview" className="w-12 h-12 rounded-lg object-cover border border-[#2d3545]" />
              <div className="text-xs">
                <p className="font-medium text-white">Menu photo uploaded</p>
                <p className="text-[11px] text-slate-400">{scannedItems.length} items detected</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRawText((v) => !v)}
              className="text-[11px] text-slate-300 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#181d27] border border-[#2d3545]"
            >
              <FileText className="w-3 h-3" />
              <span>{showRawText ? 'Hide Text' : 'Edit OCR Text'}</span>
            </button>
          </div>
        )}

        {(showRawText || scannedItems.length === 0) && (
          <div className="space-y-2 bg-[#0d1017] border border-[#1e232e] rounded-xl p-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-300">
                Or paste / fix menu text (one item per line, e.g. <code className="text-emerald-400">Paneer Tikka 280</code>)
              </label>
              <button
                type="button"
                onClick={handleParseText}
                disabled={isScanning || !rawText.trim()}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40"
              >
                Parse Lines
              </button>
            </div>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={"STARTERS\nPaneer Tikka 280\nChicken Malai Tikka 340\n\nMAIN COURSE\nDal Makhani 260"}
              className="w-full bg-[#12151b] border border-[#1e232e] rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {scanError && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {scanError}
          </div>
        )}

        {scannedItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">
                Extracted Items ({selectedCount} selected)
              </span>
              <button
                type="button"
                onClick={handleAddEmptyRow}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {scannedItems.map((it, idx) => (
                <div
                  key={it._key}
                  className="grid grid-cols-12 gap-2 items-center bg-[#12151b] border border-[#1e232e] rounded-lg p-2 text-xs"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setScannedItems((prev) =>
                        prev.map((row, rIdx) => (rIdx === idx ? { ...row, selected: !row.selected } : row))
                      )
                    }
                    className={`col-span-1 w-6 h-6 rounded-md flex items-center justify-center border ${
                      it.selected
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-[#0d1017] border-[#2d3545] text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <input
                    value={it.name}
                    onChange={(e) =>
                      setScannedItems((prev) =>
                        prev.map((row, rIdx) => (rIdx === idx ? { ...row, name: e.target.value } : row))
                      )
                    }
                    placeholder="Dish name"
                    className="col-span-4 bg-[#0d1017] border border-[#1e232e] rounded px-2 py-1 text-white text-xs"
                  />
                  <input
                    value={it.category}
                    onChange={(e) =>
                      setScannedItems((prev) =>
                        prev.map((row, rIdx) => (rIdx === idx ? { ...row, category: e.target.value } : row))
                      )
                    }
                    placeholder="Category"
                    className="col-span-3 bg-[#0d1017] border border-[#1e232e] rounded px-2 py-1 text-slate-300 text-xs"
                  />
                  <input
                    type="number"
                    value={it.price}
                    onChange={(e) =>
                      setScannedItems((prev) =>
                        prev.map((row, rIdx) => (rIdx === idx ? { ...row, price: e.target.value } : row))
                      )
                    }
                    placeholder="₹"
                    className="col-span-2 bg-[#0d1017] border border-[#1e232e] rounded px-2 py-1 text-emerald-300 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setScannedItems((prev) =>
                        prev.map((row, rIdx) => (rIdx === idx ? { ...row, isVegetarian: !row.isVegetarian } : row))
                      )
                    }
                    className={`col-span-1 py-1 rounded text-[10px] font-bold border ${
                      it.isVegetarian
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                    title="Toggle Veg / Non-Veg"
                  >
                    {it.isVegetarian ? 'V' : 'NV'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScannedItems((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                    className="col-span-1 text-slate-500 hover:text-rose-400 flex justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e232e]">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="brand"
            onClick={handleImportSelected}
            disabled={isSaving || selectedCount === 0}
          >
            {isSaving ? 'Adding Items...' : `Add ${selectedCount} Items to Menu`}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
