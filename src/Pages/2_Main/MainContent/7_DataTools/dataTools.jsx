import { useRef, useState } from "react";
import Header from "../../Headers/header.jsx";
import {
  createInventoryCsv,
  createInventoryCsvTemplate,
  isInventoryBackup,
  INVENTORY_BACKUP_FORMAT,
  INVENTORY_BACKUP_VERSION,
  parseInventoryCsv,
} from "../../../../data/inventoryTransfer.js";
import "./dataTools.scss";

const maxTransferFileBytes = 5 * 1024 * 1024;

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataTools({
  inventory,
  inventoryRevision,
  onReplaceItems,
  onClearItems,
  onRestoreBackup,
  actionsDisabled = false,
}) {
  const inventoryItems = Array.isArray(inventory?.items) ? inventory.items : [];
  const transactions = Array.isArray(inventory?.transactions)
    ? inventory.transactions
    : [];
  const [actionError, setActionError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [backupRevision, setBackupRevision] = useState(null);
  const csvInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const currentRevision = Number.isInteger(inventoryRevision)
    ? inventoryRevision
    : 0;
  const transferActionsDisabled = actionsDisabled || isTransferring;

  function exportFullBackup() {
    try {
      const {
        users: _legacyUsers,
        revision: _revision,
        updatedAt: _updatedAt,
        ...data
      } = inventory;
      const backup = {
        format: INVENTORY_BACKUP_FORMAT,
        version: INVENTORY_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        data,
      };
      downloadFile(
        `jerks-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`,
        `${JSON.stringify(backup, null, 2)}\n`,
        "application/json",
      );
      setBackupRevision(currentRevision);
      setActionError("");
      setTransferStatus(
        "Full-system backup downloaded. Export a new backup after any inventory changes before clearing items.",
      );
    } catch (error) {
      setActionError(`Could not export the full backup: ${error.message}`);
      setTransferStatus("");
    }
  }

  function exportInventoryCsv() {
    try {
      downloadFile(
        `jerks-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        createInventoryCsv(inventoryItems),
        "text/csv;charset=utf-8",
      );
      setActionError("");
      setTransferStatus("Inventory CSV downloaded.");
    } catch (error) {
      setActionError(`Could not export the inventory CSV: ${error.message}`);
      setTransferStatus("");
    }
  }

  function downloadCsvTemplate() {
    try {
      downloadFile(
        "jerks-inventory-template.csv",
        createInventoryCsvTemplate(),
        "text/csv;charset=utf-8",
      );
      setActionError("");
      setTransferStatus(
        "CSV template downloaded. Delete the example row or replace it before importing.",
      );
    } catch (error) {
      setActionError(`Could not download the CSV template: ${error.message}`);
      setTransferStatus("");
    }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maxTransferFileBytes) {
      setActionError("Choose a CSV file smaller than 5 MB.");
      setTransferStatus("");
      return;
    }

    setIsTransferring(true);
    setActionError("");
    setTransferStatus("");
    try {
      const importedItems = parseInventoryCsv(await file.text());
      const confirmed = window.confirm(
        `Replace all ${inventoryItems.length} current inventory items with ${importedItems.length} items from this CSV? Existing categories, machines, and transaction history will be preserved. Categories used by imported items will be added if needed; matching items' images and machine assignments will be retained.`,
      );
      if (!confirmed) return;

      const result = await onReplaceItems(importedItems);
      if (result) {
        setActionError(result);
        return;
      }
      setTransferStatus(
        `Replaced inventory items with ${importedItems.length} CSV items. Existing categories, machines, and transaction history were preserved.`,
      );
    } catch (error) {
      setActionError(`Could not import the CSV: ${error.message}`);
    } finally {
      setIsTransferring(false);
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maxTransferFileBytes) {
      setActionError("Choose a backup file smaller than 5 MB.");
      setTransferStatus("");
      return;
    }

    setIsTransferring(true);
    setActionError("");
    setTransferStatus("");
    try {
      let backup;
      try {
        backup = JSON.parse(await file.text());
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }
      if (!isInventoryBackup(backup)) {
        throw new Error(
          "This is not a supported Jerks inventory backup (expected version 1).",
        );
      }
      const backupItems = backup.data.items;
      const confirmed = window.confirm(
        `Restore this full-system backup? It will replace ${inventoryItems.length} current items, ${inventory.categories?.length || 0} categories, and ${transactions.length} transactions with ${backupItems.length} items, ${backup.data.categories.length} categories, and ${backup.data.transactions.length} transactions from the backup.`,
      );
      if (!confirmed) return;

      const result = await onRestoreBackup(backup.data);
      if (result) {
        setActionError(result);
        return;
      }
      setBackupRevision(null);
      setTransferStatus(
        `Full-system backup restored (${backupItems.length} items).`,
      );
    } catch (error) {
      setActionError(`Could not restore the backup: ${error.message}`);
    } finally {
      setIsTransferring(false);
    }
  }

  async function clearItems() {
    if (backupRevision !== currentRevision) {
      setActionError("Export a full-system backup for the current data first.");
      setTransferStatus("");
      return;
    }
    const confirmed = window.confirm(
      `Clear all ${inventoryItems.length} inventory items? Categories, machines, and transaction history will remain. A full-system backup was downloaded for the current inventory revision.`,
    );
    if (!confirmed) return;

    setIsTransferring(true);
    setActionError("");
    setTransferStatus("");
    try {
      const result = await onClearItems();
      if (result) {
        setActionError(result);
        return;
      }
      setTransferStatus(
        "Inventory items cleared. Categories, machines, and transaction history were preserved.",
      );
    } finally {
      setIsTransferring(false);
    }
  }

  return (
    <div className="data-tools-page">
      <Header
        title="Data Management"
        description="Back up, restore, export, and batch upload inventory data"
      />

      <section className="data-tools-content" aria-label="Inventory data tools">
        <article className="data-tools-card">
          <div className="data-tools-card-heading">
            <h2>Full-system backup</h2>
            <p>
              JSON backups include inventory items, categories, machines, and
              transaction history. Staff accounts and sign-in credentials are
              managed by Firebase and are not included.
            </p>
          </div>
          <div className="data-tools-actions">
            <button
              className="data-tools-button"
              type="button"
              onClick={exportFullBackup}
              disabled={transferActionsDisabled}
            >
              Export full-system JSON backup
            </button>
            <button
              className="data-tools-button secondary"
              type="button"
              onClick={() => backupInputRef.current?.click()}
              disabled={transferActionsDisabled}
            >
              Restore full-system JSON backup
            </button>
            <input
              ref={backupInputRef}
              className="data-tools-file-input"
              type="file"
              accept=".json,application/json"
              onChange={importBackup}
            />
          </div>
        </article>

        <article className="data-tools-card">
          <div className="data-tools-card-heading">
            <h2>Inventory spreadsheet</h2>
            <p>
              Use the CSV template for Excel-compatible batch uploads. CSV
              imports replace items only; categories, machines, and transaction
              history remain.
            </p>
          </div>
          <div className="data-tools-actions">
            <button
              className="data-tools-button secondary"
              type="button"
              onClick={downloadCsvTemplate}
              disabled={transferActionsDisabled}
            >
              Download CSV template
            </button>
            <button
              className="data-tools-button secondary"
              type="button"
              onClick={exportInventoryCsv}
              disabled={transferActionsDisabled}
            >
              Export inventory CSV
            </button>
            <button
              className="data-tools-button"
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={transferActionsDisabled}
            >
              Replace inventory from CSV
            </button>
            <input
              ref={csvInputRef}
              className="data-tools-file-input"
              type="file"
              accept=".csv,text/csv"
              onChange={importCsv}
            />
          </div>
          <p className="data-tools-note">
            One row per stock location. Repeat itemNo for multiple locations;
            leave it blank for a new item. Name is required and quantity must
            be a whole number of zero or more. Existing images and machine
            assignments are retained when itemNo matches.
          </p>
        </article>

        <article className="data-tools-card data-tools-danger-card">
          <div className="data-tools-card-heading">
            <h2>Clear inventory items</h2>
            <p>
              This removes all inventory items but keeps categories, machines,
              and transaction history. Export a full-system backup of the
              current data before clearing.
            </p>
          </div>
          <div className="data-tools-actions">
            <button
              className="data-tools-button danger"
              type="button"
              onClick={clearItems}
              disabled={
                transferActionsDisabled ||
                inventoryItems.length === 0 ||
                backupRevision !== currentRevision
              }
              title={
                backupRevision === currentRevision
                  ? "Clear items after the current data was backed up"
                  : "Export a full-system backup for the current data first"
              }
            >
              Clear all {inventoryItems.length} inventory items
            </button>
            <span className="data-tools-backup-reminder">
              {backupRevision === currentRevision
                ? "Backup downloaded for the current data."
                : "A current full-system backup is required to enable clearing."}
            </span>
          </div>
        </article>

        {actionError && (
          <p className="data-tools-error" role="alert">
            {actionError}
          </p>
        )}
        {transferStatus && (
          <p className="data-tools-status" role="status">
            {transferStatus}
          </p>
        )}
      </section>
    </div>
  );
}
