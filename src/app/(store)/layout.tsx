import { Suspense } from "react";
import { connection } from "next/server";
import { getCategories, getCurrency, getPublicSettings, getVehicleSelection } from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { isStaffRole } from "@/lib/permissions";
import { StoreProvider } from "@/components/store/store-context";
import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { Toasts } from "@/components/store/ui";
import { ChatWidget } from "@/components/store/chat-widget";
import { SetupNotice } from "@/components/setup-notice";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  await connection(); // siempre dinámico: precios, stock y sesión cambian por pedido
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const [settings, categories, vehicle, currency, session] = await Promise.all([
    getPublicSettings(),
    getCategories(),
    getVehicleSelection(),
    getCurrency(),
    getSession(),
  ]);

  return (
    <StoreProvider initialVehicle={vehicle} initialCurrency={currency} rates={settings.currency.rates}>
      <Suspense>
        <Header
          categories={categories}
          phone={settings.store.phone}
          whatsapp={settings.store.whatsapp}
          isLoggedIn={!!session.user}
          isStaff={isStaffRole(session.profile?.role)}
        />
      </Suspense>
      <Toasts />
      <div className="min-h-[60vh]">{children}</div>
      <Footer settings={settings} categories={categories} />
      <ChatWidget storeName={settings.store.name} />
    </StoreProvider>
  );
}
