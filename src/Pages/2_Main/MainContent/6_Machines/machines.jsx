import { useState } from "react";
import { FaCogs, FaEdit, FaPlus, FaTrash } from "react-icons/fa";
import Header from "../../Headers/header.jsx";
import "./machines.scss";

function MachineModal({ machine, onClose, onSave }) {
  const [number, setNumber] = useState(machine?.number || "");
  const [name, setName] = useState(machine?.name || "");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const result = await onSave(machine?.number || "", { number, name });
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
      className="machines-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="machines-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="machines-modal-title"
      >
        <div className="machines-modal-heading">
          <h3 id="machines-modal-title">
            {machine ? "Edit Machine" : "Add Machine"}
          </h3>
          <button
            type="button"
            className="machines-modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        <form className="machines-modal-form" onSubmit={handleSubmit}>
          <label htmlFor="machine-number">Machine number *</label>
          <input
            id="machine-number"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            autoFocus
            required
            maxLength="80"
          />
          <label htmlFor="machine-name">Machine name *</label>
          <input
            id="machine-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength="120"
          />
          {error && (
            <p className="machines-action-error" role="alert">
              {error}
            </p>
          )}
          <div className="machines-modal-actions">
            <button type="button" className="machines-cancel" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="machines-submit" disabled={isSaving}>
              {isSaving ? "Syncing..." : machine ? "Save Changes" : "Add Machine"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Machines({
  inventory,
  onAddMachine,
  onEditMachine,
  onDeleteMachine,
  actionsDisabled = false,
}) {
  const machines = Array.isArray(inventory?.machines) ? inventory.machines : [];
  const items = Array.isArray(inventory?.items) ? inventory.items : [];
  const [modalMachine, setModalMachine] = useState(undefined);
  const [actionError, setActionError] = useState("");

  function itemCount(machineNumber) {
    return items.filter(
      (item) =>
        (Array.isArray(item.machines) ? item.machines : []).some(
          (machine) =>
            String(machine.number || "").trim().toLowerCase() ===
            machineNumber.trim().toLowerCase(),
        ),
    ).length;
  }

  async function saveMachine(previousNumber, fields) {
    const result = await (previousNumber
      ? onEditMachine(previousNumber, fields)
      : onAddMachine(fields));
    if (!result) setActionError("");
    return result;
  }

  async function deleteMachine(machine) {
    const linkedItems = itemCount(machine.number);
    const confirmed = window.confirm(
      `Delete machine ${machine.number} (${machine.name})? ${linkedItems} linked item(s) will be unassigned. This action will be recorded in Transactions.`,
    );
    if (!confirmed) return;
    setActionError((await onDeleteMachine(machine.number)) || "");
  }

  return (
    <div className="machines-page">
      <Header
        title="Machines"
        description="Manage machines and link inventory items to them"
      />
      <section className="machines-content" aria-label="Machines">
        <div className="machines-table-panel">
          <div className="machines-table-heading">
            <div>
              <h3>All Machines</h3>
              <p>Changes sync to Firestore and are logged to Transactions.</p>
            </div>
            <div className="machines-heading-actions">
              <span>{machines.length} machines</span>
              <button
                type="button"
                className="machines-add-button"
                onClick={() => setModalMachine(null)}
                disabled={actionsDisabled}
              >
                <FaPlus aria-hidden="true" /> Add Machine
              </button>
            </div>
          </div>
          {actionError && (
            <p className="machines-action-error machines-page-error" role="alert">
              {actionError}
            </p>
          )}
          <div className="machines-table-wrapper">
            <table className="machines-table">
              <thead>
                <tr>
                  <th scope="col">Machine number</th>
                  <th scope="col">Machine name</th>
                  <th scope="col" className="machines-count-column">
                    Linked items
                  </th>
                  <th scope="col" className="machines-actions-column">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {machines.map((machine) => (
                  <tr key={machine.number}>
                    <td>
                      <span className="machines-number">
                        <FaCogs aria-hidden="true" />
                        {machine.number}
                      </span>
                    </td>
                    <td>{machine.name || "Unnamed machine"}</td>
                    <td className="machines-count-column">
                      {itemCount(String(machine.number))}
                    </td>
                    <td className="machines-actions-column">
                      <div className="machines-row-actions">
                        <button
                          type="button"
                          onClick={() => setModalMachine(machine)}
                          disabled={actionsDisabled}
                          aria-label={`Edit machine ${machine.number}`}
                          title="Edit machine"
                        >
                          <FaEdit />
                        </button>
                        <button
                          type="button"
                          className="machines-delete-action"
                          onClick={() => deleteMachine(machine)}
                          disabled={actionsDisabled}
                          aria-label={`Delete machine ${machine.number}`}
                          title="Delete machine"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {machines.length === 0 && (
                  <tr>
                    <td colSpan="4" className="machines-empty">
                      No machines have been configured yet. Add one to get
                      started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="machines-data-note">
            Editing a machine updates its linked inventory items. Deleting a
            machine leaves those items in inventory as unassigned.
          </p>
        </div>
      </section>
      {modalMachine !== undefined && (
        <MachineModal
          key={modalMachine?.number || "new-machine"}
          machine={modalMachine}
          onClose={() => setModalMachine(undefined)}
          onSave={saveMachine}
        />
      )}
    </div>
  );
}
