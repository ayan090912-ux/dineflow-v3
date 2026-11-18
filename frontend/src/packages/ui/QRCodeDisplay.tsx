import React, { useState, useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { api } from '../api/client';
import { getRestaurantCustomerUrl } from '../utils/tenantResolver';
import {
  Printer,
  Copy,
  Check,
  ExternalLink,
  Download,
  Store,
  Sparkles,
} from 'lucide-react';
import { Button } from './Button';

export interface QRCodeDisplayProps {
  url?: string;
  value?: string;
  tableId?: string;
  tableNumber?: string;
  restaurantName?: string;
  restaurantLogo?: string;
  restaurantId?: string;
  section?: string;
  capacity?: number;
  size?: number;
  isPickup?: boolean;
  compact?: boolean;
}

export const printQRCodeCard = (
  printContainerHtml: string,
  restaurantName: string = 'Restaurant',
  tableNumber: string = 'Table'
) => {
  const printWin = window.open('', '_blank', 'width=750,height=950');
  if (!printWin) {
    window.print();
    return;
  }

  printWin.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR Standee - ${restaurantName} (${tableNumber})</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .printable-card-wrapper {
            width: 380px;
            padding: 40px 32px;
            border-radius: 36px;
            text-align: center;
            background-color: #0c0e14 !important;
            color: #ffffff !important;
            border: 2px solid rgba(255, 255, 255, 0.15) !important;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35);
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
            .printable-card-wrapper {
              box-shadow: none !important;
              margin: 40px auto !important;
              page-break-inside: avoid;
            }
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
            }, 400);
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
  tableId,
  tableNumber,
  restaurantName,
  restaurantLogo,
  restaurantId,
  section,
  capacity,
  size = 200,
  isPickup = false,
  compact = false,
}) => {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Sanitize destination URL
  const sanitizeQrUrl = (inputUrl?: string): string => {
    if (!inputUrl) return '';
    try {
      if (inputUrl.includes('.dinely.app')) {
        const parsed = new URL(inputUrl);
        const sub = parsed.hostname.replace('.dinely.app', '').trim();
        if (sub && sub !== 'www' && sub !== 'app') {
          return `https://${sub}.dinely.food${parsed.pathname}${parsed.search}`;
        }
      }
      if (inputUrl.includes('dinely.food/customer?tenant=') || inputUrl.includes('dinely.food/customer?')) {
        const parsed = new URL(inputUrl);
        const tenant = parsed.searchParams.get('tenant') || parsed.searchParams.get('restaurant_slug');
        if (tenant) {
          parsed.searchParams.delete('tenant');
          parsed.searchParams.delete('restaurant_slug');
          const qs = parsed.searchParams.toString();
          return `https://${tenant}.dinely.food/customer${qs ? `?${qs}` : ''}`;
        }
      }
    } catch {
      // ignore
    }
    return inputUrl;
  };

  const currentRestId = restaurantId || api.getCurrentRestaurantId();
  const defaultUrl = getRestaurantCustomerUrl(currentRestId, tableNumber || 'Table 01', tableId);
  const rawUrl = sanitizeQrUrl(url || value);
  const qrUrl = rawUrl || defaultUrl;

  const safeRestName = restaurantName || 'Dinely Restaurant';
  const safeTableNum = tableNumber || (isPickup ? 'COUNTER PICKUP' : 'Table 01');

  // Compact fallback mode
  if (compact || (!tableNumber && !url && Boolean(value))) {
    return (
      <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-md w-full h-full">
        <QRCodeSVG
          value={qrUrl}
          size={size || 144}
          level="M"
          className="w-auto h-auto max-w-full max-h-full object-contain"
        />
      </div>
    );
  }

  // Print Action
  const handlePrint = () => {
    if (!cardRef.current) {
      window.print();
      return;
    }
    printQRCodeCard(cardRef.current.innerHTML, safeRestName, safeTableNum);
  };

  // Copy Link Action
  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download High-Res PNG
  const handleDownloadPNG = () => {
    if (!qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR_${safeTableNum.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  return (
    <div className="space-y-5 max-w-md mx-auto text-slate-100 font-sans">
      {/* Hidden Canvas for High-Resolution PNG Download */}
      <div className="hidden">
        <QRCodeCanvas
          ref={qrCanvasRef}
          value={qrUrl}
          size={800}
          level="H"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#0f172a"
        />
      </div>

      {/* 1. Sleek, Premium Printable Standee Card */}
      <div
        ref={cardRef}
        className="w-full rounded-[32px] bg-[#0c0e14] border-2 border-white/[0.12] p-7 text-center space-y-4 shadow-2xl relative overflow-hidden backdrop-blur-xl"
      >
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-emerald-500/10 blur-[60px] pointer-events-none" />

        {/* Restaurant Emblem & Name */}
        <div className="space-y-2 relative z-10">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#141721] border border-white/15 p-1 shadow-lg flex items-center justify-center overflow-hidden">
            {restaurantLogo ? (
              <img src={restaurantLogo} alt={safeRestName} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <Store className="w-6 h-6 text-emerald-400" />
            )}
          </div>

          <div>
            <h3 className="font-extrabold text-base tracking-tight uppercase text-white font-sans">
              {safeRestName}
            </h3>
            <p className="text-[11px] font-mono text-slate-400 mt-0.5 tracking-wider uppercase">
              Touchless Menu & Ordering
            </p>
          </div>
        </div>

        {/* High-Contrast Crisp White QR Card */}
        <div className="w-56 h-56 bg-white p-3.5 rounded-3xl mx-auto shadow-2xl flex items-center justify-center border border-white/20 relative z-10 transition-transform hover:scale-[1.01]">
          <QRCodeSVG
            value={qrUrl}
            size={195}
            level="H"
            marginSize={1}
            bgColor="#ffffff"
            fgColor="#0c0e14"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Scan Pill Button */}
        <div className="relative z-10 pt-1">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold uppercase tracking-wider shadow-sm">
            <span>●</span> SCAN TO ORDER
          </div>
        </div>

        {/* Large Table Number Badge */}
        <div className="relative z-10 pt-0.5">
          <div className="text-2xl font-black text-white font-sans tracking-tight">
            {safeTableNum}
          </div>
          <p className="text-[10px] font-mono text-slate-400 mt-1">
            Scan with any Camera or UPI App · Instant Digital Service
          </p>
        </div>
      </div>

      {/* 2. Single Primary Print Action (Apple-inspired bold, clean button) */}
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={handlePrint}
          className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-950/50 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4 text-slate-950 stroke-[2.5]" />
          <span>Print QR Standee</span>
        </button>

        {/* Subtle Quick Link & Secondary Actions */}
        <div className="flex items-center justify-between gap-2 p-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-xs">
          <input
            type="text"
            readOnly
            value={qrUrl}
            className="flex-1 bg-transparent text-[11px] font-mono text-slate-400 truncate px-2 select-all focus:outline-none"
          />

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-medium flex items-center gap-1 transition-all"
              title="Copy customer ordering URL"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-300" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadPNG}
              className="p-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition-all"
              title="Download high-resolution PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <a
              href={qrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 transition-all"
              title="Open menu in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
