import { useState } from "react";
import {
  FaEdit,
  FaFolderOpen,
  FaPlus,
  FaTrash,
} from "react-icons/fa";
import inventorySeed from "../../../../data/inventory.json";
import Header from "../../Headers/header.jsx";
import "./category.scss";

function getCategoryName(category) {
  if (typeof category === "string") {
    return category.trim();
  }
  if (category && typeof category.name === "string") {
    return category.name.trim();
  }
  return "";
}

function getItemCategory(item) {
  return getCategoryName(item.category);
}

function CategoryModal({ category, onClose, onSave }) {
  const [name, setName] = useState(category?.name || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(category);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const result = await onSave(category?.name || "", name);
      if (result) {
        setError(result);
        return;
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="category-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="category-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
      >
        <div className="category-modal-heading">
          <h3 id="category-modal-title">
            {isEditing ? "Edit Category" : "Add Category"}
          </h3>
          <button
            type="button"
            className="category-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form className="category-modal-form" onSubmit={handleSubmit}>
          <label htmlFor="category-name">Category name</label>
          <input
            id="category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
            maxLength="80"
          />
          {error && (
            <p className="category-action-error" role="alert">
              {error}
            </p>
          )}
          <div className="category-modal-actions">
            <button type="button" className="category-cancel" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="category-submit" disabled={isSaving}>
              {isSaving ? "Syncing..." : isEditing ? "Save Changes" : "Add Category"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Category({
  inventory = inventorySeed,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  actionsDisabled = false,
}) {
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const configuredCategories = Array.isArray(inventory.categories)
    ? inventory.categories
    : [];
  const [modalCategory, setModalCategory] = useState(undefined);
  const [actionError, setActionError] = useState("");
  const categoryNames = new Map();

  for (const category of configuredCategories) {
    const name = getCategoryName(category);
    if (name) categoryNames.set(name.toLowerCase(), name);
  }
  for (const item of items) {
    const name = getItemCategory(item);
    if (name) categoryNames.set(name.toLowerCase(), name);
  }

  const categories = [...categoryNames.values()]
    .map((name) => ({
      name,
      itemCount: items.filter(
        (item) => getItemCategory(item).toLowerCase() === name.toLowerCase(),
      ).length,
    }))
    .sort((first, second) => first.name.localeCompare(second.name));
  const categorizedItemCount = items.filter((item) =>
    getItemCategory(item),
  ).length;
  const uncategorizedItemCount = items.length - categorizedItemCount;
  const displayedCategories = [
    ...categories.map((category) => ({ ...category, isUncategorized: false })),
    ...(uncategorizedItemCount > 0
      ? [
          {
            name: "Uncategorized",
            itemCount: uncategorizedItemCount,
            isUncategorized: true,
          },
        ]
      : []),
  ];

  async function saveCategory(previousName, nextName) {
    const result = await (previousName
      ? onEditCategory(previousName, nextName)
      : onAddCategory(nextName));
    if (!result) setActionError("");
    return result;
  }

  async function deleteCategory(category) {
    const confirmed = window.confirm(
      `Delete "${category.name}"? ${category.itemCount} item(s) will become uncategorized. This action will be recorded in Transactions.`,
    );
    if (!confirmed) return;
    setActionError((await onDeleteCategory(category.name)) || "");
  }

  return (
    <div className="category-page">
      <Header
        title="Categories"
        description="Organize inventory items by category"
      />

      <section className="category-content" aria-label="Inventory categories">
        <div className="category-summary">
          <article className="category-summary-card">
            <div className="category-summary-icon">
              <FaFolderOpen aria-hidden="true" />
            </div>
            <div>
              <span>Categories</span>
              <strong>{categories.length}</strong>
            </div>
          </article>
          <article className="category-summary-card">
            <div className="category-summary-icon">
              <FaFolderOpen aria-hidden="true" />
            </div>
            <div>
              <span>Categorized items</span>
              <strong>{categorizedItemCount.toLocaleString()}</strong>
            </div>
          </article>
          <article className="category-summary-card">
            <div className="category-summary-icon uncategorized">
              <FaFolderOpen aria-hidden="true" />
            </div>
            <div>
              <span>Uncategorized items</span>
              <strong>{uncategorizedItemCount.toLocaleString()}</strong>
            </div>
          </article>
        </div>

        <div className="category-table-panel">
          <div className="category-table-heading">
            <div>
              <h3>All Categories</h3>
              <p>Changes sync to Firestore and are logged to Transactions.</p>
            </div>
            <div className="category-heading-actions">
              <span>{categories.length} categories</span>
              <button
                type="button"
                className="category-add-button"
                onClick={() => setModalCategory(null)}
                disabled={actionsDisabled}
              >
                <FaPlus aria-hidden="true" /> Add Category
              </button>
            </div>
          </div>
          {actionError && (
            <p className="category-action-error category-page-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="category-table-wrapper">
            <table className="category-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className="category-count-column">
                    Items
                  </th>
                  <th scope="col" className="category-actions-column">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedCategories.map((category) => (
                  <tr
                    className={
                      category.isUncategorized
                        ? "uncategorized-category-row"
                        : ""
                    }
                    key={category.name}
                  >
                    <td>
                      <span className="category-name">
                        <FaFolderOpen aria-hidden="true" />
                        {category.name}
                      </span>
                    </td>
                    <td className="category-count-column">
                      {category.itemCount.toLocaleString()}
                    </td>
                    <td className="category-actions-column">
                      {!category.isUncategorized && (
                        <div className="category-row-actions">
                          <button
                            type="button"
                            onClick={() => setModalCategory(category)}
                            disabled={actionsDisabled}
                            aria-label={`Edit ${category.name}`}
                            title="Edit category"
                          >
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            className="category-delete-action"
                            onClick={() => deleteCategory(category)}
                            disabled={actionsDisabled}
                            aria-label={`Delete ${category.name}`}
                            title="Delete category"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {displayedCategories.length === 0 && (
                  <tr>
                    <td colSpan="3" className="category-empty">
                      No categories have been configured yet. Add one to get
                      started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="category-data-note">
            Renaming a category updates the items assigned to it. Deleting a
            category leaves its items in inventory as uncategorized.
          </p>
        </div>
      </section>
      {modalCategory !== undefined && (
        <CategoryModal
          key={modalCategory?.name || "new-category"}
          category={modalCategory}
          onClose={() => setModalCategory(undefined)}
          onSave={saveCategory}
        />
      )}
    </div>
  );
}
