import { NextResponse } from 'next/server';

// We'll use a simple in-memory fallback + Vercel KV for persistence
// For the KV store, we use the REST API directly to avoid extra dependencies

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function kvSet(key, value) {
  if (!KV_URL) return;
  try {
    await fetch(`${KV_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: JSON.stringify(value) }),
    });
  } catch (e) { console.error('KV set error:', e); }
}

export async function GET() {
  const bookings = (await kvGet('bookings')) || [];
  return NextResponse.json(bookings);
}

export async function POST(request) {
  const booking = await request.json();
  const bookings = (await kvGet('bookings')) || [];
  bookings.push(booking);
  await kvSet('bookings', bookings);
  return NextResponse.json({ success: true });
}

export async function PUT(request) {
  const { id, status } = await request.json();
  const bookings = (await kvGet('bookings')) || [];
  const updated = bookings.map((b) => (b.id === id ? { ...b, status } : b));
  await kvSet('bookings', updated);
  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const { id } = await request.json();
  const bookings = (await kvGet('bookings')) || [];
  const updated = bookings.filter((b) => b.id !== id);
  await kvSet('bookings', updated);
  return NextResponse.json({ success: true });
}
