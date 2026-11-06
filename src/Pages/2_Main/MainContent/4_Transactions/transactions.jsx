import { useState } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaExchangeAlt,
  FaSearch,
  FaSignInAlt,
  FaSignOutAlt,
} from "react-icons/fa";
import inventorySeed from "../../../../data/inventory.json";
import Header from "../../Headers/header.jsx";
import "./transactions.scss";

const pageSizeOptions = [10, 20, 50, 100];

function getTransactionType(transaction) {
  return String(transaction.transactionType || "").trim();
}

function isStockIn(transaction) {
  return /^(stock\s*in|receive|received)$/i.test(getTransactionType(transaction));
}

function isStockOut(transaction) {
  return /^(stock\s*out|issue|issued)$/i.test(getTransactionType(transaction));
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "—";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return String(timestamp);
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function getTransactionKey(transaction, index) {
  return (
    transaction.transactionNo ||
    `${transaction.itemNo}-${transaction.timestamp}-${index}`
  );
}

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

export default function Transactions({ inventory = inventorySeed }) {
  const transactions = Array.isArray(inventory.transactions)
    ? inventory.transactions
    : [];
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);
  const [expandedTransactions, setExpandedTransactions] = useState(() => new Set());
  const query = search.trim().toLowerCase();
  const transactionTypes = [
    ...new Set(transactions.map(getTransactionType).filter(Boolean)),
  ].sort((first, second) => first.localeCompare(second));
  const filteredTransactions = transactions
    .filter((transaction) => {
      if (typeFilter === "in") {
        return isStockIn(transaction);
      }
      if (typeFilter === "out") {
        return isStockOut(transaction);
      }
      if (typeFilter !== "all") {
        return getTransactionType(transaction) === typeFilter;
      }
      return true;
    })
    .filter((transaction) =>
      [
        transaction.transactionNo,
        transaction.transactionType,
        transaction.itemNo,
        transaction.code,
        transaction.itemName,
        transaction.userName,
        transaction.reason,
        transaction.machineNumber,
        transaction.machineName,
        transaction.station,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
    .sort((first, second) => {
      const firstDate = Date.parse(first.timestamp) || 0;
      const secondDate = Date.parse(second.timestamp) || 0;
      return secondDate - firstDate;
    });

  const pageCount = Math.ceil(filteredTransactions.length / pageSize);
  const safePage = Math.min(currentPage, Math.max(pageCount, 1));
  const pageNumbers = getPageNumbers(safePage, pageCount);
  const pageStart = (safePage - 1) * pageSize;
  const pageTransactions = filteredTransactions.slice(
    pageStart,
    pageStart + pageSize,
  );
  const firstTransactionNumber =
    filteredTransactions.length === 0 ? 0 : pageStart + 1;
  const lastTransactionNumber = Math.min(
    pageStart + pageSize,
    filteredTransactions.length,
  );
  const stockInCount = transactions.filter(isStockIn).length;
  const stockOutCount = transactions.filter(isStockOut).length;

  function resetPage(update) {
    update();
    setCurrentPage(1);
  }

  function goToPage(page) {
    setCurrentPage(page);
    window.scrollTo({ top: 0 });
  }

  function toggleTransactionDetails(transactionKey) {
    setExpandedTransactions((current) => {
      const next = new Set(current);
      if (next.has(transactionKey)) {
        next.delete(transactionKey);
      } else {
        next.add(transactionKey);
      }
      return next;
    });
  }

  return (
    <div className="transactions-page">
      <Header
        title="Transactions"
        description="Review inventory stock activity"
      />

      <section className="transactions-content" aria-label="Inventory transactions">
        <div className="transaction-summary">
          <article className="transaction-summary-card">
            <span className="transaction-summary-icon">
              <FaExchangeAlt aria-hidden="true" />
            </span>
            <div>
              <span>Total Transactions</span>
              <strong>{transactions.length.toLocaleString()}</strong>
            </div>
          </article>
          <article className="transaction-summary-card">
            <span className="transaction-summary-icon stock-in">
              <FaSignInAlt aria-hidden="true" />
            </span>
            <div>
              <span>Stock In</span>
              <strong>{stockInCount.toLocaleString()}</strong>
            </div>
          </article>
          <article className="transaction-summary-card">
            <span className="transaction-summary-icon stock-out">
              <FaSignOutAlt aria-hidden="true" />
            </span>
            <div>
              <span>Stock Out</span>
              <strong>{stockOutCount.toLocaleString()}</strong>
            </div>
          </article>
        </div>

        <div className="transaction-table-panel">
          <div className="transaction-toolbar">
            <div>
              <h3>Transaction History</h3>
              <p>Newest transactions appear first.</p>
            </div>
            <div className="transaction-filters">
              <label className="transaction-type-filter">
                <span className="sr-only">Filter by transaction type</span>
                <select
                  value={typeFilter}
                  onChange={(event) =>
                    resetPage(() => setTypeFilter(event.target.value))
                  }
                >
                  <option value="all">All types</option>
                  <option value="in">Stock in</option>
                  <option value="out">Stock out</option>
                  {transactionTypes.map((type) => (
                    <option value={type} key={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="transaction-search">
                <FaSearch aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    resetPage(() => setSearch(event.target.value))
                  }
                  placeholder="Search transactions..."
                  aria-label="Search transactions"
                />
              </label>
            </div>
          </div>

          <div className="transaction-table-wrapper">
            <table className="transaction-table">
              <thead>
                <tr>
                  <th scope="col">Transaction No.</th>
                  <th scope="col">Date &amp; Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Item</th>
                  <th scope="col">User</th>
                  <th scope="col">Reason</th>
                  <th scope="col" className="transaction-quantity">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageTransactions.map((transaction, index) => {
                  const transactionKey = getTransactionKey(transaction, index);
                  const isExpanded = expandedTransactions.has(transactionKey);
                  return (
                  <tr
                    key={transactionKey}
                    className={isExpanded ? "transaction-row-expanded" : ""}
                  >
                    <td data-label="Transaction No.">
                      {transaction.transactionNo || "—"}
                      <button
                        className="transaction-row-details-toggle"
                        type="button"
                        onClick={() => toggleTransactionDetails(transactionKey)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Hide" : "Show"} details for transaction ${transaction.transactionNo || ""}`}
                      >
                        {isExpanded ? "Hide details" : "More details"}
                      </button>
                    </td>
                    <td data-label="Date and Time">
                      {formatTimestamp(transaction.timestamp)}
                    </td>
                    <td data-label="Type">
                      {getTransactionType(transaction) ? (
                        <span
                          className={`transaction-type${isStockIn(transaction) ? " stock-in" : ""}${isStockOut(transaction) ? " stock-out" : ""}`}
                        >
                          {getTransactionType(transaction)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Item">
                      <span className="transaction-item-name">
                        {transaction.itemName || "—"}
                      </span>
                      <span className="transaction-item-code">
                        {transaction.itemNo || transaction.code || ""}
                      </span>
                    </td>
                    <td data-label="User">{transaction.userName || "—"}</td>
                    <td data-label="Reason">
                      <span>{transaction.reason || "—"}</span>
                      {transaction.machineNumber && (
                        <span className="transaction-location">
                          Machine {transaction.machineNumber}
                          {transaction.machineName
                            ? ` — ${transaction.machineName}`
                            : ""}
                          {transaction.station
                            ? ` · Machine location ${transaction.station}`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td
                      className="transaction-quantity"
                      data-label="Qty"
                    >
                      {transaction.quantity ?? "—"}
                    </td>
                  </tr>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan="7" className="transaction-empty">
                      {transactions.length === 0
                        ? "No transactions have been recorded yet."
                        : "No transactions match your search or filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="transaction-footer">
            <p aria-live="polite">
              Showing {firstTransactionNumber}–{lastTransactionNumber} of{" "}
              {filteredTransactions.length.toLocaleString()} transactions
            </p>
            <div className="transaction-pagination-controls">
              <label className="transaction-page-size">
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
                <nav
                  className="transaction-pagination"
                  aria-label="Transaction pages"
                >
                  <button
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
                        className={page === safePage ? "active" : ""}
                        type="button"
                        key={page}
                        onClick={() => goToPage(page)}
                        aria-label={`Go to page ${page}`}
                        aria-current={page === safePage ? "page" : undefined}
                      >
                        {page}
                      </button>
                    ) : (
                      <span key={page}>…</span>
                    ),
                  )}
                  <button
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
        </div>
      </section>
    </div>
  );
}
