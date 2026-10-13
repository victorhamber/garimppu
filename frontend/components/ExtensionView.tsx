"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, formatDateTime, type ExtensionKey, type Search } from "@/lib/api";
import { ExternalIcon } from "./ExternalIcon";

/** Set once the extension is published; until then the page offers the .zip for manual install. */
const STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_STORE_URL;
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

function KeyStep() {
  const [key, setKey] = useState<ExtensionKey | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ExtensionKey>("/api/extension/token").then(setKey).catch((e: Error) => setError(e.message));
  }, []);

  async function create() {
    if (key?.created_at && !window.confirm("A chave atual vai parar de funcionar. Gerar uma nova?")) return;
    setCreating(true);
    setError(null);
    setCopied(false);
    try {
      setKey(await api<ExtensionKey>("/api/extension/token", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!key?.token) return;
    await navigator.clipboard.writeText(key.token);
    setCopied(true);
  }

  return (
    <>
      {key?.token ? (
        <div className="flex flex-col gap-2">
          <label className="label" htmlFor="extension-key">Sua chave</label>
          <div className="flex gap-2">
            <input id="extension-key" readOnly value={key.token} onFocus={(e) => e.currentTarget.select()}
              className="field font-mono text-xs" aria-describedby="extension-key-hint" />
            <button type="button" className="btn btn-primary shrink-0" onClick={copy}>{copied ? "Copiada" : "Copiar"}</button>
          </div>
          <p id="extension-key-hint" className="text-xs text-muted">
            Ela só aparece agora. Clique no ícone do Garimppu no Chrome e cole.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {key?.created_at
            ? `Chave criada em ${formatDateTime(key.created_at)}${key.last_used_at ? `, usada pela última vez em ${formatDateTime(key.last_used_at)}` : ", ainda não usada"}.`
            : "Gere uma chave e cole no ícone do Garimppu no Chrome."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!key?.token && (
          <button type="button" className={`btn ${key?.created_at ? "" : "btn-primary"}`} onClick={create} disabled={creating || !key}>
            {creating ? "Gerando..." : key?.created_at ? "Gerar nova chave" : "Gerar chave"}
          </button>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </>
  );
}

export function ExtensionView() {
  const searchId = useSearchParams().get("busca");
  const [search, setSearch] = useState<Search | null>(null);

  useEffect(() => {
    if (!searchId) return;
    api<Search>(`/api/searches/${searchId}`).then(setSearch).catch(() => setSearch(null));
  }, [searchId]);

  const libraryUrl = search?.library_url ?? LIBRARY_URL;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mineração avançada</h1>
        <p className="mt-1 text-sm text-muted">
          Você rola a Biblioteca de Anúncios e a extensão envia cada anúncio para o Garimppu, pela sua própria conexão.
        </p>
      </div>
      <ol className="flex flex-col gap-3">
        <Step n={1} title="Instale a extensão no Chrome">
          {STORE_URL ? (
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
        <Step n={2} title="Conecte com sua chave">
          <KeyStep />
        </Step>
        <Step n={3} title={search ? `Minere "${search.term}"` : "Minere"}>
          <p className="text-sm text-muted">
            Busque uma palavra-chave e role a página. O contador no canto mostra quantos anúncios já foram enviados.
          </p>
          <a href={libraryUrl} target="_blank" rel="noopener noreferrer" className="btn w-fit gap-1">
            Abrir a Biblioteca de Anúncios<ExternalIcon />
          </a>
        </Step>
      </ol>
    </div>
  );
}
