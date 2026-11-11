"use client";

import { UserCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard } from "@/components/panel/panel-ui";
import { ChangePasswordForm } from "@/features/authentication/components/change-password-form";
import { useAuthStore } from "@/store/auth.store";
import { analyticsService } from "@/services/analytics.api.service";
import { BOOKING_CONFIG, APP_CONFIG } from "@/config/app.config";
import { rupiah } from "@/lib/business";
import type { AdminDashboardStats } from "@/types/api";

// Halaman pengaturan.

export default function AdminSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError } = useQuery<AdminDashboardStats>({
    queryKey: ["admin", "dashboard", "settings"],
    queryFn: () => analyticsService.getAdminDashboard(),
  });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Konfigurasi aplikasi" />

      <div className="grid gap-3 lg:grid-cols-2">
        <SectionCard title="Konfigurasi Booking" subtitle="Nilai terpusat (config/app.config.ts)">
          <dl className="space-y-2 text-sm">
            <Row label="Kapasitas pengunjung / hari" value={`${APP_CONFIG.dailyVisitorCapacity} orang`} />
            <Row label="Maks. hari ke depan" value={`${BOOKING_CONFIG.maxDaysAhead} hari`} />
            <Row label="Maks. tiket per jenis" value={`${BOOKING_CONFIG.maxQuantityPerTicket} tiket`} />
            <Row label="Biaya layanan" value={`${BOOKING_CONFIG.serviceFeePercent}% dari subtotal`} />
            <Row label="Kadaluarsa pembayaran" value={`${BOOKING_CONFIG.paymentExpiryMinutes} menit`} />
            <Row label="Metode pembayaran" value="QRIS (simulasi)" />
          </dl>
          <p className="mt-3 text-[11px] text-[#94A3B8]">
            Ubah nilai konfigurasi langsung di file <code className="rounded bg-[#f7fbff] px-1">config/app.config.ts</code>.
          </p>
        </SectionCard>

        <SectionCard title="Sesi Saat Ini" subtitle="Informasi sesi">
          <dl className="space-y-2 text-sm">
            <Row label="Pengguna" value={user?.name ?? "-"} />
            <Row label="Email" value={user?.email ?? "-"} />
            <Row label="Role" value={user?.role ?? "-"} />
            <Row label="Gate" value={user?.gate ?? "-"} />
          </dl>
          <div className="mt-3 flex items-center gap-2 rounded-md bg-[#f7fbff] px-3 py-2 text-xs text-[#29445e]">
            <UserCheck className="h-4 w-4 text-[#16876a]" />
            Akun staf di-provision di <code className="mx-1 rounded bg-white px-1">backend/internal/seed/seed.go</code>
          </div>
        </SectionCard>

        <SectionCard title="Keamanan Akun" subtitle="Ubah password akun admin">
          <ChangePasswordForm className="max-w-sm" />
        </SectionCard>

        <SectionCard title="Ringkasan Data" subtitle="Langsung dari backend">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-[#698097]">Memuat…</p>
          ) : isError || !data ? (
            <p className="py-6 text-center text-sm text-[#c53030]">Gagal memuat statistik.</p>
          ) : (
            <dl className="space-y-2 text-sm">
              <Row label="Total booking" value={data.total_bookings.toLocaleString("id-ID")} />
              <Row label="Tiket terjual" value={data.total_tickets_sold.toLocaleString("id-ID")} />
              <Row label="Pengunjung" value={data.total_visitors.toLocaleString("id-ID")} />
              <Row label="Tiket tersedia" value={data.tickets_available.toLocaleString("id-ID")} />
              <Row label="Petugas aktif" value={data.active_staff.toLocaleString("id-ID")} />
              <Row label="Pembayaran tertunda" value={data.pending_payments.toLocaleString("id-ID")} />
              <Row label="Pendapatan" value={rupiah(data.revenue)} />
            </dl>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[#698097]">{label}</dt>
      <dd className="text-right font-medium text-[#17324d]">{value}</dd>
    </div>
  );
}
