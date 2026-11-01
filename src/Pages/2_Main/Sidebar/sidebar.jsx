import "./sidebar.scss";
import logo2 from "../../../assets/jerks-logo 2.png";
import {
  FaHome,
  FaFolderOpen,
  FaBoxOpen,
  FaExchangeAlt,
  FaCogs,
  FaUserAlt,
  FaSignOutAlt,
} from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
export default function Sidebar({
  activePage,
  setActivePage,
  currentUser,
  onLogout,
}) {
  const isAdmin = currentUser?.role?.toLowerCase() === "admin";
  const [isMobileLogoutRevealed, setIsMobileLogoutRevealed] = useState(false);
  const logoutHoldTimer = useRef(null);
  const mobileLogoutButton = useRef(null);

  useEffect(
    () => () => {
      window.clearTimeout(logoutHoldTimer.current);
    },
    [],
  );

  function startLogoutHold(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    window.clearTimeout(logoutHoldTimer.current);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    logoutHoldTimer.current = window.setTimeout(
      () => setIsMobileLogoutRevealed(true),
      350,
    );
  }

  function finishLogoutHold(event) {
    window.clearTimeout(logoutHoldTimer.current);
    logoutHoldTimer.current = null;
    if (!isMobileLogoutRevealed) return;

    const bounds = mobileLogoutButton.current?.getBoundingClientRect();
    if (
      bounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
    ) {
      onLogout();
    }
  }

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <img src={logo2} alt="Jerks Logo" />
      <div className="sidebar-links">
        <button
          className={activePage === "dashboard" ? "active" : ""}
          onClick={() => setActivePage("dashboard")}
        >
          <FaHome /> <span>Dashboard</span>
        </button>
        <button
          className={activePage === "inventory" ? "active" : ""}
          onClick={() => setActivePage("inventory")}
        >
          <FaBoxOpen /> <span>Inventory</span>
        </button>
        <button
          className={activePage === "category" ? "active" : ""}
          onClick={() => setActivePage("category")}
        >
          <FaFolderOpen /> <span>Category</span>
        </button>
        <button
          className={activePage === "transactions" ? "active" : ""}
          onClick={() => setActivePage("transactions")}
        >
          <FaExchangeAlt /> <span>Transactions</span>
        </button>
        <button
          className={activePage === "machines" ? "active" : ""}
          onClick={() => setActivePage("machines")}
        >
          <FaCogs /> <span>Machines</span>
        </button>
        {isAdmin && (
          <button
            className={activePage === "users" ? "active" : ""}
            onClick={() => setActivePage("users")}
          >
            <FaUserAlt /> <span>Users</span>
          </button>
        )}
      </div>
      <div
        className={`sidebar-bottom${isMobileLogoutRevealed ? " is-logout-revealed" : ""}`}
      >
        <div className="sidebar-account">
          <strong>{currentUser?.username}</strong>
          <span>{currentUser?.role}</span>
        </div>
        <button className="sidebar-logout" type="button" onClick={onLogout}>
          <FaSignOutAlt /> <span>Log out</span>
        </button>
        <div className="mobile-account-controls">
          <button
            className="mobile-account-button"
            type="button"
            aria-label="Hold, then slide to log out"
            title="Hold, then slide to log out"
            onPointerDown={startLogoutHold}
            onPointerUp={finishLogoutHold}
            onPointerCancel={() => window.clearTimeout(logoutHoldTimer.current)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              if (event.detail === 0) {
                setIsMobileLogoutRevealed((revealed) => !revealed);
              }
            }}
          >
            <FaUserAlt />
          </button>
          <button
            ref={mobileLogoutButton}
            className="mobile-logout-button"
            type="button"
            aria-label="Log out"
            tabIndex={isMobileLogoutRevealed ? 0 : -1}
            onClick={onLogout}
          >
            <FaSignOutAlt />
          </button>
        </div>
      </div>
    </nav>
  );
}
