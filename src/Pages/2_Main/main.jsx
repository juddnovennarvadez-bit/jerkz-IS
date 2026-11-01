import "./main.scss";
import Sidebar from "./Sidebar/sidebar.jsx";
import { useEffect, useState } from "react";
import { FaBars, FaTimes } from "react-icons/fa";
import {
  doc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import inventorySeed from "../../data/inventory.json";
import { db } from "../../firebase.js";
import Dashboard from "./MainContent/1_Dashboard/dashboard.jsx";
import Inventory from "./MainContent/2_Inventory/inventory.jsx";
import Category from "./MainContent/3_Category/category.jsx";
import Transactions from "./MainContent/4_Transactions/transactions.jsx";
import Users from "./MainContent/5_Users/users.jsx";
import Machines from "./MainContent/6_Machines/machines.jsx";

const LEGACY_INVENTORY_STORAGE_KEY = "jerks.inventory.data";
const INVENTORY_DOCUMENT_PATH = ["inventory", "shared"];
const MAX_INVENTORY_DOCUMENT_BYTES = 900 * 1024;

function isInventoryData(data) {
  return (
    data &&
    Array.isArray(data.items) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.transactions)
  );
}

function withoutLegacyUsers(data) {
  const { users: _legacyUsers, ...inventory } = data;
  return { ...inventory, users: [] };
}

function prepareCloudInventory(data) {
  const inventory = normalizeMachines(withoutLegacyUsers(data));
  const size = new TextEncoder().encode(JSON.stringify(inventory)).length;
  if (size > MAX_INVENTORY_DOCUMENT_BYTES) {
    throw new Error(
      "The inventory is too large for the shared Firestore document. Reduce image sizes or split inventory data into separate documents.",
    );
  }
  return inventory;
}

function readLegacyInventory() {
  const savedData = window.localStorage.getItem(LEGACY_INVENTORY_STORAGE_KEY);
  if (!savedData) return null;

  let parsedData;
  try {
    parsedData = JSON.parse(savedData);
  } catch {
    throw new Error(
      "The old browser inventory could not be read. It was left untouched; fix or remove its saved data, then reload.",
    );
  }
  if (
    !isInventoryData(parsedData) ||
    !Array.isArray(parsedData.users)
  ) {
    throw new Error(
      "The old browser inventory has an invalid structure. It was left untouched; fix or remove its saved data, then reload.",
    );
  }
  return withoutLegacyUsers(parsedData);
}

function normalizeMachines(data) {
  const machines = new Map(
    (Array.isArray(data.machines) ? data.machines : [])
      .filter((machine) => machine?.number)
      .map((machine) => [String(machine.number).trim().toLowerCase(), machine]),
  );
  for (const item of data.items) {
    const assignedMachines = Array.isArray(item.machines)
      ? item.machines
      : Array.isArray(item.machine)
        ? item.machine
        : item.machine
          ? [item.machine]
          : [];
    for (const assignedMachine of assignedMachines) {
      const number = String(
        typeof assignedMachine === "string"
          ? assignedMachine
          : assignedMachine?.number || "",
      ).trim();
      if (number && !machines.has(number.toLowerCase())) {
        machines.set(number.toLowerCase(), {
          number,
          name:
            typeof assignedMachine === "string"
              ? ""
              : String(assignedMachine?.name || "").trim(),
        });
      }
    }
  }
  const machineList = [...machines.values()];
  const items = data.items.map((item) => {
    const assignedMachines = Array.isArray(item.machines)
      ? item.machines
      : Array.isArray(item.machine)
        ? item.machine
        : item.machine
          ? [item.machine]
          : [];
    const itemMachines = [];
    for (const assignedMachine of assignedMachines) {
      const number = String(
        typeof assignedMachine === "string"
          ? assignedMachine
          : assignedMachine?.number || "",
      ).trim();
      const machine = findMachine(machineList, number);
      if (machine && !itemMachines.some((entry) => entry.number === machine.number)) {
        itemMachines.push(machine);
      }
    }
    const { machine: _legacyMachine, ...itemWithoutLegacyMachine } = item;
    return { ...itemWithoutLegacyMachine, machines: itemMachines };
  });
  return { ...data, items, machines: machineList };
}

