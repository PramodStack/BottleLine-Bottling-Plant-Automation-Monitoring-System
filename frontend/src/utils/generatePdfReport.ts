import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PdfReportData {
  summary: {
    total_bottles: number;
    accepted_bottles: number;
    rejected_bottles: number;
    total_box_packed: number;
    pass_rate?: number;
    reject_rate?: number;
  };
  batch?: {
    batch_number: string;
    target_quantity: number;
    produced_quantity: number;
    batch_status: string;
  };
  logs?: Array<{
    id: number;
    bottle_number: number;
    weight_status: string;
    cap_status: string;
    inspection_status: string;
    created_at: string;
  }>;
}

export function generatePlantReportPdf(data: PdfReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const total = Number(data.summary.total_bottles || 0);
  const accepted = Number(data.summary.accepted_bottles || 0);
  const rejected = Number(data.summary.rejected_bottles || 0);
  const boxes = Number(data.summary.total_box_packed || 0);

  const passRate = total > 0 ? ((accepted / total) * 100).toFixed(1) : '100.0';
  const rejectRate = total > 0 ? ((rejected / total) * 100).toFixed(1) : '0.0';

  // ═══════════════════ HEADER ═══════════════════
  // Industrial Blue Header Banner
  doc.setFillColor(20, 45, 75); // Dark Industrial Navy
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('BOTTLING PLANT PRODUCTION REPORT', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 220, 240);
  doc.text('SCADA & Telemetry Audit • Shift Operational Summary', 14, 18);

  // Generation timestamp on right
  doc.setFontSize(8);
  doc.text(`Generated: ${dateStr} ${timeStr}`, pageWidth - 14, 12, { align: 'right' });
  doc.text('System: Bottling Plant Telemetry', pageWidth - 14, 18, { align: 'right' });

  // ═══════════════════ KPI SECTION ═══════════════════
  let currentY = 36;
  doc.setTextColor(20, 35, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. Production Summary Metrics', 14, currentY);

  currentY += 4;
  const kpiCardWidth = (pageWidth - 28 - 9) / 4;
  const kpis = [
    { label: 'TOTAL BOTTLES', value: String(total), sub: 'Cumulative Units', color: [24, 70, 120] },
    { label: 'ACCEPTED (PASS)', value: String(accepted), sub: `${passRate}% Acceptance`, color: [16, 120, 60] },
    { label: 'REJECTED (DEFECT)', value: String(rejected), sub: `${rejectRate}% Rejection`, color: [180, 40, 40] },
    { label: 'BOXES PACKED', value: String(boxes), sub: '3 Bottles / Box', color: [160, 120, 20] },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = 14 + idx * (kpiCardWidth + 3);
    // Background
    doc.setFillColor(245, 248, 252);
    doc.setDrawColor(215, 228, 242);
    doc.roundedRect(cardX, currentY, kpiCardWidth, 20, 2, 2, 'FD');

    // Accent line on left of card
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(cardX, currentY, 1.5, 20, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 115, 135);
    doc.text(kpi.label, cardX + 4, currentY + 5);

    // Value
    doc.setFontSize(13);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, cardX + 4, currentY + 13);

    // Subtext
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(110, 125, 140);
    doc.text(kpi.sub, cardX + 4, currentY + 17.5);
  });

  currentY += 27;

  // ═══════════════════ BATCH SPECIFICATIONS ═══════════════════
  doc.setTextColor(20, 35, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. Active Production Batch Telemetry', 14, currentY);

  currentY += 3;
  const batch = data.batch || {
    batch_number: 'BATCH-001',
    target_quantity: 0,
    produced_quantity: total,
    batch_status: 'In Progress',
  };

  const targetNum = Number(batch.target_quantity) || 0;
  const batchProgress =
    targetNum > 0
      ? ((batch.produced_quantity / targetNum) * 100).toFixed(1) + '%'
      : 'Continuous';

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['Batch ID', 'Target Units', 'Actual Produced', 'Completion Rate', 'Batch Status']],
    body: [
      [
        batch.batch_number,
        targetNum > 0 ? `${targetNum} units` : 'Continuous Run',
        `${batch.produced_quantity} units`,
        batchProgress,
        batch.batch_status,
      ],
    ],
    theme: 'plain',
    headStyles: {
      fillColor: [230, 240, 250],
      textColor: [20, 45, 75],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 40, 55],
    },
    tableLineColor: [215, 228, 242],
    tableLineWidth: 0.2,
  });

  currentY = (doc as any).lastAutoTable.finalY + 9;

  // ═══════════════════ PRODUCTION LOG RECORDS ═══════════════════
  doc.setTextColor(20, 35, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('3. Sequential Bottle Inspection Log', 14, currentY);

  currentY += 3;
  const logs = data.logs || [];
  const logRows = logs.slice(0, 100).map((l, index) => [
    String(index + 1),
    `Bottle #${l.bottle_number}`,
    l.weight_status || 'OK',
    l.cap_status || 'Capped',
    l.inspection_status || 'Passed',
    l.created_at || 'Recorded',
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14, bottom: 15 },
    head: [['#', 'Bottle Identifier', 'Weight Status', 'Cap Inspection', 'Final Result', 'Timestamp']],
    body: logRows.length > 0 ? logRows : [['-', 'No bottle logs available', '-', '-', '-', '-']],
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: {
      fillColor: [24, 52, 88],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 253],
    },
    didParseCell: (hookData) => {
      // Highlight Passed / Rejected
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const val = String(hookData.cell.raw).toLowerCase();
        if (val === 'passed') {
          hookData.cell.styles.textColor = [16, 120, 60];
          hookData.cell.styles.fontStyle = 'bold';
        } else if (val === 'rejected') {
          hookData.cell.styles.textColor = [190, 30, 30];
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
      if (hookData.section === 'body' && hookData.column.index === 2) {
        const val = String(hookData.cell.raw).toLowerCase();
        if (val.includes('low')) {
          hookData.cell.styles.textColor = [190, 30, 30];
        }
      }
    },
  });

  // ═══════════════════ FOOTER & PAGE NUMBERS ═══════════════════
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(215, 228, 242);
    doc.line(14, pageHeight - 10, pageWidth - 14, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 135, 150);
    doc.text('Bottling Plant Analytics • Official SCADA Compliance Audit', 14, pageHeight - 6);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  // Save the PDF
  const filename = `Bottling_Plant_Production_Report_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
