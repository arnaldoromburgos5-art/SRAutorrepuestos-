import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/lib/catalog";
import { SimpleMarkdown } from "@/components/simple-markdown";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return { title: page?.title ?? "Página" };
}

export default async function InfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const page = await getPage((await params).slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-4 font-display text-4xl font-bold uppercase">{page.title}</h1>
      <SimpleMarkdown text={page.body} />
    </main>
  );
}
