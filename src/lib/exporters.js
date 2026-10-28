import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable/es';
import { fmtDate, fmtDateTime, money } from './utils';
import { markRemark, ordinal } from './subjects';

const BRAND = [38, 76, 57];
const ACCENT = [199, 134, 42];

// Standard PDF fonts only cover Latin-1; normalise the few characters we use that fall outside it.
const clean = (v) =>
  String(v ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '');

function drawCrest(doc, x, y, size) {
  doc.setFillColor(...BRAND);
  doc.roundedRect(x, y, size, size, 3, 3, 'F');
  doc.setFillColor(...ACCENT);
  doc.triangle(x + size / 2, y + size * 0.2, x + size * 0.2, y + size * 0.42, x + size * 0.8, y + size * 0.42, 'F');
  doc.rect(x + size * 0.25, y + size * 0.5, size * 0.5, size * 0.28, 'F');
}

function letterhead(doc, school, title, subtitle) {
  const w = doc.internal.pageSize.getWidth();
  const logoSize = 18;
  if (school.logo && /^data:image\/(png|jpe?g)/.test(school.logo)) {
    try {
      doc.addImage(school.logo, school.logo.includes('png') ? 'PNG' : 'JPEG', 14, 10, logoSize, logoSize);
    } catch {
      drawCrest(doc, 14, 10, logoSize);
    }
  } else drawCrest(doc, 14, 10, logoSize);

  // Shrink each letterhead line until it fits the page (A5 receipts are narrow).
  const maxW = w - 36 - 14;
  const fit = (text, size, min) => {
    let s = size;
    doc.setFontSize(s);
    while (s > min && doc.getTextWidth(text) > maxW) doc.setFontSize((s -= 0.5));
    return text;
  };
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.text(fit(clean(school.name).toUpperCase(), 14, 8), 36, 15);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(110);
  doc.text(fit(clean(`"${school.motto}"`), 9, 6), 36, 20);
  doc.setFont('helvetica', 'normal');
  const contact = clean(`${school.address}, ${school.region}  |  Tel: ${school.phone}  |  ${school.email}`);
  fit(contact, 8, 6.5);
  doc.text(doc.splitTextToSize(contact, maxW).slice(0, 2), 36, 24.5);

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.line(14, 31, w - 14, 31);

  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(clean(title), 14, 39);
  let y = 39;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(clean(subtitle), 14, 44);
    y = 44;
  }
  return y + 5;
}

function footer(doc) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140);
    doc.text(clean(`Generated ${fmtDateTime(new Date())} - School Information System`), 14, h - 8);
    doc.text(`Page ${i} of ${pages}`, w - 14, h - 8, { align: 'right' });
  }
}

/**
 * columns: [{ key, label, align?, format?(value,row) }]
 * summary: optional [[label, value], ...] printed under the table
 */
