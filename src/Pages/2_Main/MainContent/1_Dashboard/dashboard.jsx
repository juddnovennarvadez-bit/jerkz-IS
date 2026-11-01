import "./dashboard.scss";
import Header from "../../Headers/header.jsx";
import inventoryData from "../../../../data/inventory.json";
import {
  FaBoxOpen,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFolderOpen,
  FaBoxes,
} from "react-icons/fa";
import { FaArrowRight } from "react-icons/fa";

const LOW_STOCK_THRESHOLD = 5;

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

function formatTransactionDate(timestamp) {
  const date = new Date(timestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function Dashboard({
  inventory = inventoryData,
  onViewTransactions,
}) {
  const inventoryItems = Array.isArray(inventory.items) ? inventory.items : [];
  const categories = Array.isArray(inventory.categories)
    ? inventory.categories
    : [];
  const transactions = Array.isArray(inventory.transactions)
    ? inventory.transactions
    : [];
  const lowStockItems = inventoryItems
    .filter((item) => getQuantity(item) <= LOW_STOCK_THRESHOLD)
    .sort((first, second) => getQuantity(first) - getQuantity(second));
  const recentTransactions = [...transactions]
    .sort(
      (first, second) =>
        (Date.parse(second.timestamp) || 0) -
        (Date.parse(first.timestamp) || 0),
    )
    .slice(0, 5);
  const categoryNames = new Set(
    [
      ...categories.map((category) =>
        typeof category === "string" ? category : category?.name,
      ),
      ...inventoryItems.map((item) =>
        typeof item.category === "string" ? item.category : item.category?.name,
      ),
    ]
      .map((category) => String(category || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const summaryCards = [
    {
      label: "Total Products",
      value: inventoryItems.length,
      detail: "unique inventory items",
      icon: FaBoxOpen,
    },
    {
      label: "Units in Stock",
      value: inventoryItems.reduce(
        (total, item) => total + getQuantity(item),
        0,
      ),
      detail: "across all locations",
      icon: FaBoxes,
    },
    {
      label: "Categories",
      value: categoryNames.size,
      detail:
        categoryNames.size === 0 ? "none configured yet" : "in your inventory",
      icon: FaFolderOpen,
    },
    {
      label: `Low Stock (≤${LOW_STOCK_THRESHOLD})`,
      value: lowStockItems.length,
      detail: "items at or below threshold",
      icon: FaExclamationTriangle,
    },
    {
      label: "Transactions",
      value: transactions.length,
      detail: "recorded transactions",
      icon: FaExchangeAlt,
    },
  ];

  return (
    <div className="dashboard-container">
      <Header />
      <div className="dashboard-content">
        <section className="summary-grid" aria-label="Inventory summary">
          {summaryCards.map(({ label, value, detail, icon: Icon }) => (
            <article className="summary-card" key={label}>
              <div className="summary-card-icon">
                <Icon aria-hidden="true" />
              </div>
              <div className="summary-card-details">
                <p>{label}</p>
                <strong>{value.toLocaleString()}</strong>
                <span>{detail}</span>
              </div>
            </article>
          ))}
        </section>

        <section className="dashboard-panels" aria-label="Inventory details">
          <article className="dashboard-panel">
            <div className="panel-heading">
              <h3>Low Stock Items</h3>
              <span>≤ {LOW_STOCK_THRESHOLD} units</span>
            </div>
            {lowStockItems.length > 0 ? (
              <ul className="dashboard-item-list">
                {lowStockItems.slice(0, 6).map((item) => (
                  <li key={item.itemNo}>
                    <div className="dashboard-list-item">
                      <strong>{item.name}</strong>
                      <span>
                        {item.itemNo}
                        {getLocation(item) ? ` · ${getLocation(item)}` : ""}
                      </span>
                    </div>
                    <span className="dashboard-stock-quantity">
                      {getQuantity(item)} left
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel-empty-state">
                <p>No low-stock items</p>
                <span>All items have more than {LOW_STOCK_THRESHOLD} units.</span>
              </div>
            )}
          </article>

          <article className="dashboard-panel">
            <div className="panel-heading">
              <h3>Recent Transactions</h3>
              <button
                type="button"
                className="dashboard-view-transactions"
                onClick={onViewTransactions}
                aria-label="View all transactions"
              >
                View all <FaArrowRight aria-hidden="true" />
              </button>
            </div>
            {recentTransactions.length > 0 ? (
              <ul className="dashboard-item-list dashboard-transaction-list">
                {recentTransactions.map((transaction, index) => (
                  <li
                    key={
                      transaction.transactionNo ||
                      `${transaction.itemNo}-${transaction.timestamp}-${index}`
                    }
                  >
                    <div className="dashboard-list-item">
                      <strong>
                        {transaction.itemName ||
                          transaction.transactionType ||
                          "Inventory update"}
                      </strong>
                      <span>
                        {transaction.transactionType || "Transaction"}
                        {transaction.transactionNo
                          ? ` · ${transaction.transactionNo}`
                          : ""}
                      </span>
                    </div>
                    <span className="dashboard-transaction-date">
                      {formatTransactionDate(transaction.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="panel-empty-state">
                <p>No transactions yet</p>
                <span>Transactions will appear here when they are recorded.</span>
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
