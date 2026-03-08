"use client";
import { useState, useEffect, useCallback, useMemo } from "react";

const VEHICLES = [
  { id: "minivan", name: "Minivan", seats: 9, icon: "🚐", daily: 95, weekend: 175 },
  { id: "transit", name: "Transit Van", seats: 12, icon: "🚌", daily: 120, weekend: 220 },
];

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "1234";

const TERMS = [
  "Payment is due upon return of the vehicle via your selected payment method.",
  "Return the vehicle with the same fuel level as pickup — fill up the gas before returning.",
  "Renter is fully responsible for all tolls and traffic/parking tickets incurred during the rental period.",
  "Vehicle must be returned parked in a legal, permissible spot.",
  "Renter is responsible for any damage to the vehicle during the rental period beyond normal wear and tear.",
];

const fmt = (d) => d.toISOString().slice(0, 10);
const parseDate = (s) => new Date(s + "T00:00:00");
const today = fmt(new Date());
const uid = () => Math.random().toString(36).slice(2, 10);

function calcPricing(vehicleId, startDate, endDate) {
  if (!vehicleId || !startDate || !endDate) return null;
  const vehicle = VEHICLES.find((v) => v.id === vehicleId);
  if (!vehicle) return null;
  let weekendBlocks = 0, regularDays = 0;
  let d = parseDate(startDate);
  const end = parseDate(endDate);
  while (d <= end) {
    const day = d.getDay();
    if (day === 5) {
      const sat = new Date(d); sat.setDate(sat.getDate() + 1);
      if (sat <= end) { weekendBlocks++; d.setDate(d.getDate() + 2); continue; }
      else regularDays++;
    } else regularDays++;
    d.setDate(d.getDate() + 1);
  }
  const totalDays = regularDays + weekendBlocks * 2;
  const total = regularDays * vehicle.daily + weekendBlocks * vehicle.weekend;
  return { regularDays, weekendBlocks, totalDays, total, daily: vehicle.daily, weekend: vehicle.weekend };
}

function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1; }

const statusColors = {
  pending: { bg: "#FEF3C7", text: "#92400E", label: "Pending" },
  confirmed: { bg: "#D1FAE5", text: "#065F46", label: "Confirmed" },
  declined: { bg: "#FEE2E2", text: "#991B1B", label: "Declined" },
  completed: { bg: "#DBEAFE", text: "#1E40AF", label: "Completed" },
};

