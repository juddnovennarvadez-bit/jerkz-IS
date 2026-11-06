export const INVENTORY_BACKUP_FORMAT = "jerks-inventory-backup";
export const INVENTORY_BACKUP_VERSION = 1;

export const INVENTORY_CSV_HEADERS = [
  "itemNo",
  "code",
  "name",
  "category",
  "brand",
  "specification",
  "description",
  "location",
  "quantity",
];

function csvEscape(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function csvRow(values) {
  return values.map(csvEscape).join(",");
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("The CSV file has an unclosed quoted field.");
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function unescapeSpreadsheetValue(value) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function itemFieldsMatch(first, next) {
  return [
    "code",
    "name",
    "category",
    "brand",
    "specification",
    "description",
  ].every((field) => first[field] === next[field]);
}

export function createInventoryCsv(items) {
  const rows = [csvRow(INVENTORY_CSV_HEADERS)];
  for (const item of items) {
    const stockEntries =
      Array.isArray(item.stock) && item.stock.length > 0
        ? item.stock
        : [{ location: "", quantity: 0 }];
    for (const stock of stockEntries) {
      rows.push(
        csvRow([
          item.itemNo,
          item.code,
          item.name,
          typeof item.category === "string" ? item.category : item.category?.name,
          item.brand,
          item.specification,
          item.description,
          stock.location,
          Number(stock.quantity) || 0,
        ]),
      );
    }
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function createInventoryCsvTemplate() {
  return `\uFEFF${csvRow(INVENTORY_CSV_HEADERS)}\r\n${csvRow([
    "",
    "",
    "Example item",
    "",
    "",
    "",
    "",
    "Main storage",
    "0",
  ])}\r\n`;
}

export function parseInventoryCsv(text) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) {
    throw new Error("The CSV must include the header and at least one item row.");
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const missingHeaders = INVENTORY_CSV_HEADERS.filter(
    (header) => !headerIndexes.has(header),
  );
  if (missingHeaders.length > 0) {
    throw new Error(
      `The CSV is missing required columns: ${missingHeaders.join(", ")}.`,
    );
  }
  if (headerIndexes.size !== headers.length) {
    throw new Error("The CSV contains duplicate column names.");
  }

  const items = [];
  const itemsByNumber = new Map();
  for (const [index, row] of rows.slice(1).entries()) {
    const lineNumber = index + 2;
    if (row.length > headers.length) {
      throw new Error(`CSV row ${lineNumber} has more values than the header.`);
    }
    const getValue = (header) =>
      unescapeSpreadsheetValue(
        String(row[headerIndexes.get(header)] || "").trim(),
      );
    const itemNo = getValue("itemNo");
    const quantityText = getValue("quantity");
    const quantity = Number(quantityText);
    if (!getValue("name")) {
      throw new Error(`CSV row ${lineNumber} needs an item name.`);
    }
    if (
      quantityText === "" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    ) {
      throw new Error(
        `CSV row ${lineNumber} needs a whole-number quantity of zero or more.`,
      );
    }

    const fields = {
      itemNo,
      code: getValue("code"),
      name: getValue("name"),
      category: getValue("category"),
      brand: getValue("brand"),
      specification: getValue("specification"),
      description: getValue("description"),
      stock: [
        {
          number: "1",
          quantity,
          dateAdded: new Date().toISOString(),
          location: getValue("location"),
        },
      ],
    };

    if (!itemNo) {
      items.push(fields);
      continue;
    }
    const key = itemNo.toLowerCase();
    const existing = itemsByNumber.get(key);
    if (existing) {
      if (!itemFieldsMatch(existing, fields)) {
        throw new Error(
          `CSV rows for item ${itemNo} must use the same item details.`,
        );
      }
      existing.stock.push({
        ...fields.stock[0],
        number: String(existing.stock.length + 1),
      });
    } else {
      itemsByNumber.set(key, fields);
      items.push(fields);
    }
  }

  const seenNumbers = new Set();
  for (const item of items) {
    if (!item.itemNo) continue;
    const key = item.itemNo.toLowerCase();
    if (seenNumbers.has(key)) {
      throw new Error(`Item number ${item.itemNo} appears more than once.`);
    }
    seenNumbers.add(key);
  }
  return items;
}

export function isInventoryBackup(value) {
  return (
    value?.format === INVENTORY_BACKUP_FORMAT &&
    value?.version === INVENTORY_BACKUP_VERSION &&
    value.data &&
    Array.isArray(value.data.items) &&
    Array.isArray(value.data.categories) &&
    Array.isArray(value.data.transactions)
  );
}
