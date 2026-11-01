import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCamera,
  FaEdit,
  FaEye,
  FaImage,
  FaMinus,
  FaPlus,
  FaSearch,
  FaTrash,
} from "react-icons/fa";
import Header from "../../Headers/header.jsx";
import "./inventory.scss";

const itemsPerPage = 10;

function getPageNumbers(currentPage, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", pageCount];
  }
  if (currentPage >= pageCount - 3) {
    return [
      1,
      "ellipsis-start",
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }
  return [
    1,
    "ellipsis-start",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-end",
    pageCount,
  ];
}

function getQuantity(item) {
  return Array.isArray(item.stock)
    ? item.stock.reduce(
        (total, stock) => total + (Number(stock.quantity) || 0),
        0,
      )
    : 0;
}

function getLocation(item) {
  return item.stock
    ?.map((stock) => stock.location)
    .filter(Boolean)
    .join(", ");
}

function getCategoryName(category) {
  if (typeof category === "string") {
    return category.trim();
  }
  if (category && typeof category.name === "string") {
    return category.name.trim();
  }
  return "";
}

function getItemMachines(item) {
  if (Array.isArray(item?.machines)) return item.machines;
  if (Array.isArray(item?.machine)) return item.machine;
  return item?.machine ? [item.machine] : [];
}

async function prepareImageUpload(file) {
  const supportedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!supportedTypes.includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("Image uploads are not supported by this browser.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the selected image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("Could not process the selected image.")),
        "image/webp",
        0.82,
      );
    });
    if (!blob.type.startsWith("image/")) {
      throw new Error("Could not process the selected image.");
    }

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Could not read the selected image."));
        }
      };
      reader.onerror = () =>
        reject(reader.error || new Error("Could not read the selected image."));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

function formatDetailDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function ItemDetailsModal({ item, onClose }) {
  const stockEntries = Array.isArray(item.stock) ? item.stock : [];
  const machines = getItemMachines(item);
  const details = [
    ["Item number", item.itemNo],
    ["Part number", item.code],
    ["Brand", item.brand],
    ["Category", getCategoryName(item.category) || "Uncategorized"],
    [
      "Machines",
      machines
        .map((machine) =>
          typeof machine === "string"
            ? machine
            : `${machine?.number || ""}${machine?.name ? ` — ${machine.name}` : ""}`,
        )
        .filter(Boolean)
        .join(", ") || "Unassigned",
    ],
    ["Specification", item.specification],
    ["Description", item.description],
    ["Created", formatDetailDate(item.dateCreated)],
  ];

  return (
    <div
      className="inventory-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="inventory-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-details-title"
      >
        <div className="inventory-modal-heading">
          <div>
            <h3 id="inventory-details-title">{item.name || "Item details"}</h3>
            <p>{item.itemNo || "Inventory item"}</p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close item details"
          >
            ×
          </button>
        </div>
        <div className="inventory-details-content">
          <div className="inventory-details-image-container">
            {item.image ? (
              <img
                className="inventory-details-image"
                src={item.image}
                alt={item.name || "Inventory item"}
              />
            ) : (
              <div className="inventory-details-image-placeholder">
                <FaImage aria-hidden="true" />
                <span>No picture added</span>
              </div>
            )}
          </div>
          <dl className="inventory-details-grid">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
            <div>
              <dt>Total quantity</dt>
              <dd>{getQuantity(item)}</dd>
            </div>
          </dl>
          <section className="inventory-details-stock">
            <h4>Stock by location</h4>
            {stockEntries.length > 0 ? (
              <ul>
                {stockEntries.map((stock, index) => (
                  <li key={`${stock.number || "stock"}-${index}`}>
                    <span>{stock.location || `Location ${index + 1}`}</span>
                    <strong>{Number(stock.quantity) || 0}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No stock locations recorded.</p>
            )}
          </section>
          <div className="inventory-modal-actions">
            <button type="button" className="modal-submit" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ItemModal({
  action,
  item,
  categories,
  machines,
  onClose,
  onSaveItem,
  onChangeStock,
}) {
  const isStockAction = action === "stock-in" || action === "stock-out";
  const [fields, setFields] = useState({
    name: item?.name || "",
    code: item?.code || "",
    brand: item?.brand || "",
    category: getCategoryName(item?.category),
    machineNumbers: getItemMachines(item)
      .map((machine) =>
        typeof machine === "string" ? machine : machine?.number,
      )
      .filter(Boolean),
    specification: item?.specification || "",
    description: item?.description || "",
    image: item?.image || "",
    location: item?.stock?.[0]?.location || "",
  });
  const [stockIndex, setStockIndex] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const stockEntries = Array.isArray(item?.stock) ? item.stock : [];
  const selectedStock = stockEntries[stockIndex];

  function updateField(event) {
    const { name, value } = event.target;
    setFields((currentFields) => ({ ...currentFields, [name]: value }));
  }

  async function processImageFile(file) {
    setError("");
    setIsPreparingImage(true);
    try {
      const image = await prepareImageUpload(file);
      setFields((currentFields) => ({ ...currentFields, image }));
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setIsPreparingImage(false);
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await processImageFile(file);
  }

  async function handleNativeCamera() {
    setError("");
    setIsPreparingImage(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        direction: CameraDirection.Rear,
        width: 1600,
        height: 1600,
      });
      if (!photo.dataUrl) {
        throw new Error("The camera did not return an image.");
      }
      const response = await fetch(photo.dataUrl);
      if (!response.ok) {
        throw new Error("Could not read the captured photo.");
      }
      const blob = await response.blob();
      const file = new File([blob], `capture.${photo.format || "jpeg"}`, {
        type: blob.type || `image/${photo.format || "jpeg"}`,
      });
      const image = await prepareImageUpload(file);
      setFields((currentFields) => ({ ...currentFields, image }));
    } catch (cameraError) {
      const errorMessage =
        cameraError instanceof Error ? cameraError.message : String(cameraError || "");
      if (!errorMessage.toLowerCase().includes("cancel")) {
        setError(errorMessage || "Could not take a photo.");
      }
    } finally {
      setIsPreparingImage(false);
    }
  }

  function handleTakePhoto(event) {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    void handleNativeCamera();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      if (isStockAction) {
        const result = await onChangeStock({
          itemNo: item.itemNo,
          stockIndex,
          direction: action === "stock-in" ? "in" : "out",
          quantity,
          reason,
        });
        if (result) {
          setError(result);
          return;
        }
      } else {
        if (!fields.name.trim()) {
          setError("Enter an item name.");
          return;
        }
        const result = await onSaveItem(item?.itemNo, fields);
        if (result) {
          setError(result);
          return;
        }
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="inventory-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="inventory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-modal-title"
      >
        <div className="inventory-modal-heading">
          <div>
            <h3 id="inventory-modal-title">
              {isStockAction
                ? action === "stock-in"
                  ? "Stock In"
                  : "Stock Out"
                : action === "add"
                  ? "Add Inventory Item"
                  : "Edit Inventory Item"}
            </h3>
            {isStockAction && (
              <p>
                {item.name} · current total: {getQuantity(item)}
              </p>
            )}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="inventory-modal-form" onSubmit={handleSubmit}>
          {isStockAction ? (
            <>
              {stockEntries.length > 1 && (
                <label>
                  Stock location
                  <select
                    value={stockIndex}
                    onChange={(event) =>
                      setStockIndex(Number(event.target.value))
                    }
                  >
                    {stockEntries.map((stock, index) => (
                      <option value={index} key={`${stock.number}-${index}`}>
                        {stock.location || `Location ${index + 1}`} (
                        {Number(stock.quantity) || 0} available)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedStock && (
                <p className="stock-location-note">
                  Location: {selectedStock.location || "Not specified"} ·{" "}
                  {Number(selectedStock.quantity) || 0} currently available
                </p>
              )}
              <label>
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              <label>
                Reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason for stock change"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                Item name *
                <input
                  name="name"
                  value={fields.name}
                  onChange={updateField}
                  required
                  autoFocus
                />
              </label>
              <div className="inventory-modal-row">
                <label>
                  Part number
                  <input name="code" value={fields.code} onChange={updateField} />
                </label>
                <label>
                  Brand
                  <input
                    name="brand"
                    value={fields.brand}
                    onChange={updateField}
                  />
                </label>
              </div>
              <div className="inventory-modal-row">
                <label>
                  Category
                  <select
                    name="category"
                    value={fields.category}
                    onChange={updateField}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((category) => (
                      <option value={category} key={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="inventory-machine-options">
                <legend>Machines</legend>
                {machines.length ? (
                  machines.map((machine) => {
                    const isSelected = fields.machineNumbers.some(
                      (number) =>
                        String(number).trim().toLowerCase() ===
                        String(machine.number).trim().toLowerCase(),
                    );
                    return (
                      <button
                        className={`inventory-machine-option${isSelected ? " selected" : ""}`}
                        key={machine.number}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setFields((currentFields) => ({
                            ...currentFields,
                            machineNumbers: isSelected
                              ? currentFields.machineNumbers.filter(
                                  (number) =>
                                    String(number).trim().toLowerCase() !==
                                    String(machine.number).trim().toLowerCase(),
                                )
                              : [...currentFields.machineNumbers, machine.number],
                          }));
                        }}
                      >
                        <span className="inventory-machine-option-number">
                          {machine.number}
                        </span>
                        <span className="inventory-machine-option-name">
                          {machine.name || "Unnamed machine"}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p>No machines configured. Add machines from the Machines page.</p>
                )}
              </fieldset>
              <div className="inventory-modal-row">
                <label>
                  Location
                  <input
                    name="location"
                    value={fields.location}
                    onChange={updateField}
                  />
                </label>
              </div>
              <label>
                Specification
                <input
                  name="specification"
                  value={fields.specification}
                  onChange={updateField}
                />
              </label>
              <div className="inventory-image-editor">
                <span className="inventory-image-editor-label">Item image</span>
                <div className="inventory-image-editor-preview">
                  {fields.image ? (
                    <img src={fields.image} alt="Selected item preview" />
                  ) : (
                    <div className="inventory-image-editor-placeholder">
                      <FaImage aria-hidden="true" />
                      <span>No image selected</span>
                    </div>
                  )}
                </div>
                <div className="inventory-image-editor-actions">
                  <label className="inventory-image-upload-button">
                    <FaImage aria-hidden="true" />
                    Choose image
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      disabled={isPreparingImage}
                    />
                  </label>
                  <label className="inventory-image-upload-button">
                    <FaCamera aria-hidden="true" />
                    Take photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={handleImageUpload}
                      onClick={handleTakePhoto}
                      disabled={isPreparingImage}
                    />
                  </label>
                  {fields.image && (
                    <button
                      className="inventory-image-remove-button"
                      type="button"
                      onClick={() =>
                        setFields((currentFields) => ({
                          ...currentFields,
                          image: "",
                        }))
                      }
                      disabled={isPreparingImage}
                    >
                      Remove image
                    </button>
                  )}
                </div>
                <span className="inventory-image-upload-note">
                  JPG, PNG, or WebP. Images are resized before syncing.
                  {isPreparingImage ? " Preparing image…" : ""}
                </span>
                <label>
                  Or use an image URL
                  <input
                    name="image"
                    type="url"
                    value={fields.image.startsWith("data:") ? "" : fields.image}
                    onChange={updateField}
                    placeholder="https://..."
                    disabled={isPreparingImage}
                  />
                </label>
              </div>
              <label>
                Description
                <textarea
                  name="description"
                  value={fields.description}
                  onChange={updateField}
                  rows="3"
                />
              </label>
              {action === "add" && (
                <p className="stock-location-note">
                  New items start with zero stock. Use Stock In to record
                  quantities.
                </p>
              )}
            </>
          )}
          {error && (
            <p className="inventory-action-error" role="alert">
              {error}
            </p>
          )}
          <div className="inventory-modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="modal-submit"
              disabled={isPreparingImage || isSaving}
            >
              {isSaving
                ? "Syncing..."
                : isStockAction
                ? action === "stock-in"
                  ? "Record Stock In"
                  : "Record Stock Out"
                : action === "add"
                  ? "Add Item"
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BulkAssignModal({ categories, machines, onClose, onApply }) {
  const [category, setCategory] = useState(null);
  const [machineNumbers, setMachineNumbers] = useState([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSaving(true);
    try {
      const result = await onApply({ category, machineNumbers });
      if (result) {
        setError(result);
        return;
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  function toggleMachine(machineNumber) {
    setMachineNumbers((currentNumbers) =>
      currentNumbers.some(
        (number) =>
          String(number).trim().toLowerCase() ===
          String(machineNumber).trim().toLowerCase(),
      )
        ? currentNumbers.filter(
            (number) =>
              String(number).trim().toLowerCase() !==
              String(machineNumber).trim().toLowerCase(),
          )
        : [...currentNumbers, machineNumber],
    );
  }

  return (
    <div
      className="inventory-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="inventory-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-assign-modal-title"
      >
        <div className="inventory-modal-heading">
          <div>
            <h3 id="bulk-assign-modal-title">Bulk Assign</h3>
            <p>Set a category and add machines to all selected items.</p>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form className="inventory-modal-form" onSubmit={handleSubmit}>
          <label>
            Category
            <select
              value={category === null ? "__unchanged__" : category}
              onChange={(event) =>
                setCategory(
                  event.target.value === "__unchanged__"
                    ? null
                    : event.target.value,
                )
              }
            >
              <option value="__unchanged__">Keep current category</option>
              <option value="">Uncategorized</option>
              {categories.map((name) => (
                <option value={name} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="inventory-machine-options">
            <legend>Add machines</legend>
            {machines.length ? (
              machines.map((machine) => {
                const isSelected = machineNumbers.some(
                  (number) =>
                    String(number).trim().toLowerCase() ===
                    String(machine.number).trim().toLowerCase(),
                );
                return (
                  <button
                    className={`inventory-machine-option${isSelected ? " selected" : ""}`}
                    key={machine.number}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleMachine(machine.number)}
                  >
                    <span className="inventory-machine-option-number">
                      {machine.number}
                    </span>
                    <span className="inventory-machine-option-name">
                      {machine.name || "Unnamed machine"}
                    </span>
                  </button>
                );
              })
            ) : (
              <p>No machines configured. Add machines from the Machines page.</p>
            )}
          </fieldset>
          <p className="stock-location-note">
            Selected machines are added to existing assignments, not substituted.
          </p>
          {error && (
            <p className="inventory-action-error" role="alert">
              {error}
            </p>
          )}
          <div className="inventory-modal-actions">
            <button type="button" className="modal-cancel" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="modal-submit" disabled={isSaving}>
              {isSaving ? "Syncing..." : "Apply to selected"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Inventory({
  inventory,
  machines = [],
  onAddItem,
  onEditItem,
  onChangeStock,
  onDeleteItem,
  onBulkAssignItems,
  actionsDisabled = false,
}) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalAction, setModalAction] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [viewedItem, setViewedItem] = useState(null);
  const [actionError, setActionError] = useState("");
  const [selectedItemNos, setSelectedItemNos] = useState([]);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const inventoryItems = Array.isArray(inventory?.items) ? inventory.items : [];
  const categories = [
    ...new Map(
      [
        ...(Array.isArray(inventory?.categories) ? inventory.categories : []).map(
          getCategoryName,
        ),
        ...inventoryItems.map((item) => getCategoryName(item.category)),
      ]
        .filter(Boolean)
        .map((category) => [category.toLowerCase(), category]),
    ).values(),
  ].sort((first, second) => first.localeCompare(second));
  const query = search.trim().toLowerCase();
  const filteredItems = inventoryItems.filter((item) =>
    [
      item.itemNo,
      item.code,
      item.name,
      item.brand,
      item.category,
      getLocation(item),
      getItemMachines(item)
        .map((machine) =>
          typeof machine === "string" ? machine : machine?.number,
        )
        .join(" "),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
  const pageCount = Math.ceil(filteredItems.length / itemsPerPage);
  const safePage = Math.min(currentPage, Math.max(pageCount, 1));
  const pageNumbers = getPageNumbers(safePage, pageCount);
  const pageStart = (safePage - 1) * itemsPerPage;
  const pageItems = filteredItems.slice(pageStart, pageStart + itemsPerPage);
  const allPageItemsSelected =
    pageItems.length > 0 &&
    pageItems.every((item) => selectedItemNos.includes(item.itemNo));
  const firstItemNumber = filteredItems.length === 0 ? 0 : pageStart + 1;
  const lastItemNumber = Math.min(pageStart + itemsPerPage, filteredItems.length);
  const totalUnits = inventoryItems.reduce(
    (total, item) => total + getQuantity(item),
    0,
  );

  function openModal(action, item = null) {
    setActionError("");
    setSelectedItem(item);
    setModalAction(action);
  }

  function closeModal() {
    setModalAction("");
    setSelectedItem(null);
  }

  async function saveItem(itemNo, fields) {
    const result = await (itemNo
      ? onEditItem(itemNo, fields)
      : onAddItem(fields));
    if (!result) setActionError("");
    return result;
  }

  async function removeItem(item) {
    const confirmed = window.confirm(
      `Delete "${item.name}"? This removes it from inventory and records the deletion in Transactions.`,
    );
    if (!confirmed) return;

    const result = await onDeleteItem(item.itemNo);
    setActionError(result || "");
    if (!result) {
      setSelectedItemNos((current) =>
        current.filter((itemNo) => itemNo !== item.itemNo),
      );
    }
  }

  function togglePageSelection(checked) {
    const pageItemNos = pageItems.map((item) => item.itemNo);
    setSelectedItemNos((current) =>
      checked
        ? [...new Set([...current, ...pageItemNos])]
        : current.filter((itemNo) => !pageItemNos.includes(itemNo)),
    );
  }

  function toggleItemSelection(itemNo, checked) {
    setSelectedItemNos((current) =>
      checked
        ? [...new Set([...current, itemNo])]
        : current.filter((selectedItemNo) => selectedItemNo !== itemNo),
    );
  }

  async function applyBulkAssignment(fields) {
    const result = await onBulkAssignItems(selectedItemNos, fields);
    if (!result) {
      setSelectedItemNos([]);
      setIsBulkAssignOpen(false);
    }
    return result;
  }

  return (
    <div className="inventory-page">
      <Header
        title="Inventory"
        description="Browse and manage your stocked items"
      />

      <section className="inventory-content" aria-label="Inventory items">
        <div className="inventory-toolbar">
          <div className="inventory-summary">
            <strong>{inventoryItems.length}</strong>
            <span>items</span>
            <span className="inventory-summary-divider" aria-hidden="true">
              ·
            </span>
            <strong>{totalUnits.toLocaleString()}</strong>
            <span>units in stock</span>
          </div>
          <div className="inventory-toolbar-actions">
            {selectedItemNos.length > 0 && (
              <button
                className="inventory-bulk-button"
                type="button"
                onClick={() => setIsBulkAssignOpen(true)}
                disabled={actionsDisabled}
              >
                Assign to {selectedItemNos.length} selected
              </button>
            )}
            <label className="inventory-search">
              <FaSearch aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search name, part no., brand, location..."
                aria-label="Search inventory"
              />
            </label>
            <button
              className="inventory-add-button"
              type="button"
              onClick={() => openModal("add")}
              disabled={actionsDisabled}
            >
              <FaPlus aria-hidden="true" /> Add Item
            </button>
          </div>
        </div>

        {actionError && (
          <p className="inventory-action-error" role="alert">
            {actionError}
          </p>
        )}

        <div className="inventory-table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th scope="col" className="inventory-select-column">
                  <input
                    type="checkbox"
                    checked={allPageItemsSelected}
                    onChange={(event) =>
                      togglePageSelection(event.target.checked)
                    }
                    aria-label="Select all items on this page"
                    disabled={pageItems.length === 0}
                  />
                </th>
                <th scope="col" className="image-column">Image</th>
                <th scope="col">Item</th>
                <th scope="col">Part No.</th>
                <th scope="col">Brand</th>
                <th scope="col">Category</th>
                <th scope="col">Location</th>
                <th scope="col">Machine</th>
                <th scope="col" className="quantity-column">Qty</th>
                <th scope="col" className="inventory-actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => (
                <tr
                  key={item.itemNo}
                  className={
                    selectedItemNos.includes(item.itemNo)
                      ? "inventory-row-selected"
                      : ""
                  }
                >
                  <td className="inventory-select-column">
                    <input
                      type="checkbox"
                      checked={selectedItemNos.includes(item.itemNo)}
                      onChange={(event) =>
                        toggleItemSelection(item.itemNo, event.target.checked)
                      }
                      aria-label={`Select ${item.name}`}
                    />
                  </td>
                  <td className="image-column">
                    <div className="inventory-image">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <FaImage aria-label={`No image for ${item.name}`} />
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="inventory-item-name">{item.name}</span>
                    <span className="inventory-item-number">{item.itemNo}</span>
                  </td>
                  <td>{item.code || "—"}</td>
                  <td>{item.brand || "—"}</td>
                  <td>{item.category || "—"}</td>
                  <td>{getLocation(item) || "—"}</td>
                  <td>
                    {getItemMachines(item)
                      .map((machine) =>
                        typeof machine === "string" ? machine : machine?.number,
                      )
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="quantity-column">{getQuantity(item)}</td>
                  <td>
                    <div className="inventory-row-actions">
                      <button
                        type="button"
                        aria-label={`View ${item.name}`}
                        title="View item details"
                        onClick={() => setViewedItem(item)}
                      >
                        <FaEye />
                      </button>
                      <button
                        type="button"
                        aria-label={`Stock in for ${item.name}`}
                        title="Stock In"
                        onClick={() => openModal("stock-in", item)}
                        disabled={actionsDisabled}
                      >
                        <FaPlus />
                      </button>
                      <button
                        type="button"
                        aria-label={`Stock out for ${item.name}`}
                        title="Stock Out"
                        onClick={() => openModal("stock-out", item)}
                        disabled={actionsDisabled}
                      >
                        <FaMinus />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${item.name}`}
                        title="Edit item details"
                        onClick={() => openModal("edit", item)}
                        disabled={actionsDisabled}
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="delete-action"
                        type="button"
                        aria-label={`Delete ${item.name}`}
                        title="Delete item"
                        onClick={() => removeItem(item)}
                        disabled={actionsDisabled}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="10" className="inventory-empty">
                    {inventoryItems.length === 0
                      ? "No inventory items have been added yet."
                      : "No items match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="inventory-footer">
          <p className="inventory-result-count" aria-live="polite">
            Showing {firstItemNumber}–{lastItemNumber} of {filteredItems.length}{" "}
            items
          </p>
          {pageCount > 1 && (
            <nav className="inventory-pagination" aria-label="Inventory pages">
              <button
                className="pagination-arrow"
                type="button"
                onClick={() => setCurrentPage((page) => page - 1)}
                disabled={safePage === 1}
                aria-label="Go to previous page"
              >
                <FaChevronLeft aria-hidden="true" />
              </button>
              {pageNumbers.map((page) =>
                typeof page === "number" ? (
                  <button
                    className={`pagination-page${page === safePage ? " active" : ""}`}
                    type="button"
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    aria-label={`Go to page ${page}`}
                    aria-current={page === safePage ? "page" : undefined}
                  >
                    {page}
                  </button>
                ) : (
                  <span className="pagination-ellipsis" key={page}>…</span>
                ),
              )}
              <button
                className="pagination-arrow"
                type="button"
                onClick={() => setCurrentPage((page) => page + 1)}
                disabled={safePage === pageCount}
                aria-label="Go to next page"
              >
                <FaChevronRight aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </section>
      {modalAction && (
        <ItemModal
          key={`${modalAction}-${selectedItem?.itemNo || "new"}`}
          action={modalAction}
          item={selectedItem}
          categories={categories}
          machines={machines}
          onClose={closeModal}
          onSaveItem={saveItem}
          onChangeStock={onChangeStock}
        />
      )}
      {isBulkAssignOpen && (
        <BulkAssignModal
          categories={categories}
          machines={machines}
          onClose={() => setIsBulkAssignOpen(false)}
          onApply={applyBulkAssignment}
        />
      )}
      {viewedItem && (
        <ItemDetailsModal
          item={viewedItem}
          onClose={() => setViewedItem(null)}
        />
      )}
    </div>
  );
}
