"use client";

import { BackLink } from "./BackLink";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, toQuery, type Collection, type OfferPage } from "@/lib/api";
import { useCollections } from "@/lib/hooks";
import { CreativeGrid } from "./CreativeGrid";
import { OfferRow } from "./OffersView";

export function CollectionDetailView() {
  const { id } = useParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [offers, setOffers] = useState<OfferPage | null>(null);
  const { collections, reload } = useCollections();

  useEffect(() => {
    api<Collection>(`/api/collections/${id}`).then(setCollection).catch(() => setCollection(null));
    api<OfferPage>(`/api/offers${toQuery({ collection_id: id, active_only: "false", limit: 200 })}`)
      .then(setOffers)
      .catch(() => setOffers(null));
  }, [id]);

  const offerItems = offers?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/colecoes">Coleções</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight">{collection?.name ?? "Coleção"}</h1>
      {offerItems.length > 0 && (
        <section aria-labelledby="col-offers" className="flex flex-col gap-3">
          <h2 id="col-offers" className="text-lg font-semibold">Ofertas</h2>
          {offerItems.map((offer, i) => (
            <OfferRow key={offer.key} offer={offer} rank={i + 1} heat={offers?.heat} collections={collections}
              onCollectionsChange={(ids) => {
                setOffers((page) => page && {
                  ...page,
                  items: ids.includes(Number(id))
                    ? page.items.map((o) => (o.key === offer.key ? { ...o, collection_ids: ids } : o))
                    : page.items.filter((o) => o.key !== offer.key),
                });
                reload();
              }} />
          ))}
        </section>
      )}
      <section aria-labelledby={offerItems.length > 0 ? "col-creatives" : undefined} className="flex flex-col gap-3">
        {offerItems.length > 0 && <h2 id="col-creatives" className="text-lg font-semibold">Criativos</h2>}
        <CreativeGrid
          filters={{ collection_id: id, active_only: "false" }}
          emptyMessage="Nenhum criativo nesta coleção. Use a estrela nos cards para salvar."
        />
      </section>
    </div>
  );
}
