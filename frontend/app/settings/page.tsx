"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Moon, ShieldAlert, Sun, Trash2, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { changePassword, updateProfile } from "@/services/auth";
import { clearHistory } from "@/services/conversions";
import { useAuthStore } from "@/store/auth";

const profileSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter.").max(80, "Nama terlalu panjang."),
  email: z.string().email("Alamat email tidak valid."),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Kata sandi saat ini wajib diisi."),
    new_password: z
      .string()
      .min(8, "Kata sandi baru minimal 8 karakter.")
      .regex(/[A-Za-z]/, "Harus mengandung huruf.")
      .regex(/\d/, "Harus mengandung angka."),
    confirm_password: z.string().min(1, "Konfirmasi kata sandi wajib diisi."),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Konfirmasi kata sandi tidak cocok.",
    path: ["confirm_password"],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { user, status, setUser, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: "", email: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (user) profileForm.reset({ name: user.name, email: user.email });
  }, [user, profileForm]);

  const profileMutation = useMutation({
    mutationFn: (values: ProfileValues) => updateProfile(values),
    onSuccess: (updated) => {
      setUser(updated);
      toast.success("Profil diperbarui.");
    },
    onError: (error: Error) => toast.error("Gagal menyimpan profil", { description: error.message }),
  });

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword({ current_password: values.current_password, new_password: values.new_password }),
    onSuccess: () => {
      passwordForm.reset();
      toast.success("Kata sandi diperbarui.");
    },
    onError: (error: Error) => toast.error("Gagal mengubah kata sandi", { description: error.message }),
  });

  const clearMutation = useMutation({
    mutationFn: clearHistory,
    onSuccess: (result) => {
      setClearOpen(false);
      toast.success(`${result.deleted} pekerjaan dihapus.`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error("Gagal menghapus riwayat", { description: error.message }),
  });

  async function handleLogout() {
    await logout();
    toast.success("Anda telah keluar.");
    router.push("/");
  }

  return (
    <div className="container max-w-4xl py-10">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pengaturan</h1>
          <p className="text-muted-foreground">Kelola profil, keamanan akun, tampilan, dan data Anda.</p>
        </div>
      </div>

      {status === "loading" && (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-52" />
        </div>
      )}

      {status === "anonymous" && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Mode tamu</CardTitle>
            <CardDescription>
              Pengaturan profil dan kata sandi memerlukan akun. Konversi dan riwayat tamu tetap berjalan di peramban ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild><Link href="/login">Masuk</Link></Button>
            <Button variant="outline" asChild><Link href="/register">Buat akun</Link></Button>
          </CardContent>
        </Card>
      )}

      {user && (
        <div className="mt-8 grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
              <CardDescription>Nama dan email yang digunakan untuk masuk.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={profileForm.handleSubmit((values) => profileMutation.mutate(values))}
                className="grid gap-4 sm:grid-cols-2"
                noValidate
              >
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" {...profileForm.register("name")} aria-invalid={Boolean(profileForm.formState.errors.name)} />
                  {profileForm.formState.errors.name && (
                    <p className="text-xs text-destructive">{profileForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" {...profileForm.register("email")} aria-invalid={Boolean(profileForm.formState.errors.email)} />
                  {profileForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{profileForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={profileMutation.isPending}>
                    {profileMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Simpan profil
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kata sandi</CardTitle>
              <CardDescription>Gunakan minimal 8 karakter dengan huruf dan angka.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
                className="grid gap-4 sm:grid-cols-2"
                noValidate
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="current_password">Kata sandi saat ini</Label>
                  <Input id="current_password" type="password" autoComplete="current-password" {...passwordForm.register("current_password")} />
                  {passwordForm.formState.errors.current_password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.current_password.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new_password">Kata sandi baru</Label>
                  <Input id="new_password" type="password" autoComplete="new-password" {...passwordForm.register("new_password")} />
                  {passwordForm.formState.errors.new_password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.new_password.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm_password">Konfirmasi kata sandi baru</Label>
                  <Input id="confirm_password" type="password" autoComplete="new-password" {...passwordForm.register("confirm_password")} />
                  {passwordForm.formState.errors.confirm_password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.confirm_password.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" variant="outline" disabled={passwordMutation.isPending}>
                    {passwordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Ubah kata sandi
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tampilan</CardTitle>
          <CardDescription>Pilih tema yang nyaman untuk mata Anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { value: "light", label: "Terang", icon: Sun },
              { value: "dark", label: "Gelap", icon: Moon },
              { value: "system", label: "Ikuti sistem", icon: Monitor },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  mounted && theme === option.value ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent"
                }`}
                aria-pressed={mounted && theme === option.value}
              >
                <option.icon className="h-4 w-4" /> {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Data & privasi
          </CardTitle>
          <CardDescription>
            Berkas masukan dihapus setelah konversi. Hasil disimpan sementara dan dihapus otomatis oleh server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" className="text-destructive" onClick={() => setClearOpen(true)}>
            <Trash2 className="h-4 w-4" /> Hapus seluruh riwayat
          </Button>
          {user && (
            <Button variant="ghost" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" /> Keluar dari akun
            </Button>
          )}
          <Button variant="link" asChild>
            <Link href="/privacy">Baca kebijakan privasi</Link>
          </Button>
        </CardContent>
      </Card>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus seluruh riwayat?</DialogTitle>
            <DialogDescription>
              Semua pekerjaan milik identitas Anda akan dihapus beserta berkas hasil dan berkas masukannya.
              Akun dan kata sandi tidak berubah.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>Batal</Button>
            <Button variant="destructive" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              {clearMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Hapus semuanya
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
