import "./header.scss";
import { useEffect, useState } from "react";
import { FaCalendarAlt } from "react-icons/fa";

function getCurrentTime() {
  return new Date();
}

export default function Header({
  title = "Dashboard",
  description = "Inventory Overview at a glance",
}) {
  const [now, setNow] = useState(getCurrentTime);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(getCurrentTime()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const date = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  return (
    <>
      <div className="page-header-section">
        <div className="page-title">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="calendar-area">
          <div className="icon">
            <FaCalendarAlt />
          </div>
          <div className="calendar">
            <p className="date">{date}</p>
            <time className="time" dateTime={now.toISOString()}>
              {time}
            </time>
          </div>
        </div>
      </div>
    </>
  );
}
