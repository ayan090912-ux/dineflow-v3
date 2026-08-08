import React, { useState, useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Card } from './Card';
import { Button } from './Button';
import {
  Download,
  ExternalLink,
  Printer,
  Sparkles,
  Palette,
  Check,
  QrCode,
  Wifi,
  Utensils,
  Crown,
  Layers,
  Image as ImageIcon,
  Copy,
  Share2,
} from 'lucide-react';

export interface QRCodeDisplayProps {
  url?: string;
  value?: string;
  tableNumber?: string;
  restaurantName?: string;
  restaurantLogo?: string;
  section?: string;
  capacity?: number;
  size?: number;
  isPickup?: boolean;
}

export type QRDesignPreset = 'SIMPLE' | 'ACRYLIC_DARK' | 'GOLD_LUXE' | 'WOOD_BISTRO' | 'NEON_CYBER';

export const printQRCodeCard = (
  element: HTMLElement | null,
  restaurantName: string = 'Restaurant',
  tableNumber: string = 'COUNTER'
) => {
  if (!element) {
    window.print();
    return;
  }

  const printWin = window.open('', '_blank', 'width=750,height=900');
  if (!printWin) {
    window.print();
    return;
  }

  const cardHtml = element.innerHTML;
  const cardBgColor = element.style.backgroundColor || '#0f172a';
  const cardTextColor = element.style.color || '#ffffff';
  const cardBorderColor = element.style.borderColor || 'rgba(255,255,255,0.1)';

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print QR Standee - ${restaurantName} (${tableNumber})</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-card-wrapper {
            width: 340px;
            padding: 28px;
            border-radius: 28px;
            text-align: center;
            background-color: ${cardBgColor} !important;
            color: ${cardTextColor} !important;
            border: 2px solid ${cardBorderColor} !important;
            box-shadow: 0 20px 40px rgba(0,0,0,0.15);
            margin: auto;
          }
          .printable-card-wrapper img {
            max-width: 100%;
            height: auto;
          }
          .hidden { display: none !important; }
          @media print {
            body { background: transparent !important; padding: 0 !important; }
            .printable-card-wrapper { box-shadow: none !important; margin: 0 auto !important; }
          }
        </style>
      </head>
      <body>
        <div class="printable-card-wrapper">
          ${cardHtml}
        </div>
        <script>
          setTimeout(() => {
            window.focus();
            window.print();
            window.close();
          }, 350);
        </script>
      </body>
    </html>
  `);
  printWin.document.close();
};

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  url,
  value,
  tableNumber,
  restaurantName,
  restaurantLogo = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
  section = 'Main Dining Hall',
  capacity = 4,
  size = 200,
  isPickup = false,
}) => {
  const [preset, setPreset] = useState<QRDesignPreset>('ACRYLIC_DARK');
  const [ctaText, setCtaText] = useState(isPickup || tableNumber === 'COUNTER' ? 'Scan to Order & Collect at Counter' : 'Scan to View Menu & Order Live');
  const [showLogo, setShowLogo] = useState(true);
  const [showWifi, setShowWifi] = useState(true);
  const [accentColor, setAccentColor] = useState('#f43f5e'); // Rose 500
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  const qrUrl = url || value || 'https://dineflow.app';
  const safeTableNum = (tableNumber || (isPickup ? 'COUNTER' : 'Table 01')).trim();
  const safeRestName = restaurantName || 'DineFlow Venue';

  // Copy link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download simple QR code image only
  const handleDownloadSimpleQR = () => {
    if (!qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const image = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = image;
    a.download = `QR_Code_${safeTableNum.replace(/\s+/g, '_')}_Simple.png`;
    a.click();
  };

  // Download SVG file
  const handleDownloadSVG = () => {
    const svgElement = document.getElementById(`qr-svg-${safeTableNum.replace(/\s+/g, '_')}`);
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const a = document.createElement('a');
    a.href = svgUrl;
    a.download = `QR_Code_${safeTableNum.replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(svgUrl);
  };

  // High-Resolution Custom Tabletop Card Canvas Export (300 DPI 4x6 print quality)
  const handleDownloadCustomCardPNG = async () => {
    setIsDownloading(true);
    try {
      const cardWidth = 1200;
      const cardHeight = 1600;

      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Draw Background & Frame based on Preset
      if (preset === 'SIMPLE') {
        // Clean Minimal White
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        // Border frame
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 16;
        ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);

        ctx.fillStyle = '#0f172a';
      } else if (preset === 'GOLD_LUXE') {
        // Royal Gold & Black
        ctx.fillStyle = '#0b0f19';
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        // Gold outer frame
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 24;
        ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 6;
        ctx.strokeRect(60, 60, cardWidth - 120, cardHeight - 120);
      } else if (preset === 'WOOD_BISTRO') {
        // Warm Walnut Wood
        const grad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
        grad.addColorStop(0, '#1c1917');
        grad.addColorStop(1, '#292524');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 20;
        ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);
      } else if (preset === 'NEON_CYBER') {
        // Neon Cyber
        const grad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(0.5, '#111827');
        grad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 12;
        ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);
      } else {
        // ACRYLIC DARK (Default)
        const grad = ctx.createLinearGradient(0, 0, cardWidth, cardHeight);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        // Accent border glow
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 14;
        ctx.strokeRect(40, 40, cardWidth - 80, cardHeight - 80);
      }

      // 2. Draw Header Restaurant Name
      ctx.textAlign = 'center';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillStyle = preset === 'SIMPLE' ? '#0f172a' : preset === 'GOLD_LUXE' ? '#fbbf24' : '#ffffff';
      ctx.fillText(restaurantName.toUpperCase(), cardWidth / 2, 180);

      // Subheader Section
      ctx.font = '500 32px sans-serif';
      ctx.fillStyle = preset === 'SIMPLE' ? '#64748b' : preset === 'GOLD_LUXE' ? '#d97706' : '#94a3b8';
      ctx.fillText(`${section} • ${tableNumber}`, cardWidth / 2, 230);

      // 3. Draw QR Code Container
      const qrBoxSize = 620;
      const qrBoxX = (cardWidth - qrBoxSize) / 2;
      const qrBoxY = 320;

      // QR White Background Card
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 36);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Draw QR Canvas content onto the card
      if (qrCanvasRef.current) {
        const qrImage = new Image();
        qrImage.src = qrCanvasRef.current.toDataURL('image/png');
        await new Promise((resolve) => {
          qrImage.onload = resolve;
        });
        const qrSize = 520;
        ctx.drawImage(qrImage, (cardWidth - qrSize) / 2, qrBoxY + 50, qrSize, qrSize);
      }

      // 4. Call To Action Badge Below QR
      const ctaY = qrBoxY + qrBoxSize + 110;
      ctx.fillStyle = preset === 'SIMPLE' ? '#0f172a' : accentColor;
      ctx.beginPath();
      ctx.roundRect(140, ctaY - 50, cardWidth - 280, 100, 50);
      ctx.fill();

      ctx.font = 'bold 38px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ctaText, cardWidth / 2, ctaY + 14);

      // 5. Large Table Number Badge
      const tableY = ctaY + 180;
      ctx.font = 'black 84px sans-serif';
      ctx.fillStyle = preset === 'SIMPLE' ? '#0f172a' : preset === 'GOLD_LUXE' ? '#f59e0b' : '#ffffff';
      ctx.fillText(tableNumber, cardWidth / 2, tableY);

      // 6. Footer Info
      ctx.font = '400 28px sans-serif';
      ctx.fillStyle = preset === 'SIMPLE' ? '#64748b' : '#64748b';
      ctx.fillText(showWifi ? '📶 Free Guest Wi-Fi Available • Touchless Ordering' : 'Touchless Ordering • DineFlow OS', cardWidth / 2, cardHeight - 120);

      // Trigger Download
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR_StandCard_${tableNumber.replace(/\s+/g, '_')}_${preset}.png`;
      a.click();
    } catch (err) {
      console.error('Error generating card image:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Dedicated Print Standee Card
  const handlePrintCard = () => {
    printQRCodeCard(printAreaRef.current, safeRestName, safeTableNum);
  };

  return (
    <div className="space-y-6">
      {/* Design Preset Selector Tabs */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-rose-400" />
            Select QR Standee Aesthetic Style
          </span>
          <span className="text-[10px] text-slate-400 font-mono">5 Styles Available</span>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <button
            onClick={() => setPreset('ACRYLIC_DARK')}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
              preset === 'ACRYLIC_DARK'
                ? 'bg-rose-500/20 border-rose-500 text-white font-bold ring-1 ring-rose-500'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>🖤 Modern Dark</span>
            <span className="text-[9px] text-slate-400 mt-1">Acrylic & Glass</span>
          </button>

          <button
            onClick={() => setPreset('GOLD_LUXE')}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
              preset === 'GOLD_LUXE'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold ring-1 ring-amber-500'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>✨ Gold Luxe</span>
            <span className="text-[9px] text-slate-400 mt-1">Royal Onyx</span>
          </button>

          <button
            onClick={() => setPreset('WOOD_BISTRO')}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
              preset === 'WOOD_BISTRO'
                ? 'bg-amber-900/30 border-amber-600 text-amber-200 font-bold ring-1 ring-amber-600'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>🌿 Wood Bistro</span>
            <span className="text-[9px] text-slate-400 mt-1">Rustic Organic</span>
          </button>

          <button
            onClick={() => setPreset('NEON_CYBER')}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
              preset === 'NEON_CYBER'
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>⚡ Neon Cyber</span>
            <span className="text-[9px] text-slate-400 mt-1">Nightlife Vibe</span>
          </button>

          <button
            onClick={() => setPreset('SIMPLE')}
            className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col justify-between col-span-2 sm:col-span-1 ${
              preset === 'SIMPLE'
                ? 'bg-slate-100 text-slate-900 font-bold border-white'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>⚪ Minimal</span>
            <span className="text-[9px] text-slate-400 mt-1">Clean Printable</span>
          </button>
        </div>
      </div>

      {/* Live Tabletop Stand Preview Card */}
      <div className="flex flex-col md:flex-row gap-6 items-center md:items-start justify-center">
        {/* Visual Stand Card Container */}
        <div
          ref={printAreaRef}
          className="w-72 sm:w-80 p-6 rounded-3xl text-center space-y-4 shadow-2xl relative transition-all duration-300 border shrink-0"
          style={{
            backgroundColor:
              preset === 'ACRYLIC_DARK'
                ? '#0f172a'
                : preset === 'GOLD_LUXE'
                ? '#1e1b4b'
                : preset === 'WOOD_BISTRO'
                ? '#291e10'
                : preset === 'NEON_CYBER'
                ? '#020617'
                : '#ffffff',
            color: preset === 'SIMPLE' ? '#0f172a' : '#ffffff',
            borderColor:
              preset === 'GOLD_LUXE'
                ? '#fbbf24'
                : preset === 'NEON_CYBER'
                ? '#38bdf8'
                : 'rgba(255,255,255,0.1)',
          }}
        >
          {/* Header Branding */}
          <div className="space-y-1 my-1">
            {showLogo && restaurantLogo && (
              <img
                src={restaurantLogo}
                alt={safeRestName}
                className="w-12 h-12 mx-auto rounded-2xl object-cover border-2 border-white/20 shadow-md mb-2"
              />
            )}
            <h3 className="font-black text-lg tracking-tight uppercase">{safeRestName}</h3>
            {safeTableNum !== 'COUNTER' && !isPickup && (
              <p className="text-[11px] opacity-75 font-mono">
                {section} • {capacity} Seats
              </p>
            )}
          </div>

          {/* QR Code Container Badge */}
          <div className="p-4 bg-white rounded-2xl shadow-xl my-4 border border-slate-100 relative group">
            <QRCodeCanvas
              ref={qrCanvasRef}
              value={qrUrl}
              size={size}
              level="H"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
            {/* Hidden SVG for Vector Downloads */}
            <div className="hidden">
              <QRCodeSVG
                id={`qr-svg-${safeTableNum.replace(/\s+/g, '_')}`}
                value={qrUrl}
                size={size}
                level="H"
                includeMargin={true}
              />
            </div>
          </div>

          {/* Call to Action Badge */}
          <div
            className="px-4 py-2 rounded-full font-black text-xs shadow-md mb-3 transition-colors"
            style={{
              backgroundColor: preset === 'SIMPLE' ? '#0f172a' : accentColor,
              color: '#ffffff',
            }}
          >
            {ctaText}
          </div>

          {/* Table Badge */}
          <div className="space-y-0.5">
            <span className="text-2xl font-black font-mono tracking-wider">{safeTableNum}</span>
          </div>

          {/* Footer Wi-Fi Tag */}
          {showWifi && (
            <p className="text-[10px] opacity-60 mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-1 font-mono">
              <Wifi className="w-3 h-3" /> Free Guest Wi-Fi • DineFlow Touchless
            </p>
          )}
        </div>

        {/* Customization & Quick Actions Sidebar */}
        <div className="w-full md:w-72 space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-rose-400" /> Standee Customizer
            </h4>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Call To Action Heading</label>
              <input
                type="text"
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                placeholder="Scan to Order & Pay"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Accent Color</label>
              <div className="flex gap-2">
                {['#f43f5e', '#d97706', '#10b981', '#06b6d4', '#8b5cf6', '#0f172a'].map((col) => (
                  <button
                    key={col}
                    onClick={() => setAccentColor(col)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${
                      accentColor === col ? 'border-white scale-110 shadow-md' : 'border-transparent opacity-80'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-300">Show Restaurant Logo</span>
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
                className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Show Guest Wi-Fi Tag</span>
              <input
                type="checkbox"
                checked={showWifi}
                onChange={(e) => setShowWifi(e.target.checked)}
                className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Download & Print Action Buttons */}
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                variant="brand"
                className="py-2.5 text-xs font-bold shadow-lg shadow-rose-950/40"
                onClick={handleDownloadCustomCardPNG}
                disabled={isDownloading}
                icon={<Download className="w-4 h-4" />}
              >
                {isDownloading ? 'Generating...' : 'Download PNG'}
              </Button>

              <Button
                variant="outline"
                className="py-2.5 text-xs font-bold border-rose-500/50 text-rose-300 hover:bg-rose-500/10"
                onClick={handlePrintCard}
                icon={<Printer className="w-4 h-4 text-rose-400" />}
              >
                Print Standee Sign
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] border-slate-700 text-slate-200 hover:bg-slate-800"
                onClick={handleDownloadSimpleQR}
                icon={<QrCode className="w-3.5 h-3.5 text-amber-400" />}
              >
                Simple QR Only
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-[11px] border-slate-700 text-slate-200 hover:bg-slate-800"
                onClick={handleDownloadSVG}
                icon={<Layers className="w-3.5 h-3.5 text-sky-400" />}
              >
                Vector SVG
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] text-slate-300 hover:text-white"
                onClick={handleCopyLink}
                icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              >
                {copied ? 'Link Copied!' : 'Copy Direct Link'}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] text-slate-300 hover:text-white"
                onClick={() => window.open(url, '_blank')}
                icon={<ExternalLink className="w-3.5 h-3.5" />}
              >
                Open Live View
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
