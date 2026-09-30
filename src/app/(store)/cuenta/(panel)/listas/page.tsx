import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getProductsByIds } from "@/lib/catalog";
import { formatPyg } from "@/lib/money";
import { AddListToCart, AddToListForm, CreateListForm, DeleteButton } from "@/components/store/account-forms";
import { deleteList, removeFromList } from "../../account-actions";

export const metadata: Metadata = { title: "Listas de compra" };

export default async function ListsPage() {
  const { supabase, user } = await requireUser();
  const { data: lists } = await supabase
    .from("shopping_lists")
    .select("id, name, shopping_list_items(product_id, quantity)")
    .eq("user_id", user!.id)
    .order("created_at");
  const allIds = [...new Set((lists ?? []).flatMap((l) => (l.shopping_list_items as { product_id: string }[]).map((i) => i.product_id)))];
  const products = new Map((await getProductsByIds(allIds)).map((p) => [p.id, p]));

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
        <h2 className="font-display text-2xl font-bold uppercase">Listas de compra</h2>
        <p className="mb-4 text-sm text-ink-500">Ideal para talleres: armá listas por servicio o cliente y agregalas al carrito con un clic.</p>
        <CreateListForm />
      </div>
      {(lists ?? []).map((list) => {
        const items = (list.shopping_list_items as { product_id: string; quantity: number }[])
          .map((i) => ({ item: products.get(i.product_id)!, quantity: i.quantity }))
          .filter((i) => i.item);
        const total = items.reduce((s, i) => s + Number(i.item.final_price) * i.quantity, 0);
        return (
          <div key={list.id} className="space-y-3 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-xl font-bold">{list.name}</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-500">{formatPyg(total)}</span>
                <AddListToCart items={items} />
                <DeleteButton action={deleteList.bind(null, list.id)} />
              </div>
            </div>
            <ul className="divide-y divide-ink-100 text-sm">
              {items.map(({ item, quantity }) => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <span className="w-8 font-semibold">{quantity}×</span>
                  <Link href={`/producto/${item.slug}`} className="flex-1 hover:text-accent-600">{item.name}</Link>
                  <span className="text-ink-400">{item.sku}</span>
                  <span className={item.available > 0 ? "text-ok-600" : "text-bad-600"}>{item.available > 0 ? "Stock" : "Sin stock"}</span>
                  <DeleteButton action={removeFromList.bind(null, list.id, item.id)} />
                </li>
              ))}
            </ul>
            <AddToListForm listId={list.id} />
          </div>
        );
      })}
    </section>
  );
}