export function exportTablePDF({ school, title, subtitle, columns, rows, summary, filename, landscape }) {
  const doc = new jsPDF({ orientation: landscape || columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const startY = letterhead(doc, school, title, subtitle);
  autoTable(doc, {
    startY,
    head: [columns.map((c) => clean(c.label))],
    body: rows.map((r) => columns.map((c) => clean(c.format ? c.format(r[c.key], r) : r[c.key]))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 245, 238] },
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.align || 'left' }])),
    margin: { left: 14, right: 14, bottom: 16 },
  });
  if (summary?.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      body: summary.map(([k, v]) => [clean(k), clean(v)]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'left' } },
      margin: { left: 14 },
    });
  }
  footer(doc);
  doc.save(`${filename || title}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
}

const xmlEscape = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Excel export as SpreadsheetML (opens natively in Excel, LibreOffice and Google Sheets). */
export function exportExcel({ title, columns, rows, filename, summary }) {
  const cell = (v, style) => {
    const isNum = typeof v === 'number' && Number.isFinite(v);
    return `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEscape(v)}</Data></Cell>`;
  };
  const raw = (c, r) => (c.excel ? c.excel(r[c.key], r) : c.format && typeof r[c.key] !== 'number' ? c.format(r[c.key], r) : r[c.key]);
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
 <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
 <Style ss:ID="head"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#264C39" ss:Pattern="Solid"/></Style>
 <Style ss:ID="bold"><Font ss:Bold="1"/></Style>
</Styles>
<Worksheet ss:Name="${xmlEscape(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))}">
<Table>
${columns.map(() => '<Column ss:Width="120"/>').join('')}
<Row>${cell(title, 'title')}</Row>
<Row/>
<Row>${columns.map((c) => cell(c.label, 'head')).join('')}</Row>
${rows.map((r) => `<Row>${columns.map((c) => cell(raw(c, r))).join('')}</Row>`).join('\n')}
${summary?.length ? `<Row/>${summary.map(([k, v]) => `<Row>${cell(k, 'bold')}${cell(v)}</Row>`).join('')}` : ''}
</Table>
</Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${filename || title}.xls`.replace(/[\\/:*?"<>|]/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function receiptPDF({ school, payment, student, className, term, lines, status, receivedBy }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  let y = letterhead(doc, school, 'OFFICIAL RECEIPT', `Receipt No: ${payment.receiptNo}     Date: ${fmtDate(payment.date)}`);
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 } },
    body: [
      ['Pupil', clean(`${student.firstName} ${student.lastName}`)],
      ['Reg. No', student.regNo],
      ['Class', clean(className)],
      ['Term', clean(term)],
      ['Payment method', clean(payment.methodLabel)],
      ...(payment.reference ? [['Reference', payment.reference]] : []),
    ],
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 3;
  doc.setFillColor(237, 243, 238);
  doc.roundedRect(14, y, w - 28, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text('AMOUNT RECEIVED', 18, y + 6);
  doc.setFontSize(13);
  doc.text(money(payment.amount, school.currency), w - 18, y + 9, { align: 'right' });
  y += 18;
  autoTable(doc, {
    startY: y,
    head: [['Fee item', 'Billed', 'Paid to date', 'Outstanding']],
    body: lines.map((l) => [clean(l.label), money(l.amount, ''), money(l.paid, ''), money(l.outstanding, '')]),
    foot: [['Term totals', money(status.billed, ''), money(status.paid, ''), money(status.balance, '')]],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [236, 232, 222], textColor: 20 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60);
  if (status.arrears > 0) doc.text(clean(`Arrears from previous terms: ${money(status.arrears, school.currency)}`), 14, y), (y += 5);
  doc.text(clean(`Total outstanding: ${money(status.totalDue, school.currency)}`), 14, y);
  y += 14;
  doc.line(w - 64, y, w - 14, y);
  doc.text(clean(`Received by: ${receivedBy}`), w - 64, y + 4);
  doc.setFontSize(7);
  doc.setTextColor(140);
  doc.text('Keep this receipt. Fees once paid are not refundable.', 14, y + 4);
  footer(doc);
  doc.save(`Receipt ${payment.receiptNo}.pdf`);
}

export function payslipPDF({ school, staff, grade, item, month }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  let y = letterhead(doc, school, `PAYSLIP - ${month.toUpperCase()}`, `Staff No: ${staff.staffNo}`);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 245, 238] }, 2: { fontStyle: 'bold', fillColor: [248, 245, 238] } },
    body: [
      ['Name', clean(`${staff.firstName} ${staff.lastName}`), 'Position', clean(staff.position)],
      ['Category', staff.category === 'teaching' ? 'Teaching' : 'Non-teaching', 'Salary scale', clean(grade?.name || '-')],
      ['Payment', clean(item.methodLabel), 'Account', clean(staff.accountNo || staff.momoNumber || '-')],
    ],
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 6;
  const half = (w - 28 - 6) / 2;
  autoTable(doc, {
    startY: y,
    head: [['Earnings', 'Amount']],
    body: [['Basic salary', money(item.basic, '')], ['Housing allowance', money(item.housing, '')], ['Transport allowance', money(item.transport, '')], ['Bonus', money(item.bonus, '')]],
    foot: [['Gross pay', money(item.gross, '')]],
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [236, 232, 222], textColor: 20 },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9 },
    tableWidth: half,
    margin: { left: 14 },
  });
  autoTable(doc, {
    startY: y,
    head: [['Deductions', 'Amount']],
    body: [['CNPS (pension)', money(item.cnps, '')], ['Salary advance', money(item.advance, '')], ['Other deductions', money(item.otherDeductions, '')]],
    foot: [['Total deductions', money(item.cnps + item.advance + item.otherDeductions, '')]],
    headStyles: { fillColor: [147, 52, 42] },
    footStyles: { fillColor: [249, 236, 234], textColor: 20 },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9 },
    tableWidth: half,
    margin: { left: 14 + half + 6 },
  });
  y = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(...BRAND);
  doc.roundedRect(14, y, w - 28, 16, 2, 2, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('NET PAY', 20, y + 10);
  doc.setFontSize(15);
  doc.text(money(item.net, school.currency), w - 20, y + 10.5, { align: 'right' });
  y += 24;
  doc.setTextColor(80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(item.paid ? `Status: PAID on ${fmtDate(item.paidDate)}` : 'Status: PENDING', 14, y);
  y += 22;
  doc.line(14, y, 74, y);
  doc.line(w - 74, y, w - 14, y);
  doc.text('Bursar', 14, y + 5);
  doc.text('Employee', w - 74, y + 5);
  footer(doc);
  doc.save(clean(`Payslip ${staff.lastName} ${staff.firstName} ${month}.pdf`));
}

/**
 * Report cards (bulletins), one A4 page per pupil.
 * cards: [{ student, className, term, record, subjects: [{ name, coef }], teacherName, nextTerm }]
 */
export function reportCardsPDF({ school, cards, filename }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  cards.forEach((c, i) => {
    if (i) doc.addPage();
    const r = c.record;
    let y = letterhead(doc, school, 'REPORT CARD', clean(`${c.term}  |  ${c.className}`));
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.1 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 2: { fontStyle: 'bold', cellWidth: 30 } },
      body: [
        ['Pupil', clean(`${c.student.firstName} ${c.student.otherNames || ''} ${c.student.lastName}`.replace(/\s+/g, ' ')), 'Reg. No', c.student.regNo],
        ['Class', clean(c.className), 'Date of birth', c.student.dob ? fmtDate(c.student.dob) : '-'],
        ['Sex', c.student.gender === 'F' ? 'Female' : 'Male', 'Pupils in class', String(r.outOf || '-')],
      ],
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 3;
    const rows = c.subjects.map((s) => {
      const m = r.marks?.[s.name];
      const has = m !== undefined && m !== null && m !== '';
      return [clean(s.name), String(s.coef), has ? Number(m).toFixed(2) : '-', has ? (Number(m) * s.coef).toFixed(2) : '-', has ? markRemark(Number(m)) : ''];
    });
    const done = c.subjects.filter((s) => r.marks?.[s.name] !== undefined && r.marks?.[s.name] !== '' && r.marks?.[s.name] !== null);
    const coefs = done.reduce((t, s) => t + Number(s.coef), 0);
    const total = done.reduce((t, s) => t + Number(r.marks[s.name]) * Number(s.coef), 0);
    autoTable(doc, {
      startY: y,
      head: [['Subject', 'Coef', 'Mark /20', 'Mark x Coef', 'Remark']],
      body: rows,
      foot: [['Total', String(coefs), '', total.toFixed(2), '']],
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: BRAND },
      footStyles: { fillColor: [236, 232, 222], textColor: 20 },
      columnStyles: { 1: { halign: 'center', cellWidth: 16 }, 2: { halign: 'right', cellWidth: 24 }, 3: { halign: 'right', cellWidth: 28 }, 4: { cellWidth: 34 } },
      // Keep the totals row aligned with the columns above it.
      didParseCell: (d) => { if (d.section === 'foot') d.cell.styles.halign = d.column.index === 1 ? 'center' : d.column.index >= 2 && d.column.index <= 3 ? 'right' : 'left'; },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Result box: average and position stand out.
    doc.setFillColor(237, 243, 238);
    doc.roundedRect(14, y, w - 28, 18, 2, 2, 'F');
    doc.setTextColor(...BRAND);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TERM AVERAGE', 20, y + 6);
    doc.text('POSITION', w / 2 - 10, y + 6);
    doc.setFontSize(15);
    doc.text(r.average != null ? `${Number(r.average).toFixed(2)} / 20` : '-', 20, y + 14);
    doc.text(r.position ? `${ordinal(r.position)} of ${r.outOf}` : '-', w / 2 - 10, y + 14);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const stats = [`Class average: ${r.classAverage != null ? Number(r.classAverage).toFixed(2) : '-'}`, `Highest: ${r.highest != null ? Number(r.highest).toFixed(2) : '-'}`, `Lowest: ${r.lowest != null ? Number(r.lowest).toFixed(2) : '-'}`];
    stats.forEach((t, k) => doc.text(t, w - 20, y + 5 + k * 4.5, { align: 'right' }));
    y += 24;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 1.8, lineColor: [220, 214, 200] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
      body: [
        ['Attendance', r.attendance != null ? `${r.attendance} of ${r.daysOpen || '-'} days present` : '-'],
        ['Conduct', clean(r.conduct || '-')],
        ["Class teacher's remark", clean(r.remark || '')],
        ...(c.nextTerm ? [['Next term begins', fmtDate(c.nextTerm)]] : []),
      ],
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 22;
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    const sig = [['Class teacher', c.teacherName || ''], ['Head teacher', ''], ['Parent / Guardian', '']];
    const colW = (w - 28) / 3;
    sig.forEach(([label, name], k) => {
      const x = 14 + k * colW;
      doc.line(x + 2, y, x + colW - 6, y);
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(clean(label), x + 2, y + 4);
      if (name) doc.text(clean(name), x + 2, y + 8);
    });
  });
  footer(doc);
  doc.save(`${clean(filename || 'Report cards')}.pdf`.replace(/[\/:*?"<>|]/g, '-'));
}
