"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bookingService, BookingError } from "@/services/booking.api.service";
import { ticketService } from "@/services/ticket.api.service";
import { useAuthStore } from "@/store/auth.store";
import { todayISO, addDaysISO, rupiah } from "@/lib/business";
import { BOOKING_CONFIG } from "@/config/app.config";
import type { Ticket } from "@/types/api";
import type { TourismPackage } from "@/types/destination";
import { bookingSchema, validateVisitDate, sanitizeInput, sanitizeEmail, sanitizePhone } from "@/features/booking/schemas/booking.schema";
import { DatePicker } from "@/components/inputs/date-picker";

// Booking form (paket wisata) — membuat booking dari halaman detail paket. Memakai booking service backend; setelah create, lanjut ke halaman payment.

export function BookingForm({ pkg }: { pkg: TourismPackage }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);

  // Muat tiket aktif untuk paket ini
  useEffect(() => {
    ticketService.getActive().then((ts) => {
      // Filter tiket yang mungkin terkait paket ini. Untuk sekarang pakai semua tiket aktif
      setTickets(ts);
      if (ts.length > 0) {
        const firstTicket = ts[0];
        if (firstTicket) setSelectedTicketId(firstTicket.id);
      }
      setLoadingTickets(false);
    }).catch(() => setLoadingTickets(false));
  }, []);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
  const unit = selectedTicket?.price ?? 0;
  const total = unit * quantity;

  const minDate = addDaysISO(todayISO(), BOOKING_CONFIG.minDaysAhead);
  const maxDate = addDaysISO(todayISO(), BOOKING_CONFIG.maxDaysAhead);

  // Validasi real-time untuk tanggal kunjungan
  useEffect(() => {
    if (visitDate) {
      const validation = validateVisitDate(visitDate);
      if (!validation.valid) {
        setErrors((prev) => ({ ...prev, visitDate: validation.message! }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.visitDate;
          return next;
        });
      }
    }
  }, [visitDate]);

  // Validasi real-time untuk nama
  useEffect(() => {
    if (name.trim() && name.trim().length < 3) {
      setErrors((prev) => ({ ...prev, name: "Nama minimal 3 karakter" }));
    } else if (name.trim().length >= 3) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        return next;
      });
    }
  }, [name]);

  // Validasi real-time untuk email
  useEffect(() => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors((prev) => ({ ...prev, email: "Format email tidak valid" }));
    } else if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.email;
        return next;
      });
    }
  }, [email]);

  // Validasi real-time untuk telepon
  useEffect(() => {
    if (phone) {
      const validation = validatePhone(phone);
      if (!validation.valid) {
        setErrors((prev) => ({ ...prev, phone: validation.message! }));
      } else {
        setErrors((prev) => {
          const next = { ...prev };
          delete next.phone;
          return next;
        });
      }
    }
  }, [phone]);

  // Validasi real-time untuk jumlah
  useEffect(() => {
    if (quantity < 1) {
      setErrors((prev) => ({ ...prev, quantity: "Jumlah minimal 1" }));
    } else if (quantity > 20) {
      setErrors((prev) => ({ ...prev, quantity: "Maksimal 20 tiket per jenis" }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.quantity;
        return next;
      });
    }
  }, [quantity]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Silakan masuk terlebih dahulu untuk booking");
      router.push(`/login?redirect=/packages/${pkg.id}`);
      return;
    }

    // Siapkan data form dengan sanitasi
    const formData = {
      visit_date: visitDate,
      visitor: {
        name: sanitizeInput(name),
        email: sanitizeEmail(email),
        phone: sanitizePhone(phone),
      },
      items: [
        {
          ticket_id: selectedTicketId,
          quantity,
        },
      ],
      note: "",
    };

    // Validasi dengan skema Zod
    const result = bookingSchema.safeParse(formData);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        errs[path] = issue.message;
      }
      setErrors(errs);
      return;
    }

    // Validasi bisnis tambahan
    const dateValidation = validateVisitDate(visitDate);
    if (!dateValidation.valid) {
      setErrors((prev) => ({ ...prev, visitDate: dateValidation.message! }));
      return;
    }

    if (!selectedTicketId) {
      setErrors((prev) => ({ ...prev, ticket: "Pilih jenis tiket" }));
      return;
    }

    setSubmitting(true);
    try {
      const response = await bookingService.create(formData);
      const { booking } = response;
      toast.success("Booking dibuat", { description: `Kode ${booking.booking_code}` });
      router.push(`/payment?code=${booking.id}`);
    } catch (err) {
      toast.error(err instanceof BookingError ? err.message : "Gagal membuat booking");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingTickets) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 bg-gray-200 rounded" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div>
        <label className="mb-1 block text-sm font-medium">Jenis Tiket</label>
        <select
          value={selectedTicketId}
          onChange={(e) => setSelectedTicketId(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
          aria-invalid={!!errors.ticket}
        >
          {tickets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {rupiah(t.price)}
            </option>
          ))}
        </select>
        {errors.ticket && <p className="mt-1 text-xs text-red-600" role="alert">{errors.ticket}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Tanggal Kunjungan</label>
        <DatePicker
          value={visitDate}
          onChange={setVisitDate}
          min={minDate}
          max={maxDate}
          placeholder="Pilih tanggal kunjungan"
          aria-invalid={!!errors.visitDate}
        />
        {errors.visitDate && <p className="mt-1 text-xs text-red-600" role="alert">{errors.visitDate}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Jumlah Tiket</label>
        <input
          type="number"
          min={1}
          max={20}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
          aria-invalid={!!errors.quantity}
        />
        {errors.quantity && <p className="mt-1 text-xs text-red-600" role="alert">{errors.quantity}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Nama Pemesan</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="mt-1 text-xs text-red-600" role="alert">{errors.name}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="mt-1 text-xs text-red-600" role="alert">{errors.email}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Nomor Telepon</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08xxxxxxxxxx"
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-brand-600"
          aria-invalid={!!errors.phone}
        />
        {errors.phone && <p className="mt-1 text-xs text-red-600" role="alert">{errors.phone}</p>}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
        <span className="text-slate-500">Total</span>
        <span className="font-semibold">{rupiah(total)}</span>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="h-10 w-full rounded-md bg-brand text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {submitting ? "Memproses..." : "Booking Sekarang"}
      </button>
    </form>
  );
}

// Helper validasi telepon (disalin dari schema untuk dipakai inline)
function validatePhone(phone: string): { valid: boolean; message?: string } {
  const cleaned = phone.replace(/[\s-]/g, "");
  let normalized = cleaned;
  
  if (cleaned.startsWith("+62")) {
    normalized = "0" + cleaned.slice(3);
  } else if (cleaned.startsWith("62")) {
    normalized = "0" + cleaned.slice(2);
  } else if (cleaned.startsWith("8")) {
    normalized = "0" + cleaned;
  }
  
  if (!normalized.startsWith("08")) {
    return { valid: false, message: "Nomor telepon harus diawali 08 atau 8" };
  }
  
  if (normalized.length < 10 || normalized.length > 13) {
    return { valid: false, message: "Nomor telepon harus 10-13 digit" };
  }
  
  return { valid: true };
}