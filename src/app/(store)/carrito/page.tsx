import type { Metadata } from "next";
import { CartView } from "@/components/store/cart-view";

export const metadata: Metadata = { title: "Carrito" };

export default function CartPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-display text-4xl font-bold uppercase">Tu carrito</h1>
      <CartView />
    </main>
  );
}
