import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  Camera,
  CameraDirection,
  CameraResultType,
  CameraSource,
} from "@capacitor/camera";
import {
  FaChevronLeft,
  FaChevronDown,
  FaChevronRight,
  FaCamera,
  FaEdit,
  FaEye,
  FaImage,
  FaMinus,
  FaPlus,
  FaSave,
  FaSearch,
  FaTrash,
} from "react-icons/fa";
import useBodyScrollLock from "../../../../useBodyScrollLock.js";
import {
  exportInventoryExcel,
  exportInventoryPdf,
} from "../../../../data/inventoryExports.js";
import Header from "../../Headers/header.jsx";
import "./inventory.scss";

const pageSizeOptions = [10, 20, 50, 100];
const lowStockThreshold = 5;

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

function getStockStatus(item) {
  const quantity = getQuantity(item);
  if (quantity <= 0) return "out";
  if (quantity <= lowStockThreshold) return "low";
  return "in";
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

function getItemMachineStationUsage(item, machineNumber) {
  const usage = Array.isArray(item?.machineStationUsage)
    ? item.machineStationUsage.find(
        (entry) =>
          String(entry.machineNumber || "").trim().toLowerCase() ===
          String(machineNumber || "").trim().toLowerCase(),
      )
    : null;
  return Array.isArray(usage?.stations) ? usage.stations : null;
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

function ItemDetailsModal({ item, transactions, onClose }) {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const stockEntries = Array.isArray(item.stock) ? item.stock : [];
  const machines = getItemMachines(item);
  const itemHistory = transactions
    .filter((transaction) => transaction.itemNo === item.itemNo)
    .sort(
      (first, second) =>
        (Date.parse(second.timestamp) || 0) -
        (Date.parse(first.timestamp) || 0),
    );
  if (
    item.dateCreated &&
    !itemHistory.some((entry) => entry.transactionType === "Item Added")
  ) {
    itemHistory.push({
      transactionNo: `created-${item.itemNo}`,
      transactionType: "Item Added",
      timestamp: item.dateCreated,
      quantity: 0,
      reason: "Item added to inventory",
    });
    itemHistory.sort(
      (first, second) =>
        (Date.parse(second.timestamp) || 0) -
        (Date.parse(first.timestamp) || 0),
    );
  }
  const details = [
    ["Item number", item.itemNo],
    ["Part number", item.code],
    ["Brand", item.brand],
    ["Category", getCategoryName(item.category) || "Uncategorized"],
    [
      "Machines",
      machines
        .map((machine) => {
          const number = typeof machine === "string" ? machine : machine?.number;
          const name =
            typeof machine === "string"
              ? ""
              : machine?.name
                ? ` — ${machine.name}`
                : "";
          const usedAt = getItemMachineStationUsage(item, number);
          return `${number || ""}${name}${
            usedAt?.length ? ` (used at: ${usedAt.join(", ")})` : ""
          }`;
        })
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
          <section className="inventory-details-history">
            <button
              type="button"
              className="inventory-history-toggle"
              aria-expanded={isHistoryExpanded}
              onClick={() => setIsHistoryExpanded((expanded) => !expanded)}
            >
              <span>
                Item history <span>({itemHistory.length})</span>
              </span>
              <FaChevronDown
                className={isHistoryExpanded ? "is-expanded" : ""}
                aria-hidden="true"
              />
            </button>
            {isHistoryExpanded &&
              (itemHistory.length > 0 ? (
                <ul>
                  {itemHistory.map((entry, index) => (
                    <li
                      key={
                        entry.transactionNo ||
                        `${entry.transactionType}-${entry.timestamp}-${index}`
                      }
                    >
                      <div>
                        <strong>
                          {entry.transactionType || "Inventory update"}
                        </strong>
                        <span>
                          {formatDetailDate(entry.timestamp)}
                          {entry.userName ? ` · ${entry.userName}` : ""}
                        </span>
                        {entry.machineNumber && (
                          <span>
                            Machine: {entry.machineNumber}
                            {entry.machineName ? ` — ${entry.machineName}` : ""}
                          </span>
                        )}
                        {entry.station && (
                          <span>Machine location: {entry.station}</span>
                        )}
                        {entry.reason && <span>{entry.reason}</span>}
                      </div>
                      <span className="inventory-history-quantity">
                        {Number(entry.quantity) > 0
                          ? `${entry.quantity} units`
                          : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No history recorded for this item yet.</p>
              ))}
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
    machineStationUsage: Object.fromEntries(
      (Array.isArray(item?.machineStationUsage)
        ? item.machineStationUsage
        : []
      ).map((usage) => [usage.machineNumber, usage.stations || []]),
    ),
    specification: item?.specification || "",
    description: item?.description || "",
    image: item?.image || "",
    location: item?.stock?.[0]?.location || "",
  });
  const [stockIndex, setStockIndex] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [machineNumber, setMachineNumber] = useState("");
  const [station, setStation] = useState("");
  const [error, setError] = useState("");
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const stockEntries = Array.isArray(item?.stock) ? item.stock : [];
  const selectedStock = stockEntries[stockIndex];
  const assignedMachines = getItemMachines(item)
    .map((assignedMachine) => {
      const number =
        typeof assignedMachine === "string"
          ? assignedMachine
          : assignedMachine?.number;
      return (
        machines.find(
          (machine) =>
            String(machine.number).trim().toLowerCase() ===
            String(number || "").trim().toLowerCase(),
        ) ||
        (typeof assignedMachine === "string"
          ? { number: assignedMachine }
          : assignedMachine)
      );
    })
    .filter((machine) => machine?.number);
  const selectedMachine = assignedMachines.find(
    (machine) =>
      String(machine.number).trim().toLowerCase() ===
      machineNumber.trim().toLowerCase(),
  );
  const stationOptions = Array.isArray(selectedMachine?.stations)
    ? selectedMachine.stations
        .map((entry) =>
          typeof entry === "string"
            ? entry.trim()
            : String(entry?.name || entry?.stationName || "").trim(),
        )
        .filter(Boolean)
    : [];
  const configuredStations = getItemMachineStationUsage(item, machineNumber);
  const allowedStations = configuredStations?.length
    ? stationOptions.filter((stationOption) =>
        configuredStations.some(
          (configuredStation) =>
            String(configuredStation).trim().toLowerCase() ===
            stationOption.toLowerCase(),
        ),
      )
    : stationOptions;

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
          machineNumber,
          station,
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
        className={`inventory-modal${isStockAction ? "" : " inventory-item-editor-modal"}`}
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
              {action === "stock-out" && assignedMachines.length > 0 && (
                <>
                  <label>
                    Machine
                    <select
                      value={machineNumber}
                      onChange={(event) => {
                        setMachineNumber(event.target.value);
                        setStation("");
                      }}
                      required
                    >
                      <option value="">Select a machine</option>
                      {assignedMachines.map((machine) => (
                        <option value={machine.number} key={machine.number}>
                          {machine.number}
                          {machine.name ? ` — ${machine.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedMachine && allowedStations.length > 0 && (
                    <label>
                      Machine location
                      <select
                        value={station}
                        onChange={(event) => setStation(event.target.value)}
                        required
                      >
                        <option value="">Select a machine location</option>
                        {allowedStations.map((stationName) => (
                          <option value={stationName} key={stationName}>
                            {stationName}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedMachine && allowedStations.length === 0 && (
                    <p className="stock-location-note">
                      {stationOptions.length === 0
                        ? "Add at least one machine location from the Machines page before recording stock out for this machine."
                        : "The locations selected for this item are no longer available. Update the item or machine locations before recording stock out."}
                    </p>
                  )}
                </>
              )}
              <label>
                {action === "stock-out" ? "Quantity used" : "Quantity"}
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
                    const machineStations = Array.isArray(machine.stations)
                      ? machine.stations
                          .map((entry) =>
                            typeof entry === "string"
                              ? entry.trim()
                              : String(
                                  entry?.name || entry?.stationName || "",
                                ).trim(),
                          )
                          .filter(Boolean)
                      : [];
                    const selectedStations =
                      fields.machineStationUsage[machine.number] || [];
                    return (
                      <div
                        className="inventory-machine-assignment"
                        key={machine.number}
                      >
                        <button
                          className={`inventory-machine-option${isSelected ? " selected" : ""}`}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setFields((currentFields) => ({
                              ...currentFields,
                              machineNumbers: isSelected
                                ? currentFields.machineNumbers.filter(
                                    (number) =>
                                      String(number).trim().toLowerCase() !==
                                      String(machine.number)
                                        .trim()
                                        .toLowerCase(),
                                  )
                                : [
                                    ...currentFields.machineNumbers,
                                    machine.number,
                                  ],
                              machineStationUsage: isSelected
                                ? Object.fromEntries(
                                    Object.entries(
                                      currentFields.machineStationUsage,
                                    ).filter(
                                      ([number]) =>
                                        number.trim().toLowerCase() !==
                                        machine.number.trim().toLowerCase(),
                                    ),
                                  )
                                : currentFields.machineStationUsage,
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
                        {isSelected && machineStations.length > 0 && (
                          <fieldset className="inventory-machine-stations">
                            <legend>Machine locations used (optional)</legend>
                            <p>
                              Leave all unchecked to allow any location during
                              Stock Out.
                            </p>
                            {machineStations.map((stationName) => {
                              const isStationSelected = selectedStations.some(
                                (selectedStation) =>
                                  String(selectedStation)
                                    .trim()
                                    .toLowerCase() ===
                                  stationName.toLowerCase(),
                              );
                              return (
                                <label key={stationName}>
                                  <input
                                    type="checkbox"
                                    checked={isStationSelected}
                                    onChange={() =>
                                      setFields((currentFields) => {
                                        const currentStations =
                                          currentFields.machineStationUsage[
                                            machine.number
                                          ] || [];
                                        return {
                                          ...currentFields,
                                          machineStationUsage: {
                                            ...currentFields.machineStationUsage,
                                            [machine.number]: isStationSelected
                                              ? currentStations.filter(
                                                  (entry) =>
                                                    String(entry)
                                                      .toLowerCase() !==
                                                    stationName.toLowerCase(),
                                                )
                                              : [
                                                  ...currentStations,
                                                  stationName,
                                                ],
                                          },
                                        };
                                      })
                                    }
                                  />
                                  {stationName}
                                </label>
                              );
                            })}
                          </fieldset>
                        )}
                        {isSelected && machineStations.length === 0 && (
                          <p className="inventory-machine-stations-empty">
                            Add locations to this machine to optionally specify
                            where this item is used.
                          </p>
                        )}
                      </div>
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
  focusItemNo = "",
  actionsDisabled = false,
}) {
  const inventoryItems = Array.isArray(inventory?.items) ? inventory.items : [];
  const focusedItemIndex = focusItemNo
    ? inventoryItems.findIndex((item) => item.itemNo === focusItemNo)
    : -1;
  const itemRowRefs = useRef(new Map());
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);
  const transactions = Array.isArray(inventory?.transactions)
    ? inventory.transactions
    : [];
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(
    focusedItemIndex >= 0
      ? Math.floor(focusedItemIndex / pageSize) + 1
      : 1,
  );
  const [modalAction, setModalAction] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [expandedItemNos, setExpandedItemNos] = useState(() => new Set());
  const [viewedItem, setViewedItem] = useState(
    focusedItemIndex >= 0 ? inventoryItems[focusedItemIndex] : null,
  );
  const [actionError, setActionError] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [selectedItemNos, setSelectedItemNos] = useState([]);
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [machineFilter, setMachineFilter] = useState("");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [exportFormat, setExportFormat] = useState("excel");
  const [isExporting, setIsExporting] = useState(false);
  useBodyScrollLock(
    Boolean(modalAction || selectedItem || viewedItem || isBulkAssignOpen || isExportModalOpen),
  );
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
  const locations = [
    ...new Set(
      inventoryItems.flatMap((item) =>
        (Array.isArray(item.stock) ? item.stock : [])
          .map((stock) => String(stock.location || "").trim())
          .filter(Boolean),
      ),
    ),
  ].sort((first, second) => first.localeCompare(second));
  const availableMachines = Array.isArray(machines) ? machines : [];
  const query = search.trim().toLowerCase();
  const filteredItems = inventoryItems.filter((item) => {
    const itemMachines = getItemMachines(item).map((machine) =>
      typeof machine === "string" ? machine : machine?.number,
    );
    const itemLocations = Array.isArray(item.stock)
      ? item.stock.map((stock) => String(stock.location || "").trim())
      : [];
    const searchableValues = [
      item.itemNo,
      item.code,
      item.name,
      item.brand,
      getCategoryName(item.category),
      getLocation(item),
      itemMachines.join(" "),
    ];
    return (
      searchableValues
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)) &&
      (!categoryFilter ||
        getCategoryName(item.category).toLowerCase() ===
          categoryFilter.toLowerCase()) &&
      (!stockStatusFilter || getStockStatus(item) === stockStatusFilter) &&
      (!locationFilter || itemLocations.includes(locationFilter)) &&
      (!machineFilter ||
        itemMachines.some(
          (number) =>
            String(number || "").trim().toLowerCase() ===
            machineFilter.toLowerCase(),
        ))
    );
  });
  const activeFilters = Boolean(
    search || categoryFilter || stockStatusFilter || locationFilter || machineFilter,
  );
  const activeFilterCount = [
    search,
    categoryFilter,
    stockStatusFilter,
    locationFilter,
    machineFilter,
  ].filter(Boolean).length;
  const exportItems =
    exportScope === "filtered" ? filteredItems : inventoryItems;
  const pageCount = Math.ceil(filteredItems.length / pageSize);
  const safePage = Math.min(currentPage, Math.max(pageCount, 1));
  const pageNumbers = getPageNumbers(safePage, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = filteredItems.slice(pageStart, pageStart + pageSize);
  const allPageItemsSelected =
    pageItems.length > 0 &&
    pageItems.every((item) => selectedItemNos.includes(item.itemNo));
  const firstItemNumber = filteredItems.length === 0 ? 0 : pageStart + 1;
  const lastItemNumber = Math.min(pageStart + pageSize, filteredItems.length);
  const totalUnits = inventoryItems.reduce(
    (total, item) => total + getQuantity(item),
    0,
  );

  useEffect(() => {
    if (!focusItemNo) return;
    itemRowRefs.current
      .get(focusItemNo)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusItemNo]);

  function goToPage(page) {
    setCurrentPage(page);
    document
      .querySelector(".main-content-container.inventory-scroll-container")
      ?.scrollTo({ top: 0 });
  }

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
      const remainingFilteredItems =
        filteredItems.length -
        (filteredItems.some((filteredItem) => filteredItem.itemNo === item.itemNo)
          ? 1
          : 0);
      setCurrentPage((page) =>
        Math.min(
          page,
          Math.max(Math.ceil(remainingFilteredItems / pageSize), 1),
        ),
      );
    }
  }

  function toggleFilteredSelection(checked) {
    const pageItemNos = pageItems.map((item) => item.itemNo);
    setSelectedItemNos((current) =>
      checked
        ? [...new Set([...current, ...pageItemNos])]
        : current.filter((itemNo) => !pageItemNos.includes(itemNo)),
    );
  }

  function toggleItemDetails(itemNo) {
    setExpandedItemNos((current) => {
      const next = new Set(current);
      if (next.has(itemNo)) {
        next.delete(itemNo);
      } else {
        next.add(itemNo);
      }
      return next;
    });
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

  function clearFilters() {
    setSearch("");
    setCategoryFilter("");
    setStockStatusFilter("");
    setLocationFilter("");
    setMachineFilter("");
    setCurrentPage(1);
  }

  async function exportInventory(format) {
    if (exportItems.length === 0) return;
    setIsExporting(true);
    setActionError("");
    setExportStatus("");
    try {
      if (format === "excel") {
        await exportInventoryExcel(exportItems);
      } else if (format === "pdf") {
        await exportInventoryPdf(exportItems);
      } else {
        throw new Error(`Unsupported export format: ${format}`);
      }
      const formatLabel = format === "excel" ? "Excel" : "PDF";
      const scopeLabel =
        exportScope === "filtered" ? "matching" : "full inventory";
      setExportStatus(
        `Saved ${exportItems.length} ${scopeLabel} items as ${formatLabel}.`,
      );
      setIsExportModalOpen(false);
    } catch (error) {
      setActionError(`Could not export inventory: ${error.message}`);
      setExportStatus("");
    } finally {
      setIsExporting(false);
    }
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
            <button
              className="inventory-save-button"
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              disabled={isExporting || inventoryItems.length === 0}
            >
              <FaSave aria-hidden="true" /> Save inventory
            </button>
          </div>
        </div>

        <div className="inventory-filter-dropdown">
          <div className="inventory-filter-dropdown-header">
            <button
              className="inventory-filter-toggle"
              type="button"
              onClick={() => setIsFilterPanelOpen((open) => !open)}
              aria-expanded={isFilterPanelOpen}
              aria-controls="inventory-filter-options"
            >
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="inventory-filter-badge">
                  {activeFilterCount}
                </span>
              )}
              <span className="inventory-filter-toggle-count" aria-live="polite">
                {filteredItems.length.toLocaleString()}{" "}
                {activeFilters ? "matching items" : "items"}
              </span>
              <FaChevronDown
                className={isFilterPanelOpen ? "expanded" : ""}
                aria-hidden="true"
              />
            </button>
            {activeFilters && (
              <button
                type="button"
                className="inventory-clear-filters"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
          {isFilterPanelOpen && (
        <div
          className="inventory-filter-panel"
          id="inventory-filter-options"
          aria-label="Filter inventory"
        >
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option value={category} key={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stock status
            <select
              value={stockStatusFilter}
              onChange={(event) => {
                setStockStatusFilter(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All stock statuses</option>
              <option value="in">In stock (&gt; 5)</option>
              <option value="low">Low stock (1–5)</option>
              <option value="out">Out of stock (0)</option>
            </select>
          </label>
          <label>
            Storage location
            <select
              value={locationFilter}
              onChange={(event) => {
                setLocationFilter(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All locations</option>
              {locations.map((location) => (
                <option value={location} key={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigned machine
            <select
              value={machineFilter}
              onChange={(event) => {
                setMachineFilter(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">All machines</option>
              {availableMachines.map((machine) => (
                <option value={machine.number} key={machine.number}>
                  {machine.number}
                  {machine.name ? ` — ${machine.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
          )}
        </div>

        {actionError && (
          <p className="inventory-action-error" role="alert">
            {actionError}
          </p>
        )}
        {exportStatus && (
          <p className="inventory-export-status" role="status">
            {exportStatus}
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
                      toggleFilteredSelection(event.target.checked)
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
                  ref={(element) => {
                    if (element) {
                      itemRowRefs.current.set(item.itemNo, element);
                    } else {
                      itemRowRefs.current.delete(item.itemNo);
                    }
                  }}
                  className={
                    [
                      selectedItemNos.includes(item.itemNo)
                        ? "inventory-row-selected"
                        : "",
                      expandedItemNos.has(item.itemNo)
                        ? "inventory-row-expanded"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                >
                  <td className="inventory-select-column" data-label="Select">
                    <input
                      type="checkbox"
                      checked={selectedItemNos.includes(item.itemNo)}
                      onChange={(event) =>
                        toggleItemSelection(item.itemNo, event.target.checked)
                      }
                      aria-label={`Select ${item.name}`}
                    />
                  </td>
                  <td className="image-column" data-label="Image">
                    <div className="inventory-image">
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <FaImage aria-label={`No image for ${item.name}`} />
                      )}
                    </div>
                  </td>
                  <td data-label="Item">
                    <span className="inventory-item-name">{item.name}</span>
                    <span className="inventory-item-number">{item.itemNo}</span>
                    <button
                      className="inventory-row-details-toggle"
                      type="button"
                      onClick={() => toggleItemDetails(item.itemNo)}
                      aria-expanded={expandedItemNos.has(item.itemNo)}
                      aria-label={`${expandedItemNos.has(item.itemNo) ? "Hide" : "Show"} details for ${item.name}`}
                    >
                      <span>
                        {expandedItemNos.has(item.itemNo)
                          ? "Hide details"
                          : "Details"}
                      </span>
                      <FaChevronDown
                        className={
                          expandedItemNos.has(item.itemNo) ? "expanded" : ""
                        }
                        aria-hidden="true"
                      />
                    </button>
                  </td>
                  <td data-label="Part No.">{item.code || "—"}</td>
                  <td data-label="Brand">{item.brand || "—"}</td>
                  <td data-label="Category">{item.category || "—"}</td>
                  <td data-label="Location">{getLocation(item) || "—"}</td>
                  <td data-label="Machine">
                    {getItemMachines(item)
                      .map((machine) =>
                        typeof machine === "string" ? machine : machine?.number,
                      )
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="quantity-column" data-label="Qty">
                    {getQuantity(item)}
                  </td>
                  <td data-label="Actions">
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
            Showing {firstItemNumber}–{lastItemNumber} of{" "}
            {filteredItems.length.toLocaleString()} items
          </p>
          <div className="inventory-pagination-controls">
            <label className="inventory-page-size">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((size) => (
                  <option value={size} key={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            {pageCount > 1 && (
              <nav className="inventory-pagination" aria-label="Inventory pages">
                <button
                  className="pagination-arrow"
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
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
                      onClick={() => goToPage(page)}
                      aria-label={`Go to page ${page}`}
                      aria-current={page === safePage ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ) : (
                    <span className="pagination-ellipsis" key={page}>
                      …
                    </span>
                  ),
                )}
                <button
                  className="pagination-arrow"
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage === pageCount}
                  aria-label="Go to next page"
                >
                  <FaChevronRight aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>
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
      {isExportModalOpen && (
        <div
          className="inventory-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isExporting) {
              setIsExportModalOpen(false);
            }
          }}
        >
          <section
            className="inventory-modal inventory-save-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-save-modal-title"
          >
            <div className="inventory-modal-heading">
              <div>
                <h3 id="inventory-save-modal-title">Save inventory</h3>
                <p>Choose which items to save and a file format.</p>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                aria-label="Close save inventory dialog"
              >
                ×
              </button>
            </div>
            <form
              className="inventory-modal-form"
              onSubmit={(event) => {
                event.preventDefault();
                exportInventory(exportFormat);
              }}
            >
              <fieldset className="inventory-save-options">
                <legend>Items to save</legend>
                <label>
                  <input
                    type="radio"
                    name="inventory-export-scope"
                    value="filtered"
                    checked={exportScope === "filtered"}
                    onChange={() => setExportScope("filtered")}
                  />
                  <span>
                    <strong>Filtered results</strong>
                    <small>
                      {filteredItems.length} matching item
                      {filteredItems.length === 1 ? "" : "s"}
                    </small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="inventory-export-scope"
                    value="all"
                    checked={exportScope === "all"}
                    onChange={() => setExportScope("all")}
                  />
                  <span>
                    <strong>Full inventory</strong>
                    <small>
                      {inventoryItems.length} item
                      {inventoryItems.length === 1 ? "" : "s"}
                    </small>
                  </span>
                </label>
              </fieldset>
              <fieldset className="inventory-save-options">
                <legend>File format</legend>
                <label>
                  <input
                    type="radio"
                    name="inventory-export-format"
                    value="excel"
                    checked={exportFormat === "excel"}
                    onChange={() => setExportFormat("excel")}
                  />
                  <span>
                    <strong>Excel workbook</strong>
                    <small>.xlsx</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="inventory-export-format"
                    value="pdf"
                    checked={exportFormat === "pdf"}
                    onChange={() => setExportFormat("pdf")}
                  />
                  <span>
                    <strong>PDF document</strong>
                    <small>.pdf</small>
                  </span>
                </label>
              </fieldset>
              <p className="inventory-save-preview">
                {exportItems.length} item{exportItems.length === 1 ? "" : "s"}{" "}
                will be saved as{" "}
                {exportFormat === "excel"
                  ? "an Excel workbook"
                  : "a PDF document"}
                .
              </p>
              {exportItems.length === 0 && (
                <p className="inventory-action-error" role="status">
                  There are no matching items to save. Choose full inventory or
                  adjust the filters.
                </p>
              )}
              {actionError && (
                <p className="inventory-action-error" role="alert">
                  {actionError}
                </p>
              )}
              <div className="inventory-modal-actions">
                <button
                  type="button"
                  className="modal-cancel"
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={isExporting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-submit"
                  disabled={isExporting || exportItems.length === 0}
                >
                  {isExporting ? "Saving..." : "Save file"}
                </button>
              </div>
            </form>
          </section>
        </div>
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
          transactions={transactions}
          onClose={() => setViewedItem(null)}
        />
      )}
    </div>
  );
}
