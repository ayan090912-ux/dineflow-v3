import { Bill } from '../types';
import { formatCurrency } from './currency';
import { formatStandardTableNumber } from './tableUtils';

export interface ReceiptOptions {
  legalName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  qrDataUrl?: string;
  upiId?: string;
  paymentQrPayload?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

export async function downloadDigitalReceiptPNG(
  bill: Bill,
  restaurantName: string = 'Dinely Cloud POS',
  options?: ReceiptOptions
): Promise<void> {
  const canvas = document.createElement('canvas');
  const width = 620;
  const items = bill.items || [];
  const taxBreakdown = bill.taxBreakdown || [];

  // Calculate exact dynamic height (no QR code)
  let calcY = 56; // Top padding + brand title
  calcY += 22; // Subtitle
  if (options?.address) calcY += 18;
  if (options?.gstin || options?.pan) calcY += 18;
  calcY += 24; // Divider gap
  calcY += 68; // Metadata grid
  calcY += 56; // Payment status pill bar
  calcY += 44; // Items table header
  calcY += Math.max(1, items.length) * 44; // Item rows
  calcY += 26; // Subtotal divider + subtotal row
  if ((bill.discountAmount || 0) > 0) calcY += 24;
  if ((bill.serviceChargeAmount || 0) > 0) calcY += 24;
  if (taxBreakdown.length > 0) {
    calcY += taxBreakdown.length * 24;
  } else if ((bill.taxAmount || 0) > 0) {
    calcY += 24;
  }
  if (bill.roundOffAmount && bill.roundOffAmount !== 0) calcY += 24;
  calcY += 76; // Grand total box
  calcY += 84; // Clean footer
  const height = Math.max(540, calcY);

  canvas.width = width * 2; // High-DPI 2x scale
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(2, 2);

  // Clean Warm-White Paper Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle Outer Hairline Frame
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 16, 16, width - 32, height - 32, 16);
  ctx.stroke();

  // Top Minimal Accent Bar
  ctx.fillStyle = '#0f172a';
  drawRoundedRect(ctx, 16, 16, width - 32, 6, 3);
  ctx.fill();

  // Header Title
  const displayTitle = options?.legalName || restaurantName || 'Restaurant';
  let y = 58;
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 22px Inter, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(displayTitle.toUpperCase(), width / 2, y);

  y += 20;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 10px Inter, system-ui, -apple-system, sans-serif';
  ctx.fillText('TAX INVOICE  •  DIGITAL RECEIPT', width / 2, y);

  if (options?.address) {
    y += 18;
    ctx.fillStyle = '#64748b';
    ctx.font = '500 11px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillText(truncateText(ctx, options.address, width - 100), width / 2, y);
  }

  const gstPanParts: string[] = [];
  if (options?.gstin) gstPanParts.push(`GSTIN: ${options.gstin}`);
  if (options?.pan) gstPanParts.push(`PAN: ${options.pan}`);
  if (gstPanParts.length > 0) {
    y += 18;
    ctx.fillStyle = '#334155';
    ctx.font = '600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(gstPanParts.join('   |   '), width / 2, y);
  }

  // Divider Line
  y += 22;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(width - 40, y);
  ctx.stroke();

