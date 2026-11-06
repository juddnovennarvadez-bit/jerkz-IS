const reportHeaders = [
  "Item No.",
  "Item",
  "Part No.",
  "Brand",
  "Category",
  "Location",
  "Quantity",
  "Stock Status",
  "Machine",
];
const lowStockThreshold = 5;

function getQuantity(item) {
  return Array.isArray(item.stock)
    ? item.stock.reduce(
        (total, stock) => total + (Number(stock.quantity) || 0),
        0,
      )
    : 0;
}

function getText(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}

function getCategory(item) {
  return typeof item.category === "string"
    ? item.category
    : getText(item.category?.name);
}

function getLocations(item) {
  return Array.isArray(item.stock)
    ? [
        ...new Set(
          item.stock
            .map((stock) => getText(stock?.location).trim())
            .filter(Boolean),
        ),
      ].join(", ")
    : "";
}

function getMachineNames(item) {
  const machines = Array.isArray(item.machines)
    ? item.machines
    : Array.isArray(item.machine)
      ? item.machine
      : item.machine
        ? [item.machine]
        : [];
  return machines
    .map((machine) =>
      typeof machine === "string"
        ? machine
        : getText(machine?.number || machine?.name),
    )
    .filter(Boolean)
    .join(", ");
}

function getStockStatus(item) {
  const quantity = getQuantity(item);
  if (quantity <= 0) return "Out of stock";
  if (quantity <= lowStockThreshold) return "Low stock";
  return "In stock";
}

export function getInventoryExportRows(items) {
  return items.map((item) => [
    getText(item.itemNo),
    getText(item.name),
    getText(item.code),
    getText(item.brand),
    getCategory(item),
    getLocations(item),
    getQuantity(item),
    getStockStatus(item),
    getMachineNames(item),
  ]);
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportInventoryExcel(items) {
  const XLSX = await import("@e965/xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([
    reportHeaders,
    ...getInventoryExportRows(items),
  ]);
  worksheet["!cols"] = [14, 30, 18, 18, 20, 26, 12, 18, 24].map((wch) => ({
    wch,
  }));
  worksheet["!autofilter"] = { ref: `A1:I${items.length + 1}` };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(
    `jerks-inventory-${fileDate()}.xlsx`,
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
}

export async function exportInventoryPdf(items) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ orientation: "landscape" });
  document.setFontSize(16);
  document.text("Inventory Report", 14, 16);
  document.setFontSize(9);
  document.text(
    `Generated ${new Date().toLocaleString()} · ${items.length} items`,
    14,
    22,
  );
  autoTable(document, {
    head: [reportHeaders],
    body: getInventoryExportRows(items).map((row) => row.map(String)),
    startY: 28,
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [0, 118, 232] },
    margin: { left: 10, right: 10 },
    didDrawPage: (data) => {
      document.setFontSize(8);
      document.text(
        `Page ${data.pageNumber}`,
        document.internal.pageSize.getWidth() - 18,
        document.internal.pageSize.getHeight() - 6,
        { align: "right" },
      );
    },
  });
  downloadBlob(
    `jerks-inventory-${fileDate()}.pdf`,
    document.output("blob"),
  );
}
