import { useEffect, useState } from "react";
import { FaUserAlt, FaUserShield } from "react-icons/fa";
import {
  collection,
  deleteDoc,
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
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Technician");
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubscribeStaff = onSnapshot(
      collection(db, "staff"),
      (snapshot) =>
        setStaff(snapshot.docs.map((entry) => ({ uid: entry.id, ...entry.data() }))),
      (error) => setActionError(`Could not load approved staff: ${error.message}`),
    );
    const unsubscribeInvites = onSnapshot(
      collection(db, "staffInvites"),
      (snapshot) =>
        setInvites(
          snapshot.docs.map((entry) => ({
            id: entry.id,
            ...entry.data(),
          })),
        ),
      (error) => setActionError(`Could not load invitations: ${error.message}`),
    );
    return () => {
      unsubscribeStaff();
      unsubscribeInvites();
    };
  }, []);

  async function createInvite(event) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setActionError("Enter a valid staff email address.");
      return;
    }

    setActionError("");
    setIsSaving(true);
    try {
      if (staff.some((user) => user.email === normalizedEmail)) {
        throw new Error(
          "This email already has a staff record. Manage its access in the staff list.",
        );
      }
      const inviteRef = doc(db, "staffInvites", normalizedEmail);
      await runTransaction(db, async (transaction) => {
        const existingInvite = await transaction.get(inviteRef);
        if (existingInvite.exists()) {
          throw new Error(
            "An invitation already exists for this email. Remove it before creating another.",
          );
        }
        transaction.set(inviteRef, {
          email: normalizedEmail,
          role,
          approved: true,
          createdAt: serverTimestamp(),
        });
      });
      setEmail("");
    } catch (error) {
      setActionError(`Could not create the invitation: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStaff(user, changes) {
    setActionError("");
    try {
      await updateDoc(doc(db, "staff", user.uid), changes);
    } catch (error) {
      setActionError(`Could not update ${user.email}: ${error.message}`);
    }
  }

  async function removeInvite(invite) {
    if (!window.confirm(`Remove the invitation for ${invite.email}?`)) return;
    setActionError("");
    try {
      await deleteDoc(doc(db, "staffInvites", invite.id));
    } catch (error) {
      setActionError(`Could not remove the invitation: ${error.message}`);
    }
  }

  return (
    <div className="users-page">
      <Header
        title="Staff Access"
        description="Invite verified accounts and manage access to the shared inventory"
      />
      <section className="users-content" aria-label="Staff access management">
        <p className="users-security-note">
          Only invited, email-verified accounts can access inventory. Invite the
          email they will use with Google or their Jerks account. An invite is
          claimed automatically after that account signs in.
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
            <span className="users-summary-icon access-level-icon">
              <FaUserShield aria-hidden="true" />
            </span>
            <div>
              <span>Pending invitations</span>
              <strong>{invites.filter((invite) => !invite.claimedUid).length}</strong>
            </div>
          </article>
        </div>

        <div className="users-table-panel">
          <form className="users-toolbar" onSubmit={createInvite}>
            <div>
              <h3>Invite staff</h3>
              <p>They must verify and sign in with this email address.</p>
            </div>
            <label className="users-search">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Staff email"
                aria-label="Staff email"
                required
              />
            </label>
            <select
              className="users-role-select"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              aria-label="Invited access level"
            >
              <option value="Technician">Technician</option>
              <option value="Admin">Admin</option>
            </select>
            <button
              className="users-add-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Invite"}
            </button>
          </form>

          {actionError && (
            <p className="users-action-error users-page-error" role="alert">
              {actionError}
            </p>
          )}

          <div className="users-table-wrapper">
            <table className="users-table">
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
                {staff.map((user) => (
                  <tr key={user.uid}>
                    <td>{user.email}</td>
                    <td>{user.username || "—"}</td>
                    <td>
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
                    <td>{user.approved ? "Approved" : "Revoked"}</td>
                    <td>
                      {user.uid !== currentUser.uid && (
                        <button
                          className="user-delete-button"
                          type="button"
                          onClick={() =>
                            changeStaff(user, { approved: !user.approved })
                          }
                        >
                          {user.approved ? "Revoke" : "Approve"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan="5" className="users-empty">
                      No invited accounts have signed in yet.
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
              <h3>Invitations</h3>
              <p>Remove unused invitations to prevent future account approval.</p>
            </div>
          </div>
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Access level</th>
                  <th scope="col">Status</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td>{invite.role}</td>
                    <td>{invite.claimedUid ? "Claimed" : "Pending"}</td>
                    <td>
                      <button
                        className="user-delete-button"
                        type="button"
                        onClick={() => removeInvite(invite)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {invites.length === 0 && (
                  <tr>
                    <td colSpan="4" className="users-empty">
                      No invitations.
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
