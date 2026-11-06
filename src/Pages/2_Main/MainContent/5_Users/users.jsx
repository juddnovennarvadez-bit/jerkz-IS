import { useEffect, useState } from "react";
import { FaChevronDown, FaUserAlt, FaUserShield } from "react-icons/fa";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../../../firebase.js";
import Header from "../../Headers/header.jsx";
import "./users.scss";

export default function Users({ currentUser }) {
  const [staff, setStaff] = useState([]);
  const [requests, setRequests] = useState([]);
  const [actionError, setActionError] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [busyStaffId, setBusyStaffId] = useState("");
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  useEffect(() => {
    const unsubscribeStaff = onSnapshot(
      collection(db, "staff"),
      (snapshot) =>
        setStaff(snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() }))),
      (error) => setActionError(`Could not load approved staff: ${error.message}`),
    );
    const unsubscribeRequests = onSnapshot(
      collection(db, "staffRequests"),
      (snapshot) =>
        setRequests(
          snapshot.docs.map((entry) => ({
            id: entry.id,
            ...entry.data(),
          })),
        ),
      (error) =>
        setActionError(`Could not load access requests: ${error.message}`),
    );
    return () => {
      unsubscribeStaff();
      unsubscribeRequests();
    };
  }, []);

  async function changeStaff(user, changes) {
    setActionError("");
    try {
      await updateDoc(doc(db, "staff", user.uid), changes);
    } catch (error) {
      setActionError(`Could not update ${user.email}: ${error.message}`);
    }
  }

  async function removeStaff(user) {
    const confirmed = window.confirm(
      `Permanently remove ${user.email} from staff access? Their Firebase login account will remain and they can request access again.`,
    );
    if (!confirmed) return;

    setActionError("");
    setBusyStaffId(user.uid);
    try {
      const staffRef = doc(db, "staff", user.uid);
      const requestRef = doc(db, "staffRequests", user.uid);
      await runTransaction(db, async (transaction) => {
        const staffSnapshot = await transaction.get(staffRef);
        const requestSnapshot = await transaction.get(requestRef);
        if (!staffSnapshot.exists()) {
          throw new Error("This staff account has already been removed.");
        }

        transaction.delete(staffRef);
        if (requestSnapshot.exists()) {
          transaction.delete(requestRef);
        }
      });
    } catch (error) {
      setActionError(`Could not permanently remove ${user.email}: ${error.message}`);
    } finally {
      setBusyStaffId("");
    }
  }

  async function reviewRequest(request, decision) {
    setActionError("");
    setBusyRequestId(request.id);
    try {
      const requestRef = doc(db, "staffRequests", request.id);
      const staffRef = doc(db, "staff", request.id);
      await runTransaction(db, async (transaction) => {
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists()) {
          throw new Error("This access request no longer exists.");
        }
        const latestRequest = requestSnapshot.data();
        if (latestRequest.status !== "pending") {
          throw new Error("This access request has already been reviewed.");
        }

        if (decision === "approve") {
          const staffSnapshot = await transaction.get(staffRef);
          const existingStaff = staffSnapshot.exists()
            ? staffSnapshot.data()
            : {};
          transaction.set(staffRef, {
            email: latestRequest.email,
            username:
              latestRequest.username ||
              existingStaff.username ||
              latestRequest.email.split("@")[0],
            role: "Technician",
            approved: true,
            createdAt: existingStaff.createdAt || serverTimestamp(),
          });
        }

        transaction.update(requestRef, {
          status: decision === "approve" ? "approved" : "rejected",
          reviewedBy: currentUser.uid,
          reviewedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      setActionError(`Could not review the access request: ${error.message}`);
    } finally {
      setBusyRequestId("");
    }
  }

  function toggleRowDetails(rowId) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  const sortedRequests = [...requests].sort((first, second) => {
    if (first.status === "pending" && second.status !== "pending") return -1;
    if (second.status === "pending" && first.status !== "pending") return 1;
    return (
      (second.requestedAt?.toMillis?.() || 0) -
      (first.requestedAt?.toMillis?.() || 0)
    );
  });

  return (
    <div className="users-page">
      <Header
        title="Staff Access"
        description="Review access requests and manage approved staff"
      />
      <section className="users-content" aria-label="Staff access management">
        <p className="users-security-note">
          Verified email and Google accounts must request access. Admin approval
          grants Technician access to the shared inventory.
        </p>

        <div className="users-summary">
          <article className="users-summary-card">
            <span className="users-summary-icon">
              <FaUserAlt aria-hidden="true" />
            </span>
            <div>
              <span>Approved accounts</span>
              <strong>{staff.filter((user) => user.approved).length}</strong>
            </div>
          </article>
          <article className="users-summary-card">
            <span className="users-summary-icon access-request-icon">
              <FaUserShield aria-hidden="true" />
            </span>
            <div>
              <span>Access requests</span>
              <strong>
                {requests.filter((request) => request.status === "pending").length}
              </strong>
            </div>
          </article>
        </div>

        {actionError && (
          <p className="users-action-error users-page-error" role="alert">
            {actionError}
          </p>
        )}

        <div className="users-table-panel">
          <div className="users-toolbar">
            <div>
              <h3>Access requests</h3>
              <p>Approve requests to grant Technician access, or reject them.</p>
            </div>
          </div>
          <div className="users-table-wrapper">
            <table className="users-table users-requests-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Username</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {sortedRequests.map((request) => {
                  const rowId = `request-${request.id}`;
                  const isExpanded = expandedRows.has(rowId);
                  return (
                  <tr
                    key={request.id}
                    className={isExpanded ? "user-row-expanded" : ""}
                  >
                    <td data-label="Email">
                      {request.email}
                      <button
                        className="users-row-details-toggle"
                        type="button"
                        onClick={() => toggleRowDetails(rowId)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} details for ${request.email}`}
                      >
                        <span>{isExpanded ? "Hide details" : "Details"}</span>
                        <FaChevronDown
                          className={isExpanded ? "expanded" : ""}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                    <td data-label="Username">{request.username || "—"}</td>
                    <td data-label="Status">{request.status}</td>
                    <td className="user-row-actions" data-label="Manage">
                      {request.status === "pending" && (
                        <>
                          <button
                            type="button"
                            disabled={busyRequestId === request.id}
                            onClick={() => reviewRequest(request, "approve")}
                          >
                            {busyRequestId === request.id
                              ? "Saving..."
                              : "Approve"}
                          </button>
                          <button
                            className="user-delete-button"
                            type="button"
                            disabled={busyRequestId === request.id}
                            onClick={() => reviewRequest(request, "reject")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan="4" className="users-empty">
                      No access requests.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="users-table-panel">
          <div className="users-toolbar">
            <div>
              <h3>Staff accounts</h3>
              <p>
                Manage access or permanently remove a staff record. Removal
                does not delete the Firebase login account.
              </p>
            </div>
          </div>
          <div className="users-table-wrapper">
            <table className="users-table users-staff-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Username</th>
                  <th scope="col">Access level</th>
                  <th scope="col">Status</th>
                  <th scope="col">Manage</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((user) => {
                  const rowId = `staff-${user.uid}`;
                  const isExpanded = expandedRows.has(rowId);
                  return (
                  <tr
                    key={user.uid}
                    className={isExpanded ? "user-row-expanded" : ""}
                  >
                    <td data-label="Email">
                      {user.email}
                      <button
                        className="users-row-details-toggle"
                        type="button"
                        onClick={() => toggleRowDetails(rowId)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} details for ${user.email}`}
                      >
                        <span>{isExpanded ? "Hide details" : "Details"}</span>
                        <FaChevronDown
                          className={isExpanded ? "expanded" : ""}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                    <td data-label="Username">{user.username || "—"}</td>
                    <td data-label="Access level">
                      <select
                        value={user.role}
                        onChange={(event) =>
                          changeStaff(user, { role: event.target.value })
                        }
                        disabled={user.uid === currentUser.uid}
                        aria-label={`Access level for ${user.email}`}
                      >
                        <option value="Technician">Technician</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </td>
                    <td data-label="Status">
                      {user.approved ? "Approved" : "Revoked"}
                    </td>
                    <td className="user-row-actions" data-label="Manage">
                      {user.uid !== currentUser.uid && (
                        <>
                          <button
                            type="button"
                            disabled={busyStaffId === user.uid}
                            onClick={() =>
                              changeStaff(user, { approved: !user.approved })
                            }
                          >
                            {user.approved ? "Revoke" : "Approve"}
                          </button>
                          <button
                            className="user-delete-button"
                            type="button"
                            disabled={busyStaffId === user.uid}
                            onClick={() => removeStaff(user)}
                          >
                            {busyStaffId === user.uid
                              ? "Removing..."
                              : "Remove permanently"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan="5" className="users-empty">
                      No staff accounts have been approved yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="users-security-note">
          {currentUser.email} is the initial Admin account. Inventory access is
          enforced by Firestore security rules, not just by this screen.
        </p>
      </section>
    </div>
  );
}