// API-backed storage
async function loadBookings() {
  try { const res = await fetch("/api/bookings"); return await res.json(); }
  catch { return []; }
}
async function saveBooking(booking) {
  try { await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(booking) }); }
  catch (e) { console.error(e); }
}
async function apiUpdateStatus(id, status) {
  try { await fetch("/api/bookings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); }
  catch (e) { console.error(e); }
}
async function apiDeleteBooking(id) {
  try { await fetch("/api/bookings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); }
  catch (e) { console.error(e); }
}

function exportCSV(bookings) {
  const headers = ["ID","Name","Email","Phone","Address","Vehicle","Start Date","End Date","Days","Weekday Days","Weekend Blocks","Total ($)","Payment Method","Status","Notes","Submitted"];
  const rows = bookings.map((b) => {
    const p = calcPricing(b.vehicle, b.startDate, b.endDate);
    const v = VEHICLES.find((x) => x.id === b.vehicle);
    return [b.id, `"${b.name}"`, b.email, b.phone, `"${b.address}"`, v?.name || b.vehicle, b.startDate, b.endDate, p?.totalDays || "", p?.regularDays || "", p?.weekendBlocks || "", p?.total || "", b.paymentMethod || "", b.status, `"${(b.notes || "").replace(/"/g, '""')}"`, b.submittedAt];
  });
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "rentready-bookings-" + fmt(new Date()) + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

const palette = {
  bg: "#F7F5F0", card: "#FFFFFF", accent: "#1B3A4B", accentLight: "#2C5F7A",
  warm: "#C97B3A", warmLight: "#F4E4D1", text: "#1A1A1A", textMuted: "#6B7280",
  border: "#E5E1DA", success: "#047857", danger: "#DC2626",
};

function AvailabilityCalendar({ bookings, selectedVehicle, startDate, endDate, onSelectRange }) {
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [hoverDate, setHoverDate] = useState(null);
  const [selectingStart, setSelectingStart] = useState(true);
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const firstDay = new Date(viewMonth.year, viewMonth.month, 1).getDay();
  const monthName = new Date(viewMonth.year, viewMonth.month).toLocaleString("en", { month: "long", year: "numeric" });

  const isBooked = useCallback((dateStr) => {
    if (!selectedVehicle) return false;
    return bookings.some((b) => b.vehicle === selectedVehicle && b.status !== "declined" && dateStr >= b.startDate && dateStr <= b.endDate);
  }, [bookings, selectedVehicle]);
  const isPast = (dateStr) => dateStr < today;
  const isInRange = (dateStr) => {
    if (startDate && endDate) return dateStr >= startDate && dateStr <= endDate;
    if (startDate && hoverDate && !endDate) { const lo = startDate < hoverDate ? startDate : hoverDate; const hi = startDate < hoverDate ? hoverDate : startDate; return dateStr >= lo && dateStr <= hi; }
    return false;
  };
  const handleClick = (dateStr) => {
    if (isPast(dateStr) || isBooked(dateStr)) return;
    if (selectingStart) { onSelectRange(dateStr, null); setSelectingStart(false); }
    else {
      const s = dateStr < startDate ? dateStr : startDate; const e = dateStr < startDate ? startDate : dateStr;
      let conflict = false; let d = parseDate(s);
      while (fmt(d) <= e) { if (isBooked(fmt(d))) { conflict = true; break; } d.setDate(d.getDate() + 1); }
      if (!conflict) onSelectRange(s, e);
      setSelectingStart(true);
    }
  };
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(viewMonth.year + "-" + String(viewMonth.month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"));

  return (
    <div style={{ userSelect: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={() => setViewMonth((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }))} style={navBtn}>‹</button>
        <span style={{ fontFamily: "'Playfair Display'", fontWeight: 600, fontSize: 18, color: palette.accent }}>{monthName}</span>
        <button onClick={() => setViewMonth((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }))} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, textAlign: "center" }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ fontSize: 11, fontWeight: 700, color: palette.textMuted, padding: "4px 0", fontFamily: "'DM Sans'" }}>{d}</div>
        ))}
        {days.map((dateStr, i) => {
          if (!dateStr) return <div key={"e" + i} />;
          const booked = isBooked(dateStr); const past = isPast(dateStr); const inRange = isInRange(dateStr);
          const isStart = dateStr === startDate; const isEnd = dateStr === endDate;
          const disabled = past || booked; const dayNum = parseInt(dateStr.slice(-2));
          const isWeekendDay = [0, 5, 6].includes(parseDate(dateStr).getDay());
          let bg = "transparent", color = palette.text, border = "2px solid transparent", fontWeight = 400, cursor = "pointer", opacity = 1;
          if (past) { color = "#CCC"; cursor = "default"; opacity = 0.5; }
          else if (booked) { bg = "#FEE2E2"; color = "#991B1B"; cursor = "not-allowed"; }
          else if (isStart || isEnd) { bg = palette.accent; color = "#FFF"; fontWeight = 700; border = "2px solid " + palette.accent; }
          else if (inRange) { bg = palette.warmLight; color = palette.accent; fontWeight = 500; }
          return (
            <div key={dateStr} onClick={() => !disabled && handleClick(dateStr)}
              onMouseEnter={() => !disabled && setHoverDate(dateStr)} onMouseLeave={() => setHoverDate(null)}
              style={{ padding: "6px 2px", borderRadius: 8, background: bg, color, fontWeight, fontSize: 13, fontFamily: "'DM Sans'", cursor, opacity, border, transition: "all 0.15s", position: "relative" }}>
              {dayNum}
              {isWeekendDay && !past && !booked && <div style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 2, background: palette.warm, opacity: 0.6 }} />}
            </div>
          );
        })}
      </div>
      {!selectedVehicle && <p style={{ fontSize: 12, color: palette.warm, marginTop: 8, fontStyle: "italic", fontFamily: "'DM Sans'" }}>Select a vehicle first to see availability</p>}
      {selectedVehicle && (
        <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 11, fontFamily: "'DM Sans'", color: palette.textMuted, flexWrap: "wrap" }}>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#FEE2E2", marginRight: 4, verticalAlign: "middle" }} />Booked</span>
          <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: palette.accent, marginRight: 4, verticalAlign: "middle" }} />Selected</span>
          <span><span style={{ display: "inline-block", width: 4, height: 4, borderRadius: 2, background: palette.warm, marginRight: 4, verticalAlign: "middle" }} />Weekend rate</span>
        </div>
      )}
    </div>
  );
}

