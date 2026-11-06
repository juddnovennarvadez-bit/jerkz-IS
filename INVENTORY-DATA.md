# Inventory data export and import

Open **Data Management** from the main navigation to:

- Export or restore a full-system **JSON** backup. It includes inventory items,
  categories, machines, and transaction history. Restoring replaces those
  records with the contents of the backup. Staff accounts and sign-in
  credentials are managed by Firebase and are not included.
- Download a CSV template, export inventory items as CSV, or replace inventory
  items from a CSV file. CSV imports keep existing categories, machines, and
  transaction history, and add any categories used by the imported items.
  If an imported item number matches an existing item, its image and machine
  assignments are retained.
- Clear all inventory items after exporting a full-system backup for the
  current data. Clearing leaves categories, machines, and transaction history
  unchanged.

  On the **Inventory** page, filter items by search text, category, stock status,
  storage location, or assigned machine. Choose **Filtered results** or **Full
  inventory** in the export controls, then save an Excel workbook (`.xlsx`) or PDF
  report (`.pdf`). Filtered exports use every matching
  item, not only the rows visible on the current table page. Low stock uses the
  same threshold as the dashboard: 1–5 units; out of stock is 0 and in stock is
  more than 5.

  ## CSV format

The CSV columns are:

```text
itemNo,code,name,category,brand,specification,description,location,quantity
```

Use one row per stock location. Repeat an item's `itemNo` on each location row;
leave `itemNo` blank to add a new item with one stock location. Item name is
required, and quantity must be a whole number of zero or more. Replace or
delete the template's example row before importing.

CSV is for spreadsheet-based inventory data. Use the full JSON backup to
preserve and restore all system data. This app uses Firestore rather than SQL,
so a SQL dump is not a valid backup format.
