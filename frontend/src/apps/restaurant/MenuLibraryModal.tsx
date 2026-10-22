import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Check,
  X,
  Sparkles,
  UtensilsCrossed,
  Wine,
  Flame,
  ChefHat,
  Filter,
  Layers,
  Info,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  Copy,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { dinelyClient } from '../../packages/api/client';
import { CatalogueItem, CatalogueResponse, MenuCategory, MenuItem, AddLibraryItemEntry } from '../../packages/types';
import { Button } from '../../packages/ui/Button';
import { Badge } from '../../packages/ui/Badge';
import { Modal } from '../../packages/ui/Modal';
import { SearchInput } from '../../packages/ui/SearchInput';

interface MenuLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  existingCategories: MenuCategory[];
  existingMenuItems: MenuItem[];
  onItemsAdded: () => void;
}

export const MenuLibraryModal: React.FC<MenuLibraryModalProps> = ({
  isOpen,
  onClose,
  restaurantId,
  existingCategories,
  existingMenuItems,
  onItemsAdded,
}) => {
  // Navigation & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'FOOD' | 'BAR' | 'HOOKAH'>('ALL');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('ALL');
  const [selectedCuisine, setSelectedCuisine] = useState<string>('ALL');
  const [selectedDiet, setSelectedDiet] = useState<string>('ALL');

  // Catalogue Data State
  const [catalogueData, setCatalogueData] = useState<CatalogueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-Selection State
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Configuration Drawer / Modal State
  const [previewItem, setPreviewItem] = useState<CatalogueItem | null>(null);
  const [isConfigDrawerOpen, setIsConfigDrawerOpen] = useState(false);
  const [configEntries, setConfigEntries] = useState<Record<string, {
    price: number;
    customName: string;
    customDescription: string;
    categoryName: string;
    categoryId?: string;
    targetDestination: string;
    servingSize: string;
    duplicateAction: 'SKIP' | 'CREATE_COPY' | 'OVERWRITE';
  }>>({});

  // Description Generator Assistant State
  const [activeDescGeneratorId, setActiveDescGeneratorId] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<'classic' | 'modern' | 'concise' | 'artisanal'>('classic');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    addedCount: number;
    skippedCount: number;
    updatedCount: number;
    message: string;
  } | null>(null);

  // Set of existing names in lower-case for duplicate detection
  const existingNamesSet = useMemo(() => {
    return new Set(existingMenuItems.map(m => (m.name || '').toLowerCase().trim()));
  }, [existingMenuItems]);

  // Load catalogue items
  const loadCatalogue = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await dinelyClient.getMenuLibrary({
        search: searchQuery.trim() || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        subcategory: selectedSubcategory !== 'ALL' ? selectedSubcategory : undefined,
        cuisine: selectedCuisine !== 'ALL' ? selectedCuisine : undefined,
        dietaryType: selectedDiet !== 'ALL' ? selectedDiet : undefined,
        limit: 50,
      });
      setCatalogueData(res);
    } catch (err: any) {
      console.error('[MENU_LIBRARY_LOAD_ERROR]', err);
      setError(err?.message || 'Failed to load menu library catalogue. Please check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCatalogue();
    }
  }, [isOpen, selectedCategory, selectedSubcategory, selectedCuisine, selectedDiet]);

  // Handle Search Debounce
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadCatalogue();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Toggle Item Selection
  const toggleSelectItem = (item: CatalogueItem) => {
    const next = new Set(selectedItemIds);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
      // Initialize configuration entry if not already set
      if (!configEntries[item.id]) {
        const isDup = existingNamesSet.has(item.name.toLowerCase().trim());
        const defaultCat = existingCategories.find(c => c.name.toLowerCase() === item.subcategory.toLowerCase())?.name || item.subcategory;
        setConfigEntries(prev => ({
          ...prev,
          [item.id]: {
            price: item.suggestedPriceInr || 250,
            customName: item.name,
            customDescription: item.shortDescription || item.longDescription,
            categoryName: defaultCat,
            targetDestination: item.targetDestination,
            servingSize: item.servingSize || '',
            duplicateAction: isDup ? 'SKIP' : 'CREATE_COPY',
          }
        }));
      }
    }
    setSelectedItemIds(next);
  };

  // Open configuration modal for selected items
  const openConfigurationDrawer = () => {
    if (selectedItemIds.size === 0) return;
    // Ensure all selected items have config initialized
    const updated = { ...configEntries };
    catalogueData?.items.forEach(item => {
      if (selectedItemIds.has(item.id) && !updated[item.id]) {
        const isDup = existingNamesSet.has(item.name.toLowerCase().trim());
        const defaultCat = existingCategories.find(c => c.name.toLowerCase() === item.subcategory.toLowerCase())?.name || item.subcategory;
        updated[item.id] = {
          price: item.suggestedPriceInr || 250,
          customName: item.name,
          customDescription: item.shortDescription || item.longDescription,
          categoryName: defaultCat,
          targetDestination: item.targetDestination,
          servingSize: item.servingSize || '',
          duplicateAction: isDup ? 'SKIP' : 'CREATE_COPY',
        };
      }
    });
    setConfigEntries(updated);
    setIsConfigDrawerOpen(true);
  };

  // Single Item Direct Add
  const handleDirectConfigureSingleItem = (item: CatalogueItem) => {
    const next = new Set<string>([item.id]);
    setSelectedItemIds(next);
    const isDup = existingNamesSet.has(item.name.toLowerCase().trim());
    const defaultCat = existingCategories.find(c => c.name.toLowerCase() === item.subcategory.toLowerCase())?.name || item.subcategory;
    setConfigEntries({
      [item.id]: {
        price: item.suggestedPriceInr || 250,
        customName: item.name,
        customDescription: item.shortDescription || item.longDescription,
        categoryName: defaultCat,
        targetDestination: item.targetDestination,
        servingSize: item.servingSize || '',
        duplicateAction: isDup ? 'SKIP' : 'CREATE_COPY',
      }
    });
    setIsConfigDrawerOpen(true);
  };

  // Generate description for an item
  const handleRunDescriptionGenerator = async (item: CatalogueItem, tone: 'classic' | 'modern' | 'concise' | 'artisanal') => {
    setIsGeneratingDesc(true);
    try {
      const res = await dinelyClient.generateDescription({
        itemName: item.name,
        category: item.category,
        cuisine: item.cuisine,
        flavourProfile: item.flavourProfile,
        ingredients: item.ingredients,
        dietaryType: item.dietaryType,
        servingSize: item.servingSize,
        tone: tone
      });
      if (configEntries[item.id]) {
        setConfigEntries(prev => ({
          ...prev,
          [item.id]: {
            ...prev[item.id],
            customDescription: res.shortDescription || res.longDescription
          }
        }));
      }
    } catch (err) {
      console.error('[DESCRIPTION_GEN_ERR]', err);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  // Submit Items to Restaurant Menu
  const handleConfirmImport = async () => {
    const itemsToAdd: AddLibraryItemEntry[] = [];
    selectedItemIds.forEach(id => {
      const entry = configEntries[id];
      if (entry) {
        if (!entry.price || entry.price <= 0) {
          throw new Error(`Item '${entry.customName}' must have a valid selling price greater than 0.`);
        }
        itemsToAdd.push({
          catalogueItemId: id,
          price: entry.price,
          customName: entry.customName,
          customDescription: entry.customDescription,
          categoryName: entry.categoryName,
          targetDestination: entry.targetDestination,
          servingSize: entry.servingSize,
          duplicateAction: entry.duplicateAction,
        });
      }
    });

    if (itemsToAdd.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await dinelyClient.addLibraryItemsToMenu(restaurantId, itemsToAdd);
      setSubmitFeedback({
        addedCount: res.addedCount,
        skippedCount: res.skippedCount,
        updatedCount: res.updatedCount,
        message: `Successfully processed ${itemsToAdd.length} items: ${res.addedCount} added, ${res.updatedCount} updated, ${res.skippedCount} skipped.`
      });
      onItemsAdded();
      setSelectedItemIds(new Set());
      setIsConfigDrawerOpen(false);
    } catch (err: any) {
      console.error('[MENU_IMPORT_SUBMIT_ERROR]', err);
      setError(err?.message || 'Failed to import items into restaurant menu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-hidden animate-fadeIn">
      <div className="relative w-full max-w-6xl h-[92vh] flex flex-col bg-[#0b0d12] border border-[#1e232e] rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-[#1e232e] bg-[#0e1117]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Global Menu Library
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Indian Regional & Lounge
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Browse authentic Bengali, North Indian, South Indian, Bar and Hookah templates. Select and import with customized pricing.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {selectedItemIds.size > 0 && (
              <Button
                variant="brand"
                size="sm"
                onClick={openConfigurationDrawer}
                className="text-xs shadow-lg shadow-emerald-500/20 animate-pulse"
                icon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Configure & Import ({selectedItemIds.size})
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1f2c] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banner */}
        {submitFeedback && (
          <div className="px-6 py-2.5 bg-emerald-950/40 border-b border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {submitFeedback.message}
            </span>
            <button
              onClick={() => setSubmitFeedback(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="p-4 bg-[#0e1117] border-b border-[#1e232e] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#12151b] rounded-xl border border-[#1e232e] overflow-x-auto">
            <button
              onClick={() => { setSelectedCategory('ALL'); setSelectedSubcategory('ALL'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              All Items ({catalogueData?.total || 0})
            </button>
            <button
              onClick={() => { setSelectedCategory('FOOD'); setSelectedSubcategory('ALL'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedCategory === 'FOOD'
                  ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-400" />
              <span>Food & Regional</span>
            </button>
            <button
              onClick={() => { setSelectedCategory('BAR'); setSelectedSubcategory('ALL'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedCategory === 'BAR'
                  ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Wine className="w-3.5 h-3.5 text-purple-400" />
              <span>Bar & Beverages</span>
            </button>
            <button
              onClick={() => { setSelectedCategory('HOOKAH'); setSelectedSubcategory('ALL'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                selectedCategory === 'HOOKAH'
                  ? 'bg-[#181d27] text-white border border-[#2d3545] shadow-xs'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Hookah & Shisha</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="w-full">
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search dish, Hilsa, Biryani, kasundi, spice, mint..."
              />
            </div>
          </div>

          {/* Granular Dropdown Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Cuisine Filter */}
            <select
              value={selectedCuisine}
              onChange={e => setSelectedCuisine(e.target.value)}
              className="bg-[#12151b] border border-[#1e232e] text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Cuisines</option>
              {catalogueData?.facets?.cuisines?.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Subcategory Filter */}
            <select
              value={selectedSubcategory}
              onChange={e => setSelectedSubcategory(e.target.value)}
              className="bg-[#12151b] border border-[#1e232e] text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 max-w-[140px]"
            >
              <option value="ALL">All Sections</option>
              {catalogueData?.facets?.subcategories?.map(sc => (
                <option key={sc} value={sc}>{sc}</option>
              ))}
            </select>

            {/* Dietary Filter */}
            <select
              value={selectedDiet}
              onChange={e => setSelectedDiet(e.target.value)}
              className="bg-[#12151b] border border-[#1e232e] text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Diet</option>
              <option value="VEG">Veg Only</option>
              <option value="NON_VEG">Non-Veg Only</option>
              <option value="EGG">Contains Egg</option>
              <option value="VEGAN">Vegan Only</option>
            </select>
          </div>
        </div>

        {/* Content Body / Items Grid */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
              <p className="text-sm">Loading authentic culinary catalogue...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-400 bg-rose-950/20 rounded-xl border border-rose-900/30">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="font-semibold">{error}</p>
              <Button variant="outline" size="sm" onClick={loadCatalogue} className="mt-4">
                Retry Loading
              </Button>
            </div>
          ) : !catalogueData || catalogueData.items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-slate-600" />
              <p className="text-base font-semibold text-slate-300">No catalogue items found</p>
              <p className="text-xs text-slate-500 mt-1">Try relaxing your search terms or filter selection.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalogueData.items.map(item => {
                const isSelected = selectedItemIds.has(item.id);
                const isAlreadyOnMenu = existingNamesSet.has(item.name.toLowerCase().trim());

                return (
                  <div
                    key={item.id}
                    className={`group relative flex flex-col justify-between bg-[#12151b] border rounded-xl overflow-hidden transition-all duration-200 hover:border-indigo-500/40 hover:shadow-xl ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/10 shadow-lg shadow-emerald-500/5'
                        : isAlreadyOnMenu
                        ? 'border-[#242b3b] opacity-90'
                        : 'border-[#1e232e]'
                    }`}
                  >
                    {/* Top image & badges */}
                    <div className="relative h-40 w-full bg-slate-900 overflow-hidden">
                      <img
                        src={item.imageUrl || "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#12151b] via-transparent to-black/60" />

                      {/* Top Bar Badges */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
                        {/* Dietary Dot */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider backdrop-blur-md border ${
                          item.dietaryType === 'NON_VEG'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                            : item.dietaryType === 'EGG'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                        }`}>
                          {item.dietaryType === 'NON_VEG' ? 'NON-VEG' : item.dietaryType === 'EGG' ? 'EGG' : 'VEG'}
                        </span>

                        {/* Station Badge */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-slate-300 backdrop-blur-md border border-white/10">
                          {item.targetDestination === 'BAR' && <Wine className="w-2.5 h-2.5 text-purple-400" />}
                          {item.targetDestination === 'HOOKAH' && <Flame className="w-2.5 h-2.5 text-amber-400" />}
                          {item.targetDestination === 'KITCHEN' && <ChefHat className="w-2.5 h-2.5 text-emerald-400" />}
                          {item.targetDestination}
                        </span>

                        {/* Cuisine Tag */}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-950/70 text-indigo-300 border border-indigo-500/30">
                          {item.cuisine}
                        </span>
                      </div>

                      {/* Selection Checkbox */}
                      <button
                        onClick={() => toggleSelectItem(item)}
                        className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-md flex items-center justify-center transition-all ${
                          isSelected
                            ? 'bg-emerald-500 text-white shadow-md'
                            : 'bg-black/50 text-white/60 hover:text-white border border-white/30 backdrop-blur-xs'
                        }`}
                        title="Select for bulk import"
                      >
                        {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </button>

                      {/* Already on menu indicator */}
                      {isAlreadyOnMenu && (
                        <div className="absolute bottom-2 left-2.5 text-[10px] font-medium text-amber-400 flex items-center gap-1 bg-black/70 px-2 py-0.5 rounded-md backdrop-blur-xs">
                          <Check className="w-3 h-3 text-amber-400" /> On Menu
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                            {item.name}
                          </h4>
                        </div>

                        {/* Section Subcategory */}
                        <p className="text-[11px] text-indigo-400/80 font-medium mt-0.5">
                          {item.subcategory}
                        </p>

                        {/* Short Description */}
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                          {item.shortDescription || item.longDescription}
                        </p>

                        {/* Ingredients Chips */}
                        {item.ingredients && item.ingredients.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {item.ingredients.slice(0, 3).map(ing => (
                              <span key={ing} className="text-[10px] bg-[#181d27] text-slate-300 px-1.5 py-0.5 rounded border border-[#2d3545]">
                                {ing}
                              </span>
                            ))}
                            {item.ingredients.length > 3 && (
                              <span className="text-[10px] text-slate-500 px-1 py-0.5">
                                +{item.ingredients.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="mt-4 pt-3 border-t border-[#1e232e] flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Benchmark</span>
                          <span className="text-xs font-bold text-slate-300">
                            {item.suggestedPriceInr ? `₹${item.suggestedPriceInr.toFixed(2)}` : 'Custom Price'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1a1f2c] transition-colors text-xs"
                            title="View Full Recipe, Allergens & Story"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <Button
                            variant={isSelected ? "outline" : "brand"}
                            size="sm"
                            onClick={() => handleDirectConfigureSingleItem(item)}
                            className="text-xs py-1 px-2.5 h-auto"
                          >
                            Add to Menu
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Multi-Item Floating Bottom Action Bar */}
        {selectedItemIds.size > 0 && (
          <div className="p-3 sm:p-4 bg-[#12151b] border-t border-emerald-500/30 flex items-center justify-between gap-4 shrink-0 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/40">
                {selectedItemIds.size}
              </span>
              <span className="text-xs text-slate-300">
                Items selected for restaurant menu import
              </span>
              <button
                onClick={() => setSelectedItemIds(new Set())}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer ml-2"
              >
                Clear Selection
              </button>
            </div>

            <Button
              variant="brand"
              size="sm"
              onClick={openConfigurationDrawer}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Configure & Import Selected ({selectedItemIds.size})
            </Button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 1: Detail Preview Drawer for a Single Item               */}
        {/* ------------------------------------------------------------- */}
        {previewItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
            <div className="bg-[#0e1117] border border-[#1e232e] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-scaleUp">
              <div className="relative h-48 bg-slate-900">
                <img
                  src={previewItem.imageUrl || "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"}
                  alt={previewItem.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e1117] via-transparent to-black/60" />
                <button
                  onClick={() => setPreviewItem(null)}
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-4 right-4">
                  <span className="text-xs text-indigo-400 font-medium">{previewItem.cuisine} • {previewItem.subcategory}</span>
                  <h3 className="text-xl font-bold text-white">{previewItem.name}</h3>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Culinary Story / Description */}
                <div>
                  <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Culinary Background</h5>
                  <p className="text-sm text-slate-200 mt-1 leading-relaxed">
                    {previewItem.longDescription || previewItem.shortDescription}
                  </p>
                </div>

                {/* Flavour & Preparation */}
                {previewItem.flavourProfile && (
                  <div className="p-3 bg-[#12151b] rounded-xl border border-[#1e232e]">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Flavour Signature</span>
                    <span className="text-xs text-indigo-300 font-medium mt-0.5 block">{previewItem.flavourProfile}</span>
                  </div>
                )}

                {/* Ingredients */}
                {previewItem.ingredients && previewItem.ingredients.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Verified Ingredients</h5>
                    <div className="flex flex-wrap gap-1.5">
                      {previewItem.ingredients.map(ing => (
                        <span key={ing} className="px-2 py-1 rounded-lg text-xs bg-[#181d27] text-slate-200 border border-[#2d3545]">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Allergens & Notes */}
                {previewItem.allergens && previewItem.allergens.length > 0 && (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Known Allergens:
                    </span>
                    <p className="mt-1">{previewItem.allergens.join(', ')}</p>
                  </div>
                )}

                {/* Preparation & Service Specs */}
                <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block">Station Routing:</span>
                    <span className="font-semibold text-slate-200">{previewItem.targetDestination}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Serving Size:</span>
                    <span className="font-semibold text-slate-200">{previewItem.servingSize || 'Standard Table Portion'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-[#1e232e] bg-[#12151b] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">Benchmark Price</span>
                  <span className="text-base font-bold text-emerald-400">
                    {previewItem.suggestedPriceInr ? `₹${previewItem.suggestedPriceInr.toFixed(2)}` : 'Custom Price'}
                  </span>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    handleDirectConfigureSingleItem(previewItem);
                    setPreviewItem(null);
                  }}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Configure & Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* MODAL 2: Configuration & Price Approval Drawer for Items       */}
        {/* ------------------------------------------------------------- */}
        {isConfigDrawerOpen && (
          <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xs">
            <div className="bg-[#0b0d12] border border-[#1e232e] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scaleUp">
              
              {/* Drawer Header */}
              <div className="p-4 sm:p-5 border-b border-[#1e232e] bg-[#0e1117] flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Approve Menu Pricing & Category Assignment
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure your restaurant's selling price, section, and station for each selected template.
                  </p>
                </div>
                <button
                  onClick={() => setIsConfigDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a1f2c]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Items List for Approval */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                {(Array.from(selectedItemIds) as string[]).map((itemId: string) => {
                  const tpl = catalogueData?.items.find(i => i.id === itemId);
                  const entry = configEntries[itemId];
                  if (!tpl || !entry) return null;

                  const isDup = existingNamesSet.has(tpl.name.toLowerCase().trim());

                  return (
                    <div
                      key={itemId}
                      className="p-4 bg-[#12151b] border border-[#1e232e] rounded-xl flex flex-col gap-3.5 hover:border-[#2d3545] transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <img
                            src={tpl.imageUrl || "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"}
                            alt={tpl.name}
                            className="w-12 h-12 rounded-lg object-cover border border-[#2d3545] shrink-0"
                          />
                          <div>
                            <span className="text-xs font-bold text-white">{tpl.name}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              <span>{tpl.cuisine}</span>
                              <span>•</span>
                              <span className="text-indigo-400">{tpl.targetDestination}</span>
                              {isDup && (
                                <span className="text-amber-400 font-semibold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  Duplicate Name Detected
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Benchmark reference */}
                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-slate-500 block">Suggested Benchmark</span>
                          <span className="text-xs font-medium text-slate-300">
                            {tpl.suggestedPriceInr ? `₹${tpl.suggestedPriceInr.toFixed(2)}` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Config Controls Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#1e232e]">
                        {/* Selling Price Input (Mandatory > 0) */}
                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Your Selling Price (₹) <span className="text-rose-400">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            value={entry.price || ''}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0;
                              setConfigEntries(prev => ({
                                ...prev,
                                [itemId]: { ...prev[itemId], price: val }
                              }));
                            }}
                            className="w-full bg-[#0b0d12] border border-[#2d3545] text-white rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                            placeholder="e.g. 350.00"
                          />
                        </div>

                        {/* Category Assignment */}
                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Menu Section / Category
                          </label>
                          <input
                            type="text"
                            value={entry.categoryName}
                            onChange={e => {
                              setConfigEntries(prev => ({
                                ...prev,
                                [itemId]: { ...prev[itemId], categoryName: e.target.value }
                              }));
                            }}
                            className="w-full bg-[#0b0d12] border border-[#2d3545] text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                            placeholder="e.g. Bengali Specialities"
                          />
                        </div>

                        {/* Duplicate Resolution Strategy */}
                        {isDup ? (
                          <div>
                            <label className="text-[11px] font-semibold text-amber-300 block mb-1">
                              Duplicate Action
                            </label>
                            <select
                              value={entry.duplicateAction}
                              onChange={e => {
                                setConfigEntries(prev => ({
                                  ...prev,
                                  [itemId]: { ...prev[itemId], duplicateAction: e.target.value as any }
                                }));
                              }}
                              className="w-full bg-[#0b0d12] border border-amber-500/40 text-amber-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                            >
                              <option value="SKIP">Skip Item (Do Not Import)</option>
                              <option value="CREATE_COPY">Create Additional Copy</option>
                              <option value="OVERWRITE">Update Existing Menu Item</option>
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                              Serving Size / Unit
                            </label>
                            <input
                              type="text"
                              value={entry.servingSize}
                              onChange={e => {
                                setConfigEntries(prev => ({
                                  ...prev,
                                  [itemId]: { ...prev[itemId], servingSize: e.target.value }
                                }));
                              }}
                              className="w-full bg-[#0b0d12] border border-[#2d3545] text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                              placeholder="e.g. Serves 1-2"
                            />
                          </div>
                        )}
                      </div>

                      {/* Description & AI Template Button */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-semibold text-slate-300">
                            Menu Description
                          </label>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">Tone:</span>
                            {(['classic', 'modern', 'concise', 'artisanal'] as const).map(tone => (
                              <button
                                key={tone}
                                onClick={() => handleRunDescriptionGenerator(tpl, tone)}
                                disabled={isGeneratingDesc}
                                className="text-[10px] px-2 py-0.5 rounded bg-[#181d27] hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 capitalize transition-colors"
                              >
                                {tone}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea
                          rows={2}
                          value={entry.customDescription}
                          onChange={e => {
                            setConfigEntries(prev => ({
                              ...prev,
                              [itemId]: { ...prev[itemId], customDescription: e.target.value }
                            }));
                          }}
                          className="w-full bg-[#0b0d12] border border-[#2d3545] text-slate-200 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed"
                          placeholder="Menu item description..."
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-[#1e232e] bg-[#0e1117] flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfigDrawerOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>

                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleConfirmImport}
                  disabled={isSubmitting}
                  icon={isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                >
                  {isSubmitting ? 'Importing Items...' : `Import ${selectedItemIds.size} Items into Menu`}
                </Button>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};