const navBtn = { background: "none", border: "1px solid " + palette.border, borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: "pointer", color: palette.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans'" };

function PricingBreakdown({ vehicleId, startDate, endDate }) {
  const p = calcPricing(vehicleId, startDate, endDate);
  if (!p) return null;
  return (
    <div style={{ marginTop: 12, padding: 16, background: palette.warmLight, borderRadius: 10, fontFamily: "'DM Sans'", fontSize: 14, color: palette.accent }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>Estimated Cost</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {p.regularDays > 0 && (<div style={{ display: "flex", justifyContent: "space-between" }}><span>{p.regularDays} weekday{p.regularDays !== 1 ? "s" : ""} × ${p.daily}</span><span style={{ fontWeight: 600 }}>${p.regularDays * p.daily}</span></div>)}
        {p.weekendBlocks > 0 && (<div style={{ display: "flex", justifyContent: "space-between" }}><span>{p.weekendBlocks} weekend{p.weekendBlocks !== 1 ? "s" : ""} (Fri–Sun) × ${p.weekend}</span><span style={{ fontWeight: 600 }}>${p.weekendBlocks * p.weekend}</span></div>)}
        <div style={{ borderTop: "1px solid " + palette.accent + "33", paddingTop: 6, marginTop: 4, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18 }}><span>Total</span><span>${p.total}</span></div>
      </div>
    </div>
  );
}

function CustomerForm({ bookings, onSubmit }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", vehicle: "", startDate: null, endDate: null, paymentMethod: "", termsAgreed: false, notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [showTerms, setShowTerms] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.email.includes("@")) e.email = "Valid email required";
    if (!form.phone.trim()) e.phone = "Required";
    if (!form.address.trim()) e.address = "Required";
    if (!form.vehicle) e.vehicle = "Select a vehicle";
    if (!form.startDate || !form.endDate) e.dates = "Select rental dates";
    if (!form.paymentMethod) e.paymentMethod = "Select a payment method";
    if (!form.termsAgreed) e.terms = "Must agree to terms";
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const p = calcPricing(form.vehicle, form.startDate, form.endDate);
    const booking = { id: uid(), ...form, totalCost: p?.total || 0, status: "pending", submittedAt: new Date().toISOString() };
    await onSubmit(booking); setSubmitted(true);
  };

  if (submitted) {
    const vehicle = VEHICLES.find((v) => v.id === form.vehicle);
    const p = calcPricing(form.vehicle, form.startDate, form.endDate);
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontFamily: "'Playfair Display'", fontSize: 28, color: palette.accent, marginBottom: 8 }}>Request Submitted</h2>
        <p style={{ fontFamily: "'DM Sans'", color: palette.textMuted, fontSize: 15, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
          Thank you, {form.name.split(" ")[0]}! Your reservation for the {vehicle?.name} ({daysBetween(form.startDate, form.endDate)} days, ${p?.total}) is being reviewed. We&apos;ll get back to you within 24 hours.
        </p>
        <button onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", address: "", vehicle: "", startDate: null, endDate: null, paymentMethod: "", termsAgreed: false, notes: "" }); }} style={{ ...primaryBtn, marginTop: 24 }}>Submit Another Request</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontFamily: "'Playfair Display'", fontSize: 32, fontWeight: 800, color: palette.accent, margin: 0 }}>Reserve Your Ride</h1>
        <p style={{ fontFamily: "'DM Sans'", color: palette.textMuted, fontSize: 15, marginTop: 6 }}>Fill out the form below and we&apos;ll confirm your rental within 24 hours.</p>
      </div>

      <SectionLabel>Choose Your Vehicle</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
        {VEHICLES.map((v) => (
          <div key={v.id} onClick={() => set("vehicle", v.id)}
            style={{ border: form.vehicle === v.id ? "2px solid " + palette.accent : "2px solid " + palette.border, borderRadius: 12, padding: "20px 16px", cursor: "pointer", background: form.vehicle === v.id ? palette.accent : palette.card, transition: "all 0.2s", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{v.icon}</div>
            <div style={{ fontFamily: "'DM Sans'", fontWeight: 700, fontSize: 16, color: form.vehicle === v.id ? "#FFF" : palette.text }}>{v.name}</div>
            <div style={{ fontFamily: "'DM Sans'", fontSize: 12, color: form.vehicle === v.id ? "rgba(255,255,255,0.7)" : palette.textMuted, marginTop: 2 }}>{v.seats} passengers</div>
            <div style={{ fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 600, color: form.vehicle === v.id ? palette.warmLight : palette.warm, marginTop: 8 }}>${v.daily}/day · ${v.weekend}/weekend</div>
          </div>
        ))}
      </div>
      {errors.vehicle && <ErrMsg>{errors.vehicle}</ErrMsg>}

      <SectionLabel>Select Dates</SectionLabel>
      <div style={{ background: palette.card, borderRadius: 12, padding: 20, border: "1px solid " + palette.border, marginBottom: 8 }}>
        <AvailabilityCalendar bookings={bookings} selectedVehicle={form.vehicle} startDate={form.startDate} endDate={form.endDate} onSelectRange={(s, e) => { set("startDate", s); set("endDate", e); }} />
        {form.startDate && form.endDate && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: palette.accent + "0A", borderRadius: 8, fontFamily: "'DM Sans'", fontSize: 14, color: palette.accent }}>
            <strong>{daysBetween(form.startDate, form.endDate)} day{daysBetween(form.startDate, form.endDate) > 1 ? "s" : ""}</strong>{" · "}
            {parseDate(form.startDate).toLocaleDateString("en", { month: "short", day: "numeric" })} – {parseDate(form.endDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
        <PricingBreakdown vehicleId={form.vehicle} startDate={form.startDate} endDate={form.endDate} />
      </div>
      {errors.dates && <ErrMsg>{errors.dates}</ErrMsg>}

      <SectionLabel>Your Information</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Full Name" value={form.name} onChange={(v) => set("name", v)} error={errors.name} />
        <Field label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} error={errors.email} />
        <Field label="Phone" type="tel" value={form.phone} onChange={(v) => set("phone", v)} error={errors.phone} />
        <Field label="Address" value={form.address} onChange={(v) => set("address", v)} error={errors.address} />
      </div>

      <SectionLabel>Preferred Payment Method</SectionLabel>
      <p style={{ fontFamily: "'DM Sans'", fontSize: 13, color: palette.textMuted, marginBottom: 12, lineHeight: 1.5 }}>Payment is collected upon return of the vehicle. Please select how you&apos;d like to pay.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 4 }}>
        {["PayPal", "Venmo", "Zelle", "Cash App", "Cash", "Other"].map((method) => (
          <div key={method} onClick={() => set("paymentMethod", method)}
            style={{ border: form.paymentMethod === method ? "2px solid " + palette.accent : "2px solid " + palette.border, borderRadius: 10, padding: "12px 10px", cursor: "pointer", background: form.paymentMethod === method ? palette.accent : palette.card, transition: "all 0.15s", textAlign: "center", fontFamily: "'DM Sans'", fontSize: 13, fontWeight: 600, color: form.paymentMethod === method ? "#FFF" : palette.text }}>
            {method}
          </div>
        ))}
      </div>
      {errors.paymentMethod && <ErrMsg>{errors.paymentMethod}</ErrMsg>}

      <SectionLabel>Terms & Conditions</SectionLabel>
      <div style={{ background: palette.card, borderRadius: 10, border: "1px solid " + palette.border, padding: 16, marginBottom: 8 }}>
        <button onClick={() => setShowTerms(!showTerms)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans'", fontSize: 14, color: palette.accent, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, width: "100%", padding: 0 }}>
          <span style={{ transform: showTerms ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▸</span>
          View Rental Terms
        </button>
        {showTerms && (
          <div style={{ marginTop: 12, fontFamily: "'DM Sans'", fontSize: 13, color: palette.textMuted, lineHeight: 1.7 }}>
            {TERMS.map((t, i) => (<div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}><span style={{ color: palette.warm, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span><span>{t}</span></div>))}
          </div>
        )}
      </div>
      <Checkbox checked={form.termsAgreed} onChange={() => set("termsAgreed", !form.termsAgreed)} error={errors.terms}>I have read and agree to the rental terms & conditions</Checkbox>

      <SectionLabel>Additional Notes <span style={{ fontWeight: 400, color: palette.textMuted }}>(optional)</span></SectionLabel>
      <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Special requests, pickup preferences, etc." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      <button onClick={handleSubmit} style={{ ...primaryBtn, width: "100%", marginTop: 24, padding: "14px 0", fontSize: 16 }}>Submit Reservation Request</button>
    </div>
  );
}

function AdminDashboard({ bookings, onUpdateStatus, onDeleteBooking }) {
  const [filter, setFilter] = useState("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [sortField, setSortField] = useState("submittedAt");
  const [sortDir, setSortDir] = useState("desc");
  const [searchQuery, setSearchQuery] = useState("");

  const toggleSort = (field) => { if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortField(field); setSortDir("asc"); } };
  const sortIcon = (field) => { if (sortField !== field) return " ↕"; return sortDir === "asc" ? " ↑" : " ↓"; };

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => filter === "all" || b.status === filter)
      .filter((b) => vehicleFilter === "all" || b.vehicle === vehicleFilter)
      .filter((b) => { if (!searchQuery.trim()) return true; const q = searchQuery.toLowerCase(); return b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q) || b.phone.includes(q); })
      .sort((a, b) => {
        let va, vb;
        switch (sortField) {
          case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
          case "vehicle": va = a.vehicle; vb = b.vehicle; break;
          case "startDate": va = a.startDate; vb = b.startDate; break;
          case "total": va = calcPricing(a.vehicle, a.startDate, a.endDate)?.total || 0; vb = calcPricing(b.vehicle, b.startDate, b.endDate)?.total || 0; break;
          case "status": va = a.status; vb = b.status; break;
          default: va = a.submittedAt; vb = b.submittedAt; break;
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1; if (va > vb) return sortDir === "asc" ? 1 : -1; return 0;
      });
  }, [bookings, filter, vehicleFilter, searchQuery, sortField, sortDir]);

  const stats = {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    revenue: bookings.filter((b) => b.status === "confirmed" || b.status === "completed").reduce((sum, b) => sum + (calcPricing(b.vehicle, b.startDate, b.endDate)?.total || 0), 0),
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "'Playfair Display'", fontSize: 28, fontWeight: 800, color: palette.accent, margin: 0 }}>Dashboard</h1>
        <button onClick={() => exportCSV(bookings)} style={{ ...primaryBtn, background: palette.warm, padding: "10px 20px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>⬇ Export CSV</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Requests", value: stats.total, color: palette.accent },
          { label: "Pending", value: stats.pending, color: "#D97706" },
          { label: "Confirmed", value: stats.confirmed, color: palette.success },
          { label: "Revenue", value: "$" + stats.revenue.toLocaleString(), color: palette.warm },
        ].map((s) => (
          <div key={s.label} style={{ background: palette.card, borderRadius: 12, padding: "16px 14px", border: "1px solid " + palette.border }}>
            <div style={{ fontFamily: "'DM Sans'", fontSize: 11, color: palette.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: 28, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {["all", "pending", "confirmed", "declined", "completed"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={{ ...chipBtn, background: filter === s ? palette.accent : palette.card, color: filter === s ? "#FFF" : palette.text, border: "1px solid " + (filter === s ? palette.accent : palette.border) }}>
            {s === "all" ? "All" : statusColors[s].label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {["all", "minivan", "transit"].map((v) => (
          <button key={v} onClick={() => setVehicleFilter(v)} style={{ ...chipBtn, background: vehicleFilter === v ? palette.warm : palette.card, color: vehicleFilter === v ? "#FFF" : palette.text, border: "1px solid " + (vehicleFilter === v ? palette.warm : palette.border) }}>
            {v === "all" ? "All Vehicles" : VEHICLES.find((x) => x.id === v)?.name}
          </button>
        ))}
      </div>
      <input type="text" placeholder="Search by name, email, or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ ...inputStyle, marginBottom: 16, maxWidth: 360 }} />

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 700 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 0.8fr", gap: 4, padding: "8px 12px", background: palette.accent, borderRadius: "10px 10px 0 0", fontSize: 11, fontFamily: "'DM Sans'", fontWeight: 700, color: "#FFF", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {[{ field: "name", label: "Customer" }, { field: "vehicle", label: "Vehicle" }, { field: "startDate", label: "Dates" }, { field: "total", label: "Total" }, { field: "status", label: "Status" }, { field: "submittedAt", label: "Submitted" }].map((col) => (
              <div key={col.field} onClick={() => toggleSort(col.field)} style={{ cursor: "pointer", userSelect: "none" }}>{col.label}{sortIcon(col.field)}</div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: palette.textMuted, fontFamily: "'DM Sans'", background: palette.card, borderRadius: "0 0 10px 10px", border: "1px solid " + palette.border, borderTop: "none" }}>No bookings match this filter.</div>
          )}
          {filtered.map((b, idx) => {
            const vehicle = VEHICLES.find((v) => v.id === b.vehicle);
            const p = calcPricing(b.vehicle, b.startDate, b.endDate);
            const sc = statusColors[b.status]; const isLast = idx === filtered.length - 1;
            return (
              <div key={b.id}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr 1fr 1fr 0.8fr", gap: 4, padding: "14px 12px", background: palette.card, border: "1px solid " + palette.border, borderTop: "none", fontFamily: "'DM Sans'", fontSize: 13, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: palette.text }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: palette.textMuted }}>{b.email} · {b.phone}</div>
                    {b.notes && <div style={{ fontSize: 11, color: palette.textMuted, fontStyle: "italic", marginTop: 2 }}>&quot;{b.notes}&quot;</div>}
                  </div>
                  <div>{vehicle?.icon} {vehicle?.name}</div>
                  <div>
                    {parseDate(b.startDate).toLocaleDateString("en", { month: "short", day: "numeric" })} – {parseDate(b.endDate).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    <span style={{ fontSize: 11, color: palette.textMuted, marginLeft: 4 }}>({p?.totalDays}d)</span>
                  </div>
                  <div style={{ fontWeight: 700, color: palette.accent }}>${p?.total}</div>
                  <div><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span></div>
                  <div style={{ fontSize: 11, color: palette.textMuted }}>{new Date(b.submittedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</div>
                </div>
                <div style={{ display: "flex", gap: 6, padding: "6px 12px", background: "#FAFAF8", border: "1px solid " + palette.border, borderTop: "none", borderRadius: isLast ? "0 0 10px 10px" : 0 }}>
                  {b.status === "pending" && (<><SmallBtn color={palette.success} onClick={() => onUpdateStatus(b.id, "confirmed")}>Confirm</SmallBtn><SmallBtn color={palette.danger} onClick={() => onUpdateStatus(b.id, "declined")}>Decline</SmallBtn></>)}
                  {b.status === "confirmed" && <SmallBtn color={palette.accentLight} onClick={() => onUpdateStatus(b.id, "completed")}>Mark Completed</SmallBtn>}
                  <SmallBtn color="#9CA3AF" onClick={() => onDeleteBooking(b.id)}>Delete</SmallBtn>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: "'DM Sans'", fontSize: 11, color: palette.textMuted, alignSelf: "center" }}>Pays via {b.paymentMethod || "N/A"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SmallBtn({ children, color, onClick }) {
  return <button onClick={onClick} style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8, background: color, color: "#FFF", border: "none", cursor: "pointer" }}>{children}</button>;
}
function SectionLabel({ children }) {
  return <div style={{ fontFamily: "'DM Sans'", fontWeight: 700, fontSize: 13, color: palette.accent, textTransform: "uppercase", letterSpacing: 1, marginTop: 24, marginBottom: 10 }}>{children}</div>;
}
function Field({ label, value, onChange, error, type = "text", placeholder }) {
  return (<div style={{ marginBottom: 4 }}><label style={{ fontFamily: "'DM Sans'", fontSize: 12, fontWeight: 500, color: palette.textMuted, display: "block", marginBottom: 4 }}>{label}</label><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, borderColor: error ? palette.danger : palette.border }} />{error && <ErrMsg>{error}</ErrMsg>}</div>);
}
function Checkbox({ checked, onChange, error, children }) {
  return (<div><div onClick={onChange} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, cursor: "pointer", fontFamily: "'DM Sans'", fontSize: 14, color: palette.text }}><div style={{ width: 20, height: 20, borderRadius: 6, border: "2px solid " + (checked ? palette.accent : palette.border), background: checked ? palette.accent : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#FFF", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{checked && "✓"}</div>{children}</div>{error && <ErrMsg>{error}</ErrMsg>}</div>);
}
function ErrMsg({ children }) { return <div style={{ fontFamily: "'DM Sans'", fontSize: 11, color: palette.danger, marginTop: 2 }}>{children}</div>; }

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid " + palette.border, fontSize: 14, fontFamily: "'DM Sans'", color: palette.text, background: palette.card, outline: "none", boxSizing: "border-box" };
const primaryBtn = { fontFamily: "'DM Sans'", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 10, background: palette.accent, color: "#FFF", border: "none", cursor: "pointer" };
const chipBtn = { fontFamily: "'DM Sans'", fontWeight: 600, fontSize: 12, padding: "6px 14px", borderRadius: 20, cursor: "pointer" };

export default function Home() {
  const [view, setView] = useState("customer");
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const refreshBookings = async () => { const b = await loadBookings(); setBookings(b); };

  useEffect(() => { refreshBookings().then(() => setLoading(false)); }, []);

  const addBooking = async (booking) => {
    setBookings((prev) => [...prev, booking]);
    await saveBooking(booking);
  };
  const updateStatus = async (id, status) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    await apiUpdateStatus(id, status);
  };
  const deleteBooking = async (id) => {
    setBookings((prev) => prev.filter((b) => b.id !== id));
    await apiDeleteBooking(id);
  };

  const tryPin = () => { if (pin === ADMIN_PIN) { setView("admin"); setPinError(false); refreshBookings(); } else setPinError(true); };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: palette.bg, fontFamily: "'DM Sans'", color: palette.textMuted }}>Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: palette.bg }}>
      <style>{`*, *::before, *::after { box-sizing: border-box; margin: 0; } input:focus, textarea:focus { border-color: ${palette.accent} !important; } body { margin: 0; }`}</style>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 28px", background: palette.card, borderBottom: "1px solid " + palette.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>🚗</span>
          <span style={{ fontFamily: "'Playfair Display'", fontWeight: 800, fontSize: 20, color: palette.accent }}>RentReady</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setView("customer")} style={{ ...chipBtn, background: view === "customer" ? palette.accent : "transparent", color: view === "customer" ? "#FFF" : palette.text, border: view === "customer" ? "1px solid " + palette.accent : "1px solid " + palette.border }}>Book a Vehicle</button>
          <button onClick={() => setView(view === "admin" ? "admin" : "admin_login")} style={{ ...chipBtn, background: view.startsWith("admin") ? palette.warm : "transparent", color: view.startsWith("admin") ? "#FFF" : palette.text, border: view.startsWith("admin") ? "1px solid " + palette.warm : "1px solid " + palette.border }}>Admin</button>
        </div>
      </nav>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        {view === "customer" && <CustomerForm bookings={bookings} onSubmit={addBooking} />}
        {view === "admin_login" && (
          <div style={{ maxWidth: 320, margin: "80px auto", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
            <h2 style={{ fontFamily: "'Playfair Display'", fontSize: 22, color: palette.accent, marginBottom: 16 }}>Admin Access</h2>
            <input type="password" placeholder="Enter PIN" value={pin} onChange={(e) => { setPin(e.target.value); setPinError(false); }} onKeyDown={(e) => e.key === "Enter" && tryPin()} style={{ ...inputStyle, textAlign: "center", fontSize: 20, letterSpacing: 8, marginBottom: 12 }} />
            {pinError && <ErrMsg>Incorrect PIN</ErrMsg>}
            <button onClick={tryPin} style={{ ...primaryBtn, width: "100%", marginTop: 12 }}>Enter</button>
          </div>
        )}
        {view === "admin" && <AdminDashboard bookings={bookings} onUpdateStatus={updateStatus} onDeleteBooking={deleteBooking} />}
      </div>
    </div>
  );
}