  // Invoice & Table Metadata Card
  y += 18;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 40, y, width - 80, 56, 10);
  ctx.fill();
  ctx.stroke();

  const col1X = 56;
  const col2X = 240;
  const col3X = width - 56;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 9.5px Inter, system-ui, sans-serif';
  ctx.fillText('INVOICE NO', col1X, y + 20);
  ctx.fillText('DATE & TIME', col2X, y + 20);
  ctx.textAlign = 'right';
  ctx.fillText('TABLE', col3X, y + 20);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(bill.invoiceNumber || bill.id || 'INV-1001', col1X, y + 40);

  ctx.font = '600 12px Inter, system-ui, sans-serif';
  const dateStr = new Date(bill.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  ctx.fillText(dateStr, col2X, y + 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 12.5px Inter, system-ui, sans-serif';
  const standardTableLabel = formatStandardTableNumber(bill.tableNumber);
  ctx.fillText(standardTableLabel, col3X, y + 40);

  // Payment Status & Method Strip
  y += 70;
  const isPaid = bill.paymentStatus === 'PAID' || bill.status === 'CLOSED';
  ctx.fillStyle = isPaid ? '#ecfdf5' : '#fffbeb';
  ctx.strokeStyle = isPaid ? '#a7f3d0' : '#fde68a';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 40, y, width - 80, 38, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = isPaid ? '#047857' : '#b45309';
  ctx.font = '700 11.5px Inter, system-ui, sans-serif';
  ctx.fillText(isPaid ? '●  PAID & VERIFIED' : '○  PAYMENT PENDING', 56, y + 23);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#475569';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  const methodLabel = (bill.paymentMethod || 'CASH / UPI').toUpperCase();
  ctx.fillText(`METHOD: ${methodLabel}`, width - 56, y + 23);

  // Itemized Table Header
  y += 56;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillText('ITEM DESCRIPTION', 40, y);
  ctx.textAlign = 'center';
  ctx.fillText('QTY', 400, y);
  ctx.textAlign = 'right';
  ctx.fillText('AMOUNT', width - 40, y);

  y += 10;
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(width - 40, y);
  ctx.stroke();

  // Itemized Rows
  y += 28;
  items.forEach((item, idx) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(truncateText(ctx, item.name || 'Item', 310), 40, y);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`${item.quantity}x`, 400, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatCurrency(item.totalPrice), width - 40, y);

    if (idx < items.length - 1) {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, y + 14);
      ctx.lineTo(width - 40, y + 14);
      ctx.stroke();
    }

    y += 42;
  });

  // Totals Divider
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, y - 14);
  ctx.lineTo(width - 40, y - 14);
  ctx.stroke();

  // Subtotal
  y += 10;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#475569';
  ctx.font = '500 12.5px Inter, system-ui, sans-serif';
  ctx.fillText('Subtotal', 40, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatCurrency(bill.subtotal || 0), width - 40, y);

  if ((bill.discountAmount || 0) > 0) {
    y += 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#059669';
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    ctx.fillText(`Discount (${bill.discountPercentage || 0}%)`, 40, y);
    ctx.textAlign = 'right';
    ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`-${formatCurrency(bill.discountAmount)}`, width - 40, y);
  }

  if ((bill.serviceChargeAmount || 0) > 0) {
    y += 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    ctx.fillText(`Service Charge (${bill.serviceChargePercentage || 0}%)`, 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatCurrency(bill.serviceChargeAmount), width - 40, y);
  }

  if (taxBreakdown.length > 0) {
    taxBreakdown.forEach((t) => {
      y += 24;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = '500 12.5px Inter, system-ui, sans-serif';
      const tName = t.name || t.taxName || 'GST';
      const tRate = t.rate || t.taxRate || 0;
      ctx.fillText(`${tName} (${tRate}%${t.isInclusive ? ' Incl.' : ''})`, 40, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(formatCurrency(t.amount || t.taxAmount || 0), width - 40, y);
    });
  } else if ((bill.taxAmount || 0) > 0) {
    y += 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    ctx.fillText('GST / Applicable Taxes', 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatCurrency(bill.taxAmount), width - 40, y);
  }

  if (bill.roundOffAmount && bill.roundOffAmount !== 0) {
    y += 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '500 12.5px Inter, system-ui, sans-serif';
    ctx.fillText('Round Off', 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatCurrency(bill.roundOffAmount), width - 40, y);
  }

  // Grand Total Card
  y += 22;
  ctx.fillStyle = '#0f172a';
  drawRoundedRect(ctx, 40, y, width - 80, 52, 10);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 13px Inter, system-ui, sans-serif';
  ctx.fillText('TOTAL PAYABLE', 58, y + 31);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#34d399';
  ctx.font = '800 20px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatCurrency(bill.grandTotal || 0), width - 58, y + 33);

  // Clean Footer
  y += 80;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#334155';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText('Thank you for dining with us!', width / 2, y);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.fillText('Powered by Dinely', width / 2, y + 18);

  // Convert Canvas to Blob and Trigger Download / Native Mobile Share
  const fileName = `Tax_Invoice_${bill.invoiceNumber || bill.id || 'DLY'}_${Date.now()}.png`;

  try {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        const imageURI = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = imageURI;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 1. Native Mobile Share Sheet (iOS Safari / Android Chrome)
      if (typeof navigator !== 'undefined' && navigator.canShare) {
        try {
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `Tax Invoice — ${restaurantName}`,
              text: `Tax Invoice ${bill.invoiceNumber || bill.id} for Table ${bill.tableNumber} • Total: ${formatCurrency(bill.grandTotal || 0)}`,
              files: [file],
            });
            return;
          }
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          console.warn('Native share fallback to download link:', err);
        }
      }

      // 2. Standard Blob Object URL Download
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 2000);
    }, 'image/png');
  } catch (e) {
    console.error('Failed to download digital receipt:', e);
    const imageURI = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imageURI;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