function createItemNumber(items, transactions) {
  const highestNumber = [...items, ...transactions].reduce((highest, item) => {
    const match = /^AT-(\d+)$/i.exec(item.itemNo || "");
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `AT-${String(highestNumber + 1).padStart(4, "0")}`;
}

function createTransactionNumber(transactions) {
  const highestNumber = transactions.reduce((highest, transaction) => {
    const match = /^TR-(\d+)$/i.exec(transaction.transactionNo || "");
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `TR-${String(highestNumber + 1).padStart(6, "0")}`;
}

function withCategory(categories, categoryName) {
  const name = String(categoryName || "").trim();
  if (
    !name ||
    categories.some((category) => {
      const currentName =
        typeof category === "string" ? category : category?.name;
      return String(currentName || "").toLowerCase() === name.toLowerCase();
    })
  ) {
    return categories;
  }
  return [...categories, name];
}

function getCategoryName(category) {
  if (typeof category === "string") return category.trim();
  return typeof category?.name === "string" ? category.name.trim() : "";
}

function findMachine(machines, machineNumber) {
  const normalizedNumber = String(machineNumber || "").trim().toLowerCase();
  return (
    machines.find(
      (machine) =>
        String(machine.number || "").trim().toLowerCase() === normalizedNumber,
    ) || null
  );
}

function machinesForItem(machines, machineNumbers) {
  const selectedNumbers = Array.isArray(machineNumbers)
    ? machineNumbers
    : machineNumbers
      ? [machineNumbers]
      : [];
  return selectedNumbers
    .map((number) => findMachine(machines, number))
    .filter(
      (machine, index, matches) =>
        machine &&
        matches.findIndex((entry) => entry?.number === machine.number) === index,
    );
}

export default function Main({ currentUser, onLogout }) {
  const [activePage, setActivePage] = useState("dashboard");
  const [isTabletSidebarOpen, setIsTabletSidebarOpen] = useState(false);
  const [inventory, setInventory] = useState(() =>
    normalizeMachines(withoutLegacyUsers(inventorySeed)),
  );
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [hasCloudInventory, setHasCloudInventory] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [legacyDataWarning, setLegacyDataWarning] = useState("");
  const [legacyDataCleanupError, setLegacyDataCleanupError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isAdmin = currentUser?.role?.toLowerCase() === "admin";

  useEffect(() => {
    let active = true;
    let initializing = false;
    let importedLocalData = false;
    const inventoryRef = doc(db, ...INVENTORY_DOCUMENT_PATH);
    const unsubscribe = onSnapshot(
      inventoryRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          if (initializing) return;
          initializing = true;
          try {
            const legacyInventory = readLegacyInventory();
            let createdFromLegacy = false;
            await runTransaction(db, async (transaction) => {
              createdFromLegacy = false;
              const latestSnapshot = await transaction.get(inventoryRef);
              if (!latestSnapshot.exists()) {
                const initialData = prepareCloudInventory(
                  legacyInventory || withoutLegacyUsers(inventorySeed),
                );
                createdFromLegacy = Boolean(legacyInventory);
                transaction.set(inventoryRef, {
                  ...initialData,
                  revision: 1,
                  updatedAt: Date.now(),
                });
              }
            });
            if (createdFromLegacy && active) {
              importedLocalData = true;
              window.localStorage.removeItem(LEGACY_INVENTORY_STORAGE_KEY);
              setLegacyDataWarning("");
            }
          } catch (error) {
            if (active) {
              setSyncError(`Could not initialize shared inventory: ${error.message}`);
              setInventoryReady(true);
            }
          } finally {
            initializing = false;
          }
          return;
        }

        const cloudData = snapshot.data();
        if (!isInventoryData(cloudData)) {
          setSyncError(
            "The shared Firestore inventory has an invalid structure. Editing is disabled until it is repaired.",
          );
          setInventoryReady(true);
          return;
        }
        if (!active) return;
        setInventory(normalizeMachines(withoutLegacyUsers(cloudData)));
        setInventoryRevision(
          Number.isInteger(cloudData.revision) ? cloudData.revision : 0,
        );
        setHasCloudInventory(true);
        setSyncError("");
        setLegacyDataWarning(
          !importedLocalData &&
            window.localStorage.getItem(LEGACY_INVENTORY_STORAGE_KEY)
            ? "This browser still has an older local inventory. It was not imported because the shared Firebase inventory already exists. Back it up before merging; it has been left untouched."
            : "",
        );
        setInventoryReady(true);
      },
      (error) => {
        if (!active) return;
        setSyncError(`Could not load shared inventory: ${error.message}`);
        setInventoryReady(true);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUser.uid]);

  async function saveInventory(nextInventory) {
    if (!inventoryReady || isSaving) {
      return "Shared inventory is still loading or another change is syncing. Try again shortly.";
    }

    const inventoryRef = doc(db, ...INVENTORY_DOCUMENT_PATH);
    setIsSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(inventoryRef);
        if (!snapshot.exists()) {
          throw new Error("The shared inventory is not initialized. Reload and try again.");
        }
        if (!isInventoryData(snapshot.data())) {
          throw new Error("The shared inventory has an invalid structure.");
        }
        const latestRevision = Number.isInteger(snapshot.data().revision)
          ? snapshot.data().revision
          : 0;
        if (latestRevision !== inventoryRevision) {
          throw new Error(
            "Another staff member just changed the inventory. Wait for it to sync, then retry your change.",
          );
        }
        transaction.set(inventoryRef, {
          ...prepareCloudInventory(nextInventory),
          revision: latestRevision + 1,
          updatedAt: Date.now(),
        });
      });
      setSyncError("");
      return "";
    } catch (error) {
      const message = `Could not sync inventory changes: ${error.message}`;
      setSyncError(message);
      return message;
    } finally {
      setIsSaving(false);
    }
  }

  function removeLegacyInventory() {
    try {
      window.localStorage.removeItem(LEGACY_INVENTORY_STORAGE_KEY);
      setLegacyDataWarning("");
      setLegacyDataCleanupError("");
    } catch (error) {
      setLegacyDataCleanupError(
        `Could not remove the old browser copy: ${error.message}`,
      );
    }
  }

  function addItem(fields) {
    const timestamp = new Date().toISOString();
    const itemMachines = machinesForItem(
      inventory.machines,
      fields.machineNumbers,
    );
    const item = {
      itemNo: createItemNumber(inventory.items, inventory.transactions),
      code: fields.code.trim(),
      name: fields.name.trim(),
      category: fields.category.trim(),
      specification: fields.specification.trim(),
      description: fields.description.trim(),
      brand: fields.brand.trim(),
      image: fields.image.trim(),
      machines: itemMachines,
      stock: [
        {
          number: "1",
          quantity: 0,
          dateAdded: timestamp,
          location: fields.location.trim(),
        },
      ],
      dateCreated: timestamp,
    };
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Item Added",
      itemNo: item.itemNo,
      code: item.code,
      itemName: item.name,
      quantity: 0,
      userName: currentUser?.username || "",
      reason: "Item added to inventory",
      timestamp,
    };

    return saveInventory({
      ...inventory,
      items: [...inventory.items, item],
      categories: withCategory(inventory.categories, item.category),
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function editItem(itemNo, fields) {
    const originalItem = inventory.items.find((item) => item.itemNo === itemNo);
    if (!originalItem) {
      return "This inventory item no longer exists.";
    }

    const fieldChanges = [
      ["name", "Name", originalItem.name, fields.name.trim()],
      ["code", "Part number", originalItem.code || "", fields.code.trim()],
      ["brand", "Brand", originalItem.brand || "", fields.brand.trim()],
      [
        "category",
        "Category",
        originalItem.category || "",
        fields.category.trim(),
      ],
      [
        "specification",
        "Specification",
        originalItem.specification || "",
        fields.specification.trim(),
      ],
      [
        "description",
        "Description",
        originalItem.description || "",
        fields.description.trim(),
      ],
      ["image", "Image", originalItem.image || "", fields.image.trim()],
      [
        "machine",
        "Machine",
        (originalItem.machines || []).map((machine) => machine.number).join(", "),
        machinesForItem(inventory.machines, fields.machineNumbers)
          .map((machine) => machine.number)
          .join(", "),
      ],
      [
        "location",
        "Location",
        originalItem.stock?.[0]?.location || "",
        fields.location.trim(),
      ],
    ].filter(([, , previous, next]) => previous !== next);

    const stock = Array.isArray(originalItem.stock) ? originalItem.stock : [];
    const editedItem = {
      ...originalItem,
      name: fields.name.trim(),
      code: fields.code.trim(),
      category: fields.category.trim(),
      specification: fields.specification.trim(),
      description: fields.description.trim(),
      brand: fields.brand.trim(),
      image: fields.image.trim(),
      machines: machinesForItem(inventory.machines, fields.machineNumbers),
      stock: stock.length
        ? stock.map((entry, index) =>
            index === 0 ? { ...entry, location: fields.location.trim() } : entry,
          )
        : [
            {
              number: "1",
              quantity: 0,
              dateAdded: "",
              location: fields.location.trim(),
            },
          ],
    };
    const items = inventory.items.map((item) =>
      item.itemNo === itemNo ? editedItem : item,
    );
    const transactions =
      fieldChanges.length > 0
        ? [
            {
              transactionNo: createTransactionNumber(inventory.transactions),
              transactionType: "Item Edited",
              itemNo: editedItem.itemNo,
              code: editedItem.code,
              itemName: editedItem.name,
              quantity: 0,
              userName: currentUser?.username || "",
              reason: `Updated ${fieldChanges
                .map(([key, label, previous, next]) => {
                  if (key === "image") return label;
                  return `${label} (${previous || "empty"} → ${next || "empty"})`;
                })
                .join(", ")}`,
              timestamp: new Date().toISOString(),
            },
            ...inventory.transactions,
          ]
        : inventory.transactions;

    return saveInventory({
      ...inventory,
      items,
      categories: withCategory(inventory.categories, editedItem.category),
      transactions,
    });
  }

  function bulkAssignItems(itemNos, { category, machineNumbers }) {
    const selectedItemNos = new Set(itemNos);
    const selectedItems = inventory.items.filter((item) =>
      selectedItemNos.has(item.itemNo),
    );
    if (selectedItems.length !== selectedItemNos.size) {
      return "One or more selected items no longer exist.";
    }

    const assignCategory = category !== null;
    const machinesToAdd = machinesForItem(inventory.machines, machineNumbers);
    if (!assignCategory && machinesToAdd.length === 0) {
      return "Choose a category or at least one machine to assign.";
    }

    const timestamp = new Date().toISOString();
    const transactions = [...inventory.transactions];
    const updatedItems = inventory.items.map((item) => {
      if (!selectedItemNos.has(item.itemNo)) return item;

      const currentMachines = Array.isArray(item.machines) ? item.machines : [];
      const nextMachines = [...currentMachines];
      for (const machine of machinesToAdd) {
        if (
          !nextMachines.some(
            (assigned) =>
              String(assigned.number || "").trim().toLowerCase() ===
              machine.number.trim().toLowerCase(),
          )
        ) {
          nextMachines.push(machine);
        }
      }

      const nextCategory = assignCategory ? category : getCategoryName(item.category);
      const categoryChanged =
        assignCategory && getCategoryName(item.category) !== nextCategory;
      const machinesChanged = nextMachines.length !== currentMachines.length;
      if (!categoryChanged && !machinesChanged) return item;

      const changes = [];
      if (categoryChanged) {
        changes.push(
          nextCategory
            ? `category set to "${nextCategory}"`
            : "category cleared",
        );
      }
      if (machinesChanged) {
        changes.push(
          `machine(s) added: ${machinesToAdd
            .filter((machine) =>
              !currentMachines.some(
                (assigned) =>
                  String(assigned.number || "").trim().toLowerCase() ===
                  machine.number.trim().toLowerCase(),
              ),
            )
            .map((machine) => machine.number)
            .join(", ")}`,
        );
      }

      transactions.unshift({
        transactionNo: createTransactionNumber(transactions),
        transactionType: "Item Edited",
        itemNo: item.itemNo,
        code: item.code,
        itemName: item.name,
        quantity: 0,
        userName: currentUser?.username || "",
        reason: `Bulk update: ${changes.join("; ")}`,
        timestamp,
      });

      return {
        ...item,
        ...(assignCategory ? { category: nextCategory } : {}),
        machines: nextMachines,
      };
    });

    return saveInventory({
      ...inventory,
      items: updatedItems,
      categories:
        assignCategory && category
          ? withCategory(inventory.categories, category)
          : inventory.categories,
      transactions,
    });
  }

  function changeStock({ itemNo, stockIndex, direction, quantity, reason }) {
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount <= 0) {
      return "Enter a whole number greater than zero.";
    }

    const item = inventory.items.find((entry) => entry.itemNo === itemNo);
    if (!item) {
      return "This inventory item no longer exists.";
    }

    const stock = item.stock[stockIndex];
    if (!stock) {
      return "Select a valid stock location.";
    }

    const currentQuantity = Number(stock.quantity) || 0;
    if (direction === "out" && amount > currentQuantity) {
      return `Only ${currentQuantity} units are available at this location.`;
    }

    const nextQuantity =
      direction === "in" ? currentQuantity + amount : currentQuantity - amount;
    const transactionType = direction === "in" ? "Stock In" : "Stock Out";
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType,
      itemNo: item.itemNo,
      code: item.code,
      itemName: item.name,
      quantity: amount,
      userName: currentUser?.username || "",
      reason: reason.trim(),
      timestamp: new Date().toISOString(),
    };
    const nextInventory = {
      ...inventory,
      items: inventory.items.map((entry) =>
        entry.itemNo === itemNo
          ? {
              ...entry,
              stock: entry.stock.map((stockEntry, index) =>
                index === stockIndex
                  ? { ...stockEntry, quantity: nextQuantity }
                  : stockEntry,
              ),
            }
          : entry,
      ),
      transactions: [transaction, ...inventory.transactions],
    };
    return saveInventory(nextInventory);
  }

  function deleteItem(itemNo) {
    const item = inventory.items.find((entry) => entry.itemNo === itemNo);
    if (!item) {
      return "This inventory item no longer exists.";
    }

    const quantity = item.stock.reduce(
      (total, stock) => total + (Number(stock.quantity) || 0),
      0,
    );
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Item Deleted",
      itemNo: item.itemNo,
      code: item.code,
      itemName: item.name,
      quantity,
      userName: currentUser?.username || "",
      reason: "Item deleted from inventory",
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      items: inventory.items.filter((entry) => entry.itemNo !== itemNo),
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function addCategory(categoryName) {
    const name = categoryName.trim();
    if (!name) {
      return "Enter a category name.";
    }

    const exists = [
      ...inventory.categories.map((category) =>
        typeof category === "string" ? category : category?.name,
      ),
      ...inventory.items.map((item) =>
        typeof item.category === "string" ? item.category : item.category?.name,
      ),
    ].some(
      (currentName) =>
        String(currentName || "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      return "A category with this name already exists.";
    }

    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Category Added",
      itemNo: "",
      code: "",
      itemName: name,
      quantity: 0,
      userName: currentUser?.username || "",
      reason: `Category "${name}" added`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      categories: [...inventory.categories, name],
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function editCategory(previousName, nextName) {
    const name = nextName.trim();
    if (!name) {
      return "Enter a category name.";
    }

    const exists = [
      ...inventory.categories.map((category) =>
        typeof category === "string" ? category : category?.name,
      ),
      ...inventory.items.map((item) =>
        typeof item.category === "string" ? item.category : item.category?.name,
      ),
    ].some((currentName) => {
      const normalizedName = String(currentName || "").trim().toLowerCase();
      if (!inventoryReady || !hasCloudInventory) {
        return (
          <main className="inventory-sync-status" role="status">
            <h1>{syncError ? "Inventory sync needs attention" : "Loading shared inventory..."}</h1>
            {syncError && <p role="alert">{syncError}</p>}
            <button type="button" onClick={onLogout}>
              Sign out
            </button>
          </main>
        );
      }

      return (
        normalizedName === name.toLowerCase() &&
        normalizedName !== previousName.toLowerCase()
      );
    });
    if (exists) {
      return "A category with this name already exists.";
    }

    const updatedCategories = inventory.categories.map((category) => {
      const currentName =
        typeof category === "string" ? category : category?.name;
      if (String(currentName || "").trim().toLowerCase() !== previousName.toLowerCase()) {
        return category;
      }
      return typeof category === "string" ? name : { ...category, name };
    });
    const updatedItems = inventory.items.map((item) => {
      const currentName =
        typeof item.category === "string" ? item.category : item.category?.name;
      if (String(currentName || "").trim().toLowerCase() !== previousName.toLowerCase()) {
        return item;
      }
      return { ...item, category: name };
    });
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Category Edited",
      itemNo: "",
      code: "",
      itemName: name,
      quantity: updatedItems.filter(
        (item) => String(item.category || "").toLowerCase() === name.toLowerCase(),
      ).length,
      userName: currentUser?.username || "",
      reason: `Category renamed from "${previousName}" to "${name}"`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      items: updatedItems,
      categories: updatedCategories,
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function deleteCategory(categoryName) {
    const exists =
      inventory.categories.some((category) => {
        const currentName =
          typeof category === "string" ? category : category?.name;
        return (
          String(currentName || "").trim().toLowerCase() ===
          categoryName.toLowerCase()
        );
      }) ||
      inventory.items.some((item) => {
        const currentName =
          typeof item.category === "string" ? item.category : item.category?.name;
        return (
          String(currentName || "").trim().toLowerCase() ===
          categoryName.toLowerCase()
        );
      });
    if (!exists) {
      return "This category no longer exists.";
    }

    const affectedItems = inventory.items.filter((item) => {
      const currentName =
        typeof item.category === "string" ? item.category : item.category?.name;
      return String(currentName || "").trim().toLowerCase() === categoryName.toLowerCase();
    });
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Category Deleted",
      itemNo: "",
      code: "",
      itemName: categoryName,
      quantity: affectedItems.length,
      userName: currentUser?.username || "",
      reason: `Category "${categoryName}" deleted; ${affectedItems.length} item(s) set to uncategorized`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      items: inventory.items.map((item) => {
        const currentName =
          typeof item.category === "string" ? item.category : item.category?.name;
        return String(currentName || "").trim().toLowerCase() === categoryName.toLowerCase()
          ? { ...item, category: "" }
          : item;
      }),
      categories: inventory.categories.filter((category) => {
        const currentName =
          typeof category === "string" ? category : category?.name;
        return String(currentName || "").trim().toLowerCase() !== categoryName.toLowerCase();
      }),
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function addMachine(fields) {
    const number = fields.number.trim();
    const name = fields.name.trim();
    if (!number || !name) return "Enter both a machine number and a name.";
    if (findMachine(inventory.machines, number)) {
      return "A machine with this number already exists.";
    }

    const machine = { number, name };
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Machine Added",
      itemNo: "",
      code: "",
      itemName: name,
      quantity: 0,
      userName: currentUser?.username || "",
      reason: `Machine ${number} ("${name}") added`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      machines: [...inventory.machines, machine],
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function editMachine(previousNumber, fields) {
    const number = fields.number.trim();
    const name = fields.name.trim();
    if (!number || !name) return "Enter both a machine number and a name.";
    const duplicate = findMachine(inventory.machines, number);
    if (
      duplicate &&
      String(duplicate.number).trim().toLowerCase() !==
        previousNumber.trim().toLowerCase()
    ) {
      return "A machine with this number already exists.";
    }

    const previousMachine = findMachine(inventory.machines, previousNumber);
    if (!previousMachine) return "This machine no longer exists.";

    const affectedItems = inventory.items.filter(
      (item) =>
        (item.machines || []).some(
          (machine) =>
            String(machine.number || "").trim().toLowerCase() ===
            previousNumber.trim().toLowerCase(),
        ),
    );
    const machine = { number, name };
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Machine Edited",
      itemNo: "",
      code: "",
      itemName: name,
      quantity: affectedItems.length,
      userName: currentUser?.username || "",
      reason: `Machine updated from ${previousMachine.number} ("${previousMachine.name || "unnamed"}") to ${number} ("${name}")`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      machines: inventory.machines.map((entry) =>
        String(entry.number).trim().toLowerCase() ===
        previousNumber.trim().toLowerCase()
          ? machine
          : entry,
      ),
      items: inventory.items.map((item) =>
        (item.machines || []).some(
          (machine) =>
            String(machine.number || "").trim().toLowerCase() ===
            previousNumber.trim().toLowerCase(),
        )
          ? {
              ...item,
              machines: item.machines.map((machine) =>
                String(machine.number || "").trim().toLowerCase() ===
                previousNumber.trim().toLowerCase()
                  ? { ...machine, number, name }
                  : machine,
              ),
            }
          : item,
      ),
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function deleteMachine(machineNumber) {
    const machine = findMachine(inventory.machines, machineNumber);
    if (!machine) return "This machine no longer exists.";
    const affectedItems = inventory.items.filter(
      (item) =>
        (item.machines || []).some(
          (machine) =>
            String(machine.number || "").trim().toLowerCase() ===
            machineNumber.trim().toLowerCase(),
        ),
    );
    const transaction = {
      transactionNo: createTransactionNumber(inventory.transactions),
      transactionType: "Machine Deleted",
      itemNo: "",
      code: "",
      itemName: machine.name,
      quantity: affectedItems.length,
      userName: currentUser?.username || "",
      reason: `Machine ${machine.number} ("${machine.name}") deleted; ${affectedItems.length} item(s) unassigned`,
      timestamp: new Date().toISOString(),
    };
    return saveInventory({
      ...inventory,
      machines: inventory.machines.filter(
        (entry) =>
          String(entry.number).trim().toLowerCase() !==
          machineNumber.trim().toLowerCase(),
      ),
      items: inventory.items.map((item) =>
        (item.machines || []).some(
          (machine) =>
            String(machine.number || "").trim().toLowerCase() ===
            machineNumber.trim().toLowerCase(),
        )
          ? {
              ...item,
              machines: item.machines.filter(
                (machine) =>
                  String(machine.number || "").trim().toLowerCase() !==
                  machineNumber.trim().toLowerCase(),
              ),
            }
          : item,
      ),
      transactions: [transaction, ...inventory.transactions],
    });
  }

  function changePage(page) {
    if (page !== "users" || isAdmin) {
      setActivePage(page);
      setIsTabletSidebarOpen(false);
    }
  }

  return (
    <>
      <main className="main-container">
        {isTabletSidebarOpen && (
          <button
            type="button"
            className="tablet-sidebar-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setIsTabletSidebarOpen(false)}
          />
        )}
        <button
          type="button"
          className="tablet-menu-toggle"
          aria-label={isTabletSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isTabletSidebarOpen}
          onClick={() => setIsTabletSidebarOpen((open) => !open)}
        >
          {isTabletSidebarOpen ? <FaTimes /> : <FaBars />}
        </button>
        <aside
          className={`sidebar-container${isTabletSidebarOpen ? " is-open" : ""}`}
        >
          <Sidebar
            activePage={activePage}
            setActivePage={changePage}
            currentUser={currentUser}
            onLogout={onLogout}
          />
        </aside>
        <div className="main-content-container">
          {(syncError || legacyDataWarning || legacyDataCleanupError) && (
            <p
              className="inventory-storage-error"
              role={syncError ? "alert" : "status"}
            >
              {syncError || legacyDataCleanupError || legacyDataWarning}
              {legacyDataWarning && !syncError && (
                <button
                  type="button"
                  className="legacy-inventory-remove-button"
                  onClick={removeLegacyInventory}
                >
                  Delete old browser copy
                </button>
              )}
            </p>
          )}
          {activePage === "inventory" ? (
            <Inventory
              inventory={inventory}
              machines={inventory.machines}
              onAddItem={addItem}
              onEditItem={editItem}
              onChangeStock={changeStock}
              onDeleteItem={deleteItem}
              onBulkAssignItems={bulkAssignItems}
              actionsDisabled={isSaving || !hasCloudInventory}
            />
          ) : activePage === "category" ? (
            <Category
              inventory={inventory}
              onAddCategory={addCategory}
              onEditCategory={editCategory}
              onDeleteCategory={deleteCategory}
              actionsDisabled={isSaving || !hasCloudInventory}
            />
          ) : activePage === "transactions" ? (
            <Transactions inventory={inventory} />
          ) : activePage === "users" ? (
            isAdmin ? (
              <Users currentUser={currentUser} />
            ) : (
              <Dashboard
                inventory={inventory}
                onViewTransactions={() => changePage("transactions")}
              />
            )
          ) : activePage === "machines" ? (
            <Machines
              inventory={inventory}
              onAddMachine={addMachine}
              onEditMachine={editMachine}
              onDeleteMachine={deleteMachine}
              actionsDisabled={isSaving || !hasCloudInventory}
            />
          ) : (
            <Dashboard
              inventory={inventory}
              onViewTransactions={() => changePage("transactions")}
            />
          )}
        </div>
      </main>
    </>
  );
}
