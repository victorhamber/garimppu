"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Search } from "@/lib/api";
import { useHasExtension } from "@/lib/hooks";
import { useAuth } from "./AuthProvider";
import { ExternalIcon } from "./ExternalIcon";

/** Chrome Web Store listing. A build can override it with NEXT_PUBLIC_EXTENSION_STORE_URL. */
const STORE_URL =
  process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ||
  "https://chromewebstore.google.com/detail/ccgeppkckiholhbiffhpofakooddefce";
const ZIP_URL = "/garimppu-extensao.zip";
const LIBRARY_URL = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-lg border border-line bg-surface p-4">
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-sm text-muted">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 className="font-semibold">{title}</h2>
        {children}
      </div>
    </li>
  );
}

export function ExtensionView() {
  const { user } = useAuth();
  const installed = useHasExtension();
  const params = useSearchParams();
  const searchId = params.get("busca");
  const [search, setSearch] = useState<Search | null>(null);

  useEffect(() => {
    if (!searchId) return;
    api<Search>(`/api/searches/${searchId}`).then(setSearch).catch(() => setSearch(null));
  }, [searchId]);

  const onde = params.get("onde");
  const asked = onde === "youtube" ? search?.youtube_url : onde === "tiktok" ? search?.tiktok_url : onde === "meta" ? search?.library_url : null;
  const pageUrl = asked
    ?? (search?.source === "youtube" ? search.youtube_url : search?.source === "tiktok" ? search.tiktok_url : search?.library_url)
    ?? LIBRARY_URL;
  const pageLabel = pageUrl.includes("youtube.com") ? "Abrir o YouTube" : pageUrl.includes("tiktok.com") ? "Abrir o TikTok" : "Abrir a Biblioteca de Anúncios";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Extensão</h1>
        <p className="mt-1 text-sm text-muted">
          Ela coleta na Biblioteca, no YouTube e no TikTok e envia para a sua conta.
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        <Step n={1} title={installed ? "Extensão instalada" : "Instale a extensão no Chrome"}>
          {installed ? (
            <p className="text-sm text-ok">O Garimppu já está no seu Chrome.</p>
          ) : STORE_URL ? (
            <a href={STORE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-fit gap-1">
              Instalar da Chrome Web Store<ExternalIcon />
            </a>
          ) : (
            <>
              <a href={ZIP_URL} download className="btn btn-primary w-fit">Baixar a extensão (.zip)</a>
              <p className="text-xs text-muted">
                Descompacte, abra <code className="font-mono text-foreground">chrome://extensions</code>, ligue o Modo do
                desenvolvedor e clique em Carregar sem compactação, escolhendo a pasta.
              </p>
            </>
          )}
        </Step>
        <Step n={2} title="Entre na extensão">
          <p className="text-sm text-muted">
            Clique no ícone do Garimppu no Chrome e entre com{" "}
            <span className="text-foreground">{user?.email ?? "seu e-mail"}</span> e sua senha do Garimppu. Assim os
            anúncios e os favoritos vão para a sua conta.
          </p>
        </Step>
        <Step n={3} title={search ? `Minere "${search.term}"` : "Minere"}>
          <p className="text-sm text-muted">
            Abra a página e clique em Ativar mineração na extensão.
          </p>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="btn w-fit gap-1">
            {pageLabel}<ExternalIcon />
          </a>
        </Step>
      </ol>
    </div>
  );
}
