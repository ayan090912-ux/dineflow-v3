import { Bill } from '../types';
import { formatCurrency } from './currency';
import { formatStandardTableNumber } from './tableUtils';

export interface ReceiptOptions {
  legalName?: string;
  gstin?: string;
  pan?: string;
  address?: string;
}

export function downloadDigitalReceiptPNG(
  bill: Bill,
  restaurantName: string = 'Dinely Cloud POS',
  options?: ReceiptOptions
): void {
  const canvas = document.createElement('canvas');
  const width = 640;
  const itemsCount = (bill.items || []).length;
  const taxBreakdownCount = (bill.taxBreakdown || []).length;
  const extraHeaderLines = (options?.gstin || options?.pan || options?.address) ? 30 : 0;
  const height = 820 + itemsCount * 45 + taxBreakdownCount * 22 + extraHeaderLines;

  canvas.width = width * 2; // High-DPI 2x scale
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  ctx.scale(2, 2);

  // Background Gradient (Dark Navy / Slate)
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#090d16');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Outer Border Box
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(16, 16, width - 32, height - 32);

  // Top Brand Header Banner
  ctx.fillStyle = '#10b981';
  ctx.fillRect(16, 16, width - 32, 8);

  // Header Title
  const displayTitle = options?.legalName || restaurantName || 'Dinely Fine Dining';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(displayTitle.toUpperCase(), width / 2, 55);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('OFFICIAL GST TAX INVOICE & DIGITAL RECEIPT', width / 2, 75);

  let headerY = 92;
  if (options?.address) {
    ctx.fillStyle = '#64748b';
    ctx.font = '500 10px Inter, system-ui, sans-serif';
    ctx.fillText(options.address, width / 2, headerY);
    headerY += 15;
  }

  const gstPanParts: string[] = [];
  if (options?.gstin) gstPanParts.push(`GSTIN: ${options.gstin}`);
  if (options?.pan) gstPanParts.push(`PAN: ${options.pan}`);
  if (gstPanParts.length > 0) {
    ctx.fillStyle = '#10b981';
    ctx.font = '700 10px monospace';
    ctx.fillText(gstPanParts.join('  |  '), width / 2, headerY);
    headerY += 15;
  }

  // Divider Line
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, headerY);
  ctx.lineTo(width - 40, headerY);
  ctx.stroke();

  const metaStartY = headerY + 25;

  // Invoice & Table Metadata Grid
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('INVOICE NO', 40, metaStartY);
  ctx.fillText('DATE & TIME', 230, metaStartY);
  ctx.fillText('TABLE & SESSION', 440, metaStartY);

  ctx.fillStyle = '#10b981';
  ctx.font = '700 13px monospace';
  ctx.fillText(bill.invoiceNumber || bill.id || 'INV-1001', 40, metaStartY + 20);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  const dateStr = new Date(bill.createdAt || Date.now()).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  ctx.fillText(dateStr, 230, metaStartY + 20);

  ctx.fillStyle = '#f59e0b';
  const standardTableLabel = formatStandardTableNumber(bill.tableNumber);
  ctx.fillText(`${standardTableLabel} (#${bill.tableSessionId ? String(bill.tableSessionId).slice(-6) : '001'})`, 440, metaStartY + 20);

  // Status & Payment Method Box
  const boxY = metaStartY + 40;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(40, boxY, width - 80, 42);
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(40, boxY, width - 80, 42);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('PAYMENT STATUS:', 55, boxY + 25);
  ctx.fillStyle = bill.paymentStatus === 'PAID' || bill.status === 'CLOSED' ? '#10b981' : '#f59e0b';
  ctx.font = '800 12px Inter, system-ui, sans-serif';
  ctx.fillText(bill.paymentStatus === 'PAID' || bill.status === 'CLOSED' ? '● PAID & VERIFIED' : '○ PAYMENT PENDING', 165, boxY + 25);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('PAYMENT METHOD:', 350, boxY + 25);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  ctx.fillText((bill.paymentMethod || 'UPI / CASH').toUpperCase(), 465, boxY + 25);

  // Itemized Header
  let y = boxY + 65;
  ctx.fillStyle = '#475569';
  ctx.fillRect(40, y, width - 80, 28);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.fillText('ITEM DESCRIPTION', 55, y + 18);
  ctx.textAlign = 'center';
  ctx.fillText('QTY', 380, y + 18);
  ctx.textAlign = 'right';
  ctx.fillText('PRICE (₹)', width - 55, y + 18);

  // Itemized Rows
  y += 35;
  ctx.textAlign = 'left';

  (bill.items || []).forEach((item) => {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.fillText(item.name, 55, y);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13px monospace';
    ctx.fillText(`${item.quantity}x`, 380, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px monospace';
    ctx.fillText(formatCurrency(item.totalPrice), width - 55, y);

    // Dashed line under item
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(40, y + 12);
    ctx.lineTo(width - 40, y + 12);
    ctx.stroke();

    y += 40;
  });

  // Totals Section
  y += 10;
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(40, y);
  ctx.lineTo(width - 40, y);
  ctx.stroke();

  y += 25;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText('Item Subtotal:', 40, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 12px monospace';
  ctx.fillText(formatCurrency(bill.subtotal || 0), width - 40, y);

  if ((bill.discountAmount || 0) > 0) {
    y += 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#10b981';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(`Discount (${bill.discountPercentage || 0}%):`, 40, y);
    ctx.textAlign = 'right';
    ctx.font = '600 12px monospace';
    ctx.fillText(`-${formatCurrency(bill.discountAmount)}`, width - 40, y);
  }

  if ((bill.serviceChargeAmount || 0) > 0) {
    y += 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(`Service Charge (${bill.serviceChargePercentage || 0}%):`, 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 12px monospace';
    ctx.fillText(formatCurrency(bill.serviceChargeAmount), width - 40, y);
  }

  if (bill.taxBreakdown && bill.taxBreakdown.length > 0) {
    bill.taxBreakdown.forEach((t) => {
      y += 22;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      const tName = t.name || t.taxName || 'GST';
      const tRate = t.rate || t.taxRate || 0;
      ctx.fillText(`${tName} (${tRate}%${t.isInclusive ? ' Incl.' : ''}):`, 40, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 12px monospace';
      ctx.fillText(formatCurrency(t.amount || t.taxAmount || 0), width - 40, y);
    });
  } else if ((bill.taxAmount || 0) > 0) {
    y += 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText('GST / Applicable Taxes:', 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 12px monospace';
    ctx.fillText(formatCurrency(bill.taxAmount), width - 40, y);
  }

  if (bill.roundOffAmount && bill.roundOffAmount !== 0) {
    y += 22;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText('Round Off:', 40, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 12px monospace';
    ctx.fillText(formatCurrency(bill.roundOffAmount), width - 40, y);
  }

  // Grand Total Box
  y += 35;
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(40, y - 20, width - 80, 50);
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, y - 20, width - 80, 50);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#a7f3d0';
  ctx.font = '800 15px Inter, system-ui, sans-serif';
  ctx.fillText('GRAND TOTAL:', 60, y + 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#34d399';
  ctx.font = '900 22px monospace';
  ctx.fillText(formatCurrency(bill.grandTotal || 0), width - 60, y + 14);

  // Footer Verification & Compliance Notice
  y += 65;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText('Thank you for dining with us! 🙏', width / 2, y);

  ctx.fillStyle = '#64748b';
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.fillText('Digital GST Tax Invoice • E-invoicing integration not configured (IRN/IRP not applicable)', width / 2, y + 18);
  ctx.fillText('Powered by Dinely Multi-Tenant Restaurant Operating System', width / 2, y + 34);

  // Convert Canvas to Blob and Trigger Download / Native Mobile Share
  const fileName = `Tax_Invoice_${bill.invoiceNumber || bill.id || 'DLY'}_${Date.now()}.png`;

  try {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        // Fallback dataURL
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
    // Ultimate fallback
    const imageURI = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imageURI;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
