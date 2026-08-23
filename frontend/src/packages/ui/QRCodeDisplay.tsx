import React, { useState, useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Card } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import {
  Download,
  ExternalLink,
  Printer,
  Sparkles,
  Palette,
  Check,
  QrCode,
  Wifi,
  Layers,
  Copy,
  Globe,
  Eye,
  CheckCircle2,
  Utensils,
  Smartphone,
} from 'lucide-react';

export interface QRCodeDisplayProps {
  url?: string;
  value?: string;
  tableNumber?: string;
  restaurantName?: string;
  restaurantLogo?: string;
  restaurantId?: string;
  section?: string;
  capacity?: number;
  size?: number;
  isPickup?: boolean;
}

export type QRDesignPreset = 'ACRYLIC_DARK' | 'GOLD_LUXE' | 'WOOD_BISTRO' | 'NEON_CYBER' | 'SIMPLE';

export const printQRCodeCard = (
  printContainerHtml: string,
  restaurantName: string = 'Restaurant',
  tableNumber: string = 'COUNTER',
  preset: QRDesignPreset = 'ACRYLIC_DARK',
  accentColor: string = '#f43f5e'
) => {
  const printWin = window.open('', '_blank', 'width=850,height=1050');
  if (!printWin) {
    window.print();
    return;
  }

  const getPresetStyles = () => {
    switch (preset) {
      case 'GOLD_LUXE':
        return { bg: '#1e1b4b', text: '#ffffff', border: '#fbbf24', subtext: '#f59e0b' };
      case 'WOOD_BISTRO':
        return { bg: '#291e10', text: '#fef3c7', border: '#d97706', subtext: '#b45309' };
      case 'NEON_CYBER':
        return { bg: '#020617', text: '#ffffff', border: '#38bdf8', subtext: '#38bdf8' };
      case 'SIMPLE':
        return { bg: '#ffffff', text: '#0f172a', border: '#cbd5e1', subtext: '#64748b' };
      case 'ACRYLIC_DARK':
      default:
        return { bg: '#0f172a', text: '#ffffff', border: accentColor, subtext: '#94a3b8' };
    }
  };

  const style = getPresetStyles();

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print Tabletop QR Standee - ${restaurantName} (${tableNumber})</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
            background-color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 40px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-card-wrapper {
            width: 380px;
            padding: 36px 30px;
            border-radius: 36px;
            text-align: center;
            background-color: ${style.bg} !important;
            color: ${style.text} !important;
            border: 3px solid ${style.border} !important;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            margin: auto;
            position: relative;
          }
          .printable-card-wrapper img {
            max-width: 100%;
            height: auto;
          }
          .printable-card-wrapper svg {
            display: block;
            margin: 0 auto;
            max-width: 100%;
            height: auto;
          }
          @media print {
            body { background: #ffffff !important; padding: 0 !important; }
            .printable-card-wrapper { box-shadow: none !important; margin: 0 auto !important; page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="printable-card-wrapper">
          ${printContainerHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
              window.close();
            }, 500);
          };
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
  restaurantId,
  section = 'Main Dining',
  capacity = 4,
  size = 200,
  isPickup = false,
}) => {
  const [preset, setPreset] = useState<QRDesignPreset>('ACRYLIC_DARK');
  const [ctaText, setCtaText] = useState(
    isPickup || tableNumber === 'COUNTER' ? 'SCAN TO ORDER & COLLECT' : 'SCAN TO ORDER FROM TABLE'
  );
  const [customTableLabel, setCustomTableLabel] = useState('');
  const [showLogo, setShowLogo] = useState(true);
  const [showWifi, setShowWifi] = useState(true);
  const [wifiName, setWifiName] = useState('Guest_Free_WiFi');
  const [accentColor, setAccentColor] = useState('#f43f5e'); // Rose 500
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [logoLoadError, setLogoLoadError] = useState(false);

  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const printAreaRef = useRef<HTMLDivElement | null>(null);

  // Safe Resolution of Table Number & Identifiers
  const safeTableNum = (customTableLabel || tableNumber || (isPickup ? 'COUNTER' : 'Table 01')).trim();
  const safeRestName = (restaurantName || 'Dinely Restaurant').trim();

  // Requirement 1 & 3: Construct the EXACT Destination URL
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://dinely.food';
  let defaultUrl = '';
  if (isPickup || safeTableNum.toUpperCase() === 'COUNTER') {
    defaultUrl = `${defaultOrigin}/customer${restaurantId ? `?restaurant=${restaurantId}` : ''}`;
  } else {
    defaultUrl = `${defaultOrigin}/customer?table=${encodeURIComponent(safeTableNum)}${
      restaurantId ? `&restaurant=${restaurantId}` : ''
    }`;
  }

  // Exact encoded customer destination URL (single source of truth for display, QR code, copy link, and live view)
  const rawUrl =
    url && !url.includes('qrserver.com') && !url.includes('.dinely.app')
      ? url
      : value && !value.includes('qrserver.com') && !value.includes('.dinely.app')
      ? value
      : '';
  const qrUrl = rawUrl || defaultUrl;

  // Copy link to clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // Open exact URL in live new tab
  const handleOpenLiveView = () => {
    window.open(qrUrl, '_blank');
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

  // Requirement 10: Complete Vector SVG Export
  const handleDownloadSVG = () => {
    try {
      const qrSvgElement = document.getElementById(`qr-svg-${safeTableNum.replace(/\s+/g, '_')}`);
      const qrInnerSvg = qrSvgElement ? qrSvgElement.innerHTML : '';

      const svgWidth = 600;
      const svgHeight = 900;

      let bgColor = '#0f172a';
      let textColor = '#ffffff';
      let strokeColor = accentColor;
      let subtextColor = '#94a3b8';

      if (preset === 'GOLD_LUXE') {
        bgColor = '#1e1b4b';
        strokeColor = '#fbbf24';
        subtextColor = '#f59e0b';
      } else if (preset === 'WOOD_BISTRO') {
        bgColor = '#291e10';
        textColor = '#fef3c7';
        strokeColor = '#d97706';
        subtextColor = '#b45309';
      } else if (preset === 'NEON_CYBER') {
        bgColor = '#020617';
        strokeColor = '#38bdf8';
        subtextColor = '#38bdf8';
      } else if (preset === 'SIMPLE') {
        bgColor = '#ffffff';
        textColor = '#0f172a';
        strokeColor = '#cbd5e1';
        subtextColor = '#64748b';
      }

      const fullSvgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <defs>
    <style>
      .title { font-family: 'Outfit', system-ui, sans-serif; font-weight: 900; font-size: 38px; fill: ${textColor}; text-anchor: middle; text-transform: uppercase; letter-spacing: 1px; }
      .subtitle { font-family: 'Inter', system-ui, sans-serif; font-weight: 500; font-size: 18px; fill: ${subtextColor}; text-anchor: middle; }
      .cta-text { font-family: 'Outfit', system-ui, sans-serif; font-weight: 800; font-size: 22px; fill: #ffffff; text-anchor: middle; letter-spacing: 1px; }
      .table-text { font-family: 'Outfit', system-ui, sans-serif; font-weight: 900; font-size: 56px; fill: ${textColor}; text-anchor: middle; letter-spacing: 2px; }
      .footer-text { font-family: 'Inter', system-ui, sans-serif; font-weight: 500; font-size: 16px; fill: ${subtextColor}; text-anchor: middle; }
    </style>
  </defs>

  <!-- Background Frame -->
  <rect width="${svgWidth}" height="${svgHeight}" rx="48" fill="${bgColor}" stroke="${strokeColor}" stroke-width="12"/>

  <!-- Header Restaurant Name -->
  <text x="300" y="110" class="title">${safeRestName}</text>
  <text x="300" y="145" class="subtitle">TOUCHLESS DIGITAL MENU &amp; ORDERING</text>

  <!-- QR Code Container Box -->
  <rect x="120" y="190" width="360" height="360" rx="32" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
  <g transform="translate(150, 220)">
    ${qrInnerSvg}
  </g>

  <!-- CTA Pill -->
  <rect x="80" y="590" width="440" height="64" rx="32" fill="${preset === 'SIMPLE' ? '#0f172a' : accentColor}"/>
  <text x="300" y="630" class="cta-text">${ctaText.toUpperCase()}</text>

  <!-- Table Number -->
  <text x="300" y="730" class="table-text">${safeTableNum.toUpperCase()}</text>

  <!-- Footer -->
  ${showWifi ? `<text x="300" y="820" class="footer-text">📶 Wi-Fi: ${wifiName} • Powered by Dinely</text>` : ''}
</svg>`;

      const svgBlob = new Blob([fullSvgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.href = svgUrl;
      a.download = `QR_StandCard_${safeTableNum.replace(/\s+/g, '_')}_Vector.svg`;
      a.click();
      URL.revokeObjectURL(svgUrl);
    } catch (err) {
      console.error('Error generating vector SVG standee:', err);
    }
  };

  // Requirement 8: High-Resolution 300 DPI Custom Standee PNG Export
  const handleDownloadCustomCardPNG = async () => {
    setIsDownloading(true);
    try {
      const cardWidth = 1200;
      const cardHeight = 1800;

      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Background & Border Styling based on Preset
      let bgColor = '#0f172a';
      let textColor = '#ffffff';
      let strokeColor = accentColor;
      let subtextColor = '#94a3b8';

      if (preset === 'GOLD_LUXE') {
        bgColor = '#1e1b4b';
        textColor = '#ffffff';
        strokeColor = '#fbbf24';
        subtextColor = '#f59e0b';
      } else if (preset === 'WOOD_BISTRO') {
        bgColor = '#291e10';
        textColor = '#fef3c7';
        strokeColor = '#d97706';
        subtextColor = '#b45309';
      } else if (preset === 'NEON_CYBER') {
        bgColor = '#020617';
        textColor = '#ffffff';
        strokeColor = '#38bdf8';
        subtextColor = '#38bdf8';
      } else if (preset === 'SIMPLE') {
        bgColor = '#ffffff';
        textColor = '#0f172a';
        strokeColor = '#cbd5e1';
        subtextColor = '#64748b';
      }

      // Draw Main Background Card
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(0, 0, cardWidth, cardHeight, 72);
      ctx.fill();

      // Outer Border
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 18;
      ctx.stroke();

      ctx.textAlign = 'center';
      let currentY = 160;

      // 2. Draw Logo Image if enabled
      if (showLogo && restaurantLogo && !logoLoadError) {
        try {
          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          logoImg.src = restaurantLogo;
          await new Promise((resolve) => {
            logoImg.onload = resolve;
            logoImg.onerror = resolve;
          });
          if (logoImg.complete && logoImg.naturalWidth) {
            const logoSize = 130;
            ctx.save();
            ctx.beginPath();
            ctx.roundRect((cardWidth - logoSize) / 2, currentY, logoSize, logoSize, 32);
            ctx.clip();
            ctx.drawImage(logoImg, (cardWidth - logoSize) / 2, currentY, logoSize, logoSize);
            ctx.restore();

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 4;
            ctx.strokeRect((cardWidth - logoSize) / 2, currentY, logoSize, logoSize);

            currentY += 170;
          }
        } catch (e) {
          currentY += 40;
        }
      } else {
        currentY += 60;
      }

      // 3. Draw Header Restaurant Name
      ctx.font = '900 64px "Outfit", sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(safeRestName.toUpperCase(), cardWidth / 2, currentY);
      currentY += 56;

      // Subheader Section
      ctx.font = '600 32px "Inter", sans-serif';
      ctx.fillStyle = subtextColor;
      ctx.fillText('TOUCHLESS MENU & ORDERING', cardWidth / 2, currentY);
      currentY += 60;

      // 4. Draw QR Code Box Container
      const qrBoxSize = 680;
      const qrBoxX = (cardWidth - qrBoxSize) / 2;
      const qrBoxY = currentY;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 48);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 8;
      ctx.stroke();

      // Draw QR Canvas onto the card
      if (qrCanvasRef.current) {
        const qrImage = new Image();
        qrImage.src = qrCanvasRef.current.toDataURL('image/png');
        await new Promise((resolve) => {
          qrImage.onload = resolve;
        });
        const qrSize = 580;
        ctx.drawImage(qrImage, (cardWidth - qrSize) / 2, qrBoxY + 50, qrSize, qrSize);
      }

      currentY = qrBoxY + qrBoxSize + 130;

      // 5. Call To Action Badge Below QR
      ctx.fillStyle = preset === 'SIMPLE' ? '#0f172a' : accentColor;
      ctx.beginPath();
      ctx.roundRect(140, currentY - 60, cardWidth - 280, 110, 55);
      ctx.fill();

      ctx.font = '900 42px "Outfit", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ctaText.toUpperCase(), cardWidth / 2, currentY + 12);
      currentY += 180;

      // 6. Large Table Number Badge
      ctx.font = '900 100px "Outfit", sans-serif';
      ctx.fillStyle = textColor;
      ctx.fillText(safeTableNum.toUpperCase(), cardWidth / 2, currentY);

      // 7. Footer Info
      if (showWifi) {
        ctx.font = '500 32px "Inter", sans-serif';
        ctx.fillStyle = subtextColor;
        ctx.fillText(`📶 Wi-Fi: ${wifiName} • Powered by Dinely`, cardWidth / 2, cardHeight - 110);
      }

      // Download High-Res PNG
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR_StandCard_${safeTableNum.replace(/\s+/g, '_')}_${preset}.png`;
      a.click();
    } catch (err) {
      console.error('Error generating card image:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Requirement 9: Dedicated Print Standee Action
  const handlePrintCard = () => {
    if (!printAreaRef.current) {
      window.print();
      return;
    }
    printQRCodeCard(printAreaRef.current.innerHTML, safeRestName, safeTableNum, preset, accentColor);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-slate-100 font-sans">
      {/* Top Banner: EXACT QR Destination URL & Testing Actions */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-500/30">
              <Globe className="w-4 h-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wide">QR DESTINATION URL</h4>
              <p className="text-[10px] text-slate-400">
                This exact link is encoded inside the QR code below. Scan or test live.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="text-xs font-bold border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
              icon={copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copied ? 'Link Copied!' : 'Copy Link'}
            </Button>

            <Button
              variant="brand"
              size="sm"
              onClick={handleOpenLiveView}
              className="text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open Live View
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800">
          <input
            type="text"
            readOnly
            value={qrUrl}
            className="w-full bg-transparent text-xs font-mono text-sky-300 select-all focus:outline-none tracking-tight"
          />
        </div>
      </div>

      {/* Main Studio Editor: Left (Standee Live Preview) | Right (Customizer & Export) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Premium Tabletop Standee Preview */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-3">
          <div className="flex items-center justify-between w-full max-w-sm px-2 text-xs font-bold text-slate-400">
            <span className="flex items-center gap-1.5 text-rose-400">
              <Eye className="w-4 h-4" /> Standee Live Preview
            </span>
            <Badge variant="outline" className="border-slate-800 font-mono text-[10px]">
              4x6 Portrait
            </Badge>
          </div>

          {/* Standee Visual Card Box */}
          <div
            ref={printAreaRef}
            className="w-full max-w-sm p-8 rounded-[36px] text-center space-y-5 shadow-2xl relative transition-all duration-300 border border-slate-800 shrink-0"
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
                  : preset === 'WOOD_BISTRO'
                  ? '#d97706'
                  : accentColor,
            }}
          >
            {/* Header Branding */}
            <div className="space-y-1">
              {showLogo && restaurantLogo && !logoLoadError ? (
                <img
                  src={restaurantLogo}
                  alt={safeRestName}
                  onError={() => setLogoLoadError(true)}
                  className="w-14 h-14 mx-auto rounded-2xl object-cover border-2 border-white/20 shadow-md mb-2"
                />
              ) : (
                <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-black text-lg flex items-center justify-center mb-2 shadow-inner">
                  {safeRestName.charAt(0)}
                </div>
              )}
              <h3 className="font-black text-xl tracking-tight uppercase font-sans">{safeRestName}</h3>
              <p className="text-[11px] opacity-75 font-mono">TOUCHLESS MENU & ORDERING</p>
            </div>

            {/* QR Code Container Badge */}
            <div className="p-4 bg-white rounded-3xl shadow-xl my-4 border border-slate-200 flex items-center justify-center mx-auto w-56 h-56 sm:w-60 sm:h-60 relative">
              <QRCodeSVG
                id={`qr-svg-${safeTableNum.replace(/\s+/g, '_')}`}
                value={qrUrl}
                size={210}
                level="H"
                marginSize={2}
                bgColor="#ffffff"
                fgColor="#0f172a"
                className="w-full h-full object-contain"
              />
              {/* Hidden Canvas for High-Res PNG Exports */}
              <div className="hidden">
                <QRCodeCanvas
                  ref={qrCanvasRef}
                  value={qrUrl}
                  size={600}
                  level="H"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                />
              </div>
            </div>

            {/* Call to Action Badge */}
            <div
              className="px-5 py-2.5 rounded-full font-black text-xs shadow-md tracking-wider uppercase transition-colors"
              style={{
                backgroundColor: preset === 'SIMPLE' ? '#0f172a' : accentColor,
                color: '#ffffff',
              }}
            >
              {ctaText}
            </div>

            {/* Large Table Number */}
            <div className="pt-1">
              <span className="text-3xl font-black font-sans tracking-tight">{safeTableNum}</span>
            </div>

            {/* Footer Wi-Fi Tag */}
            {showWifi && (
              <p className="text-[10px] opacity-70 mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-1.5 font-mono">
                <Wifi className="w-3.5 h-3.5" /> Wi-Fi: {wifiName} • Touchless Table Service
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Preset Selector, Customizer & Export Tools */}
        <div className="lg:col-span-6 space-y-6">
          {/* Aesthetic Style Selector */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                <Sparkles className="w-4 h-4 text-rose-400" /> Choose Standee Aesthetic
              </h4>
              <span className="text-[10px] font-mono text-slate-400">5 Themes</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-sans">
              <button
                type="button"
                onClick={() => setPreset('ACRYLIC_DARK')}
                className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between ${
                  preset === 'ACRYLIC_DARK'
                    ? 'bg-rose-500/20 border-rose-500 text-white font-bold ring-1 ring-rose-500'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>🖤 Dark Acrylic</span>
                <span className="text-[9px] text-slate-400 mt-1">Modern Luxury</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('GOLD_LUXE')}
                className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between ${
                  preset === 'GOLD_LUXE'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold ring-1 ring-amber-500'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>✨ Gold Luxe</span>
                <span className="text-[9px] text-slate-400 mt-1">Fine Dining</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('WOOD_BISTRO')}
                className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between ${
                  preset === 'WOOD_BISTRO'
                    ? 'bg-amber-900/30 border-amber-600 text-amber-200 font-bold ring-1 ring-amber-600'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>🌿 Wood Bistro</span>
                <span className="text-[9px] text-slate-400 mt-1">Rustic Organic</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('NEON_CYBER')}
                className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between ${
                  preset === 'NEON_CYBER'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold ring-1 ring-cyan-400'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>⚡ Cyber Neon</span>
                <span className="text-[9px] text-slate-400 mt-1">Lounge Vibe</span>
              </button>

              <button
                type="button"
                onClick={() => setPreset('SIMPLE')}
                className={`p-3 rounded-2xl border text-left transition-all text-xs flex flex-col justify-between col-span-2 sm:col-span-2 ${
                  preset === 'SIMPLE'
                    ? 'bg-slate-100 text-slate-900 font-bold border-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>⚪ Minimal Editorial</span>
                <span className="text-[9px] text-slate-400 mt-1">Clean White Printable</span>
              </button>
            </div>
          </div>

          {/* Standee Customizer Controls */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-4 shadow-xl text-xs">
            <h4 className="font-bold text-white flex items-center gap-2 uppercase tracking-wide">
              <Palette className="w-4 h-4 text-rose-400" /> Customization Controls
            </h4>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Call To Action Text
                </label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                  placeholder="SCAN TO ORDER FROM TABLE"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Table Label Display Override
                </label>
                <input
                  type="text"
                  value={customTableLabel}
                  onChange={(e) => setCustomTableLabel(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  placeholder={tableNumber || 'Table 01'}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                  Accent Color Pill
                </label>
                <div className="flex gap-2.5">
                  {['#f43f5e', '#d97706', '#10b981', '#06b6d4', '#8b5cf6', '#0f172a'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setAccentColor(col)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        accentColor === col ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-slate-800/80">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300">Show Restaurant Logo</span>
                  <input
                    type="checkbox"
                    checked={showLogo}
                    onChange={(e) => setShowLogo(e.target.checked)}
                    className="w-4 h-4 accent-rose-500 rounded"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-slate-300">Show Wi-Fi Footer</span>
                  <input
                    type="checkbox"
                    checked={showWifi}
                    onChange={(e) => setShowWifi(e.target.checked)}
                    className="w-4 h-4 accent-rose-500 rounded"
                  />
                </label>
              </div>

              {showWifi && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Wi-Fi Network Name
                  </label>
                  <input
                    type="text"
                    value={wifiName}
                    onChange={(e) => setWifiName(e.target.value)}
                    className="w-full px-3.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-rose-500"
                    placeholder="Guest_Free_WiFi"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Export & Printing Action Hub */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 shadow-xl">
            <h4 className="text-xs font-bold text-white uppercase tracking-wide flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-400" /> Export &amp; Print Options
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Button
                variant="brand"
                className="py-3 text-xs font-bold shadow-lg bg-rose-600 hover:bg-rose-500 text-white"
                onClick={handleDownloadCustomCardPNG}
                disabled={isDownloading}
                icon={<Download className="w-4 h-4" />}
              >
                {isDownloading ? 'Exporting HD PNG...' : 'Download PNG (300 DPI)'}
              </Button>

              <Button
                variant="outline"
                className="py-3 text-xs font-bold border-rose-500/50 text-rose-300 hover:bg-rose-500/10"
                onClick={handlePrintCard}
                icon={<Printer className="w-4 h-4 text-rose-400" />}
              >
                Print Standee Sign
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] border-slate-800 text-slate-300 hover:bg-slate-800"
                onClick={handleDownloadSimpleQR}
                icon={<QrCode className="w-3.5 h-3.5 text-amber-400" />}
              >
                Simple QR Only
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-[11px] border-slate-800 text-slate-300 hover:bg-slate-800"
                onClick={handleDownloadSVG}
                icon={<Layers className="w-3.5 h-3.5 text-sky-400" />}
              >
                Vector SVG (Scalable)
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
